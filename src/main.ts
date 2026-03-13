import * as Events from "node:events";
import type { IncomingHttpHeaders } from "node:http";
import * as HTTPS from "node:https";
import * as TLS from "node:tls";
import * as Utilities from "node:util";

import * as Runtime from "../runtime.json" with {type: "json"};

const configuration: typeof Runtime.default = Runtime.default;
const UNIFI_HOST = "unifi";
const UNIFI_PORT = 443;
const SITES_PATHNAME = "/proxy/network/integration/v1/sites";

type HTTPResponse = {
    body: string,
    headers: IncomingHttpHeaders,
    statusCode: number,
    statusMessage: string,
};

namespace Inputs {
    export namespace Request {
        export interface Context {
            agent?: HTTPS.Agent | undefined;
            body?: string
            headers: Record<string, string>;
            servername?: string | undefined;
            url: URL;
            method: string;
        }
    }
}

namespace Sites {
    export interface Status {
        message?: string | undefined;
        code?: number | undefined;
    }
    
    export interface Response {
        body: string;
        headers: IncomingHttpHeaders;
        status: Status;
    }
    
    export interface Input {
        agent?: HTTPS.Agent | undefined;
        body?: string
        headers: Record<string, string>;
        servername?: string | undefined;
        url: URL;
        method: string;
    }
    
    function url(hostname: string = "unifi", pathname: string = "/proxy/network/integration/v1/sites"): URL {
        const url = new URL(Utilities.format("https://%s/%s", hostname, pathname));
        
        url.searchParams.set("offset", Utilities.format("%d", 0));
        url.searchParams.set("limit", Utilities.format("%d", 0));
        url.searchParams.set("filter", "");
        
        return url;
    }
    
    function headers(token: string): Record<string, string> {
        return {
            "Accept": "application/json",
            "X-API-Key": token,
        };
    }
    
    function request(ctx: Input): Promise<Response> {
        return new Promise((resolve, reject) => {
            const options: HTTPS.RequestOptions = {
                headers: ctx.headers,
                hostname: ctx.url.hostname,
                method: ctx.method,
                path: `${ctx.url.pathname}${ctx.url.search}`,
                port: ctx.url.port === "" ? 443 : Number(ctx.url.port),
                protocol: ctx.url.protocol,
            };
            
            ctx.agent ??= ctx.agent;
            ctx.servername ??= ctx.servername;
            
            // The transient http(s) client-request and the transient http(s) server-response.
            const request = HTTPS.request(options, (response) => {
                const chunks: string[] = [];
                
                response.setEncoding("utf8");
                
                response.on("data", (chunk: string) => {
                    chunks.push(chunk);
                });
                
                response.once("end", () => {
                    const body = chunks.join("");
                    
                    const { headers } = response;
                    
                    const { statusCode: code, statusMessage: message} = response;
                    
                    const status: Status = {
                        message, code
                    }
                    
                    resolve({
                        body,
                        headers,
                        status
                    });
                });
                
                response.once("error", reject);
            });
            
            request.once("error", reject);
            
            request.end();
        });
    }

    async function get(token: string): Promise<Response> {
        const context: Input = {
            headers: headers(token),
            url: url(),
            method: "GET",
        };
        
        try {
            return await request(context);
        } catch (error: Error | unknown) {
            if (error instanceof Error) {
                const details = Utilities.inspect(error.cause)
                
                // For self-signed certificate-related errors, handle and continue execution.
                if (details.includes("self-signed certificate")) {
                    const trust = await Certificate.resolve(context.url.hostname);
                    
                    return request({
                        ...context,
                        agent: trust.agent,
                        servername: trust.servername,
                    });
                }
                
                console.error("A fatal, unhandled error has occurred while calling the sites api endpoint.", { error: Utilities.inspect({error}) });
                
                process.exit(1);
            }
            
            console.error("Unknown error of an unknown type has occurred while calling the sites api endpoint.", { error: Utilities.inspect({error}) });
            
            process.exit(1);
        }
    }
    
    export async function constructor() {
        const {"api-key": token} = configuration;
        const response = await get(token);
        
        // Typecheck workaround via nullish-coalescing.
        response.status.code ??= -1;
        
        if (response.status?.code < 200 || response.status?.code >= 300) {
            console.error("UniFi API request failed.");
            console.error(Utilities.inspect(response, {depth: null}));
            
            process.exit(1);
        }
        
        if (!(response.body)) {
            console.error("Unexpectedly received an empty API response body from the UniFi API.", { url: url(), response });
            
            process.exit(1);
        }
        
        const data = JSON.parse(response.body);
        if (typeof data !== "object" || data === null) {
            console.error("Unexpectedly received an invalid API response body from the UniFi API.", { url: url(), response });
            
            process.exit(1);
        }
        
        console.log({data});
    }
}


/**
 * EventEmitter instance responsible for orchestrating application lifecycle events.
 */
const emitter = new Events.EventEmitter();

emitter.on("signal-handler", () => {
    process.once("SIGINT", () => {
        process.stdout.write("\r\n");

        console.log("Received SIGINT (Ctrl+C). Performing graceful cancellation ...");

        process.exit(0);
    });
});

emitter.on("setup", () => {
    emitter.emit("signal-handler");
});

/**
 * Retrieves the unique DNS names from the given array of strings.
 *
 * @param {Array<string | null | undefined>} values
 * @returns {string[]}
 */
function unique(values: Array<string | null | undefined>): string[] {
    const unique = new Set<string>();
    
    for (const value of values) {
        if (typeof value !== "string") {
            continue;
        }
        
        const trimmed = value.trim();
        
        if (trimmed === "") {
            continue;
        }
        
        unique.add(trimmed);
    }
    
    return Array.from(unique);
}

namespace Certificate {
    /**
     * Resolves the certificate's DNS names from the given peer certificate.
     *
     * @param {TLS.PeerCertificate} certificate
     * @returns {string[]}
     */
    function peers(certificate: TLS.PeerCertificate): string[] {
        if (typeof certificate.subjectaltname !== "string") {
            return [];
        }
        
        return unique(
            Array.from(
                certificate.subjectaltname.matchAll(/DNS:([^,]+)/g),
                (match: RegExpMatchArray) => match[1]
            )
        );
    }
    
    /**
     * Determines the appropriate server name to use based on the given hostname and peer certificate.
     *
     * This function validates whether the provided hostname matches any of the DNS names in the certificate's
     * Subject Alternative Names (SANs) or the Common Name (CN) in the certificate's subject. If a match is found,
     * the original hostname is returned. Otherwise, it returns the first unique DNS name from the certificate,
     * falling back to the hostname if no valid names are available.
     *
     * @param {string} hostname - The hostname to validate against the certificate.
     * @param {TLS.PeerCertificate} certificate - The peer certificate containing DNS names and subject information.
     * @returns {string} The validated hostname if it matches a certificate DNS name, otherwise the first available
     *                   unique DNS name from the certificate, or the original hostname as a fallback.
     */
    function lookup(hostname: string, certificate: TLS.PeerCertificate): string {
        // The DNS "common-name" 
        const common = typeof certificate.subject?.CN === "string"
            ? certificate.subject.CN
            : null;
        
        // The DNS names from the certificate's subject alternative names.
        const names = peers(certificate);
        
        if (names.includes(hostname) || common === hostname) {
            return hostname;
        }
        
        return unique([...names, common, hostname])[0] ?? hostname;
    }
    
    /**
     * Converts a raw certificate buffer into PEM (Privacy-Enhanced Mail) format.
     *
     * This function takes a binary certificate buffer, encodes it as base64, and formats it
     * according to the PEM standard by wrapping it with BEGIN/END certificate markers and
     * splitting the base64 content into 64-character lines.
     *
     * @param {Buffer} raw - The raw certificate buffer to serialize.
     * @returns {string} The PEM-formatted certificate string with proper headers, footers, and line breaks.
     */
    function serialize(raw: Buffer): string {
        const encoded = raw.toString("base64");
        const lines = encoded.match(/.{1,64}/g) ?? [];
        
        return [
            "-----BEGIN CERTIFICATE-----",
            ...lines,
            "-----END CERTIFICATE-----",
            "",
        ].join("\n");
    }
    
    /**
     * Establishes a TLS connection to retrieve and validate the peer certificate, then creates
     * an HTTPS agent configured to trust that certificate.
     *
     * This function connects to the specified hostname over TLS, retrieves the server's certificate,
     * and creates an HTTPS agent that trusts that specific certificate. It also determines the
     * appropriate server name (SNI) to use based on the certificate's DNS names. This is particularly
     * useful for working with self-signed certificates or custom certificate authorities.
     *
     * The connection is made with `rejectUnauthorized: false` to allow retrieval of self-signed
     * certificates, but the resulting agent will only trust the specific certificate obtained.
     *
     * @param {string} hostname - The hostname of the server to connect to and retrieve the certificate from.
     * @returns {Promise<{ agent: HTTPS.Agent, servername: string }>} A promise that resolves to an object containing:
     *   - `agent`: An HTTPS.Agent configured with the peer's certificate as a trusted CA
     *   - `servername`: The validated server name (SNI) to use for subsequent connections
     * @throws {Error} If the TLS connection fails, the certificate cannot be retrieved, or the certificate data is invalid.
     */
    export function resolve(hostname: string): Promise<{ agent: HTTPS.Agent, servername: string }> {
        return new Promise((resolve, reject) => {
            const socket = TLS.connect({
                host: hostname,
                port: UNIFI_PORT,
                rejectUnauthorized: false,
                servername: hostname,
            });
            
            const fail = (error: Error) => {
                socket.destroy();
                
                reject(error);
            };
            
            socket.once("error", fail);
            socket.once("secureConnect", () => {
                try {
                    const certificate = socket.getPeerCertificate(true);
                    
                    socket.removeListener("error", fail);
                    socket.end();
                    
                    if (!Buffer.isBuffer(certificate.raw) || certificate.raw.length === 0) {
                        throw new Error("Failed to read the peer certificate from the UniFi endpoint.");
                    }
                    
                    const servername = lookup(hostname, certificate);
                    const agent = new HTTPS.Agent({
                        ca: serialize(certificate.raw),
                        servername,
                    });
                    
                    resolve({
                        agent,
                        servername,
                    });
                } catch (error: unknown) {
                    fail(error instanceof Error ? error : new Error(String(error)));
                }
            });
        });
    }
}

/**
 * Main entry point for the application.
 */
async function main() {
    emitter.emit("setup");

    await Sites.constructor();
}

/**
 * Exported function reference to the main application entry point.
 *
 * @see {@link main}
 */
export const CLI: Promise<void> = main().catch(console.error);

export default CLI;
