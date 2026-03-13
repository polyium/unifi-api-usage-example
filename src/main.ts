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

type JSONPrimitive = boolean | null | number | string;
type JSONValue = JSONPrimitive | JSONArray | JSONObject;
type JSONArray = JSONValue[];
type JSONObject = {
    [key: string]: JSONValue,
};

type RequestContext = {
    agent?: HTTPS.Agent,
    headers: Record<string, string>,
    servername?: string,
    url: URL,
};

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

function buildSitesURL(): URL {
    const url = new URL(`https://${UNIFI_HOST}${SITES_PATHNAME}`);

    url.searchParams.set("offset", Utilities.format("%d", 0));
    url.searchParams.set("limit", Utilities.format("%d", 0));
    url.searchParams.set("filter", "");

    return url;
}

function buildRequestHeaders(token: string): Record<string, string> {
    return {
        "Accept": "application/json",
        "X-API-Key": token,
    };
}

function extractErrorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null || !("code" in error)) {
        return null;
    }

    const {code} = error as {code?: unknown};

    return typeof code === "string" ? code : null;
}

function isTLSVerificationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const code = extractErrorCode(error);
    const details = `${error.message} ${Utilities.inspect(error.cause)}`;

    return [
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "ERR_TLS_CERT_ALTNAME_INVALID",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    ].includes(code ?? "") || details.includes("self-signed certificate");
}

function serializeCertificate(rawCertificate: Buffer): string {
    const encodedCertificate = rawCertificate.toString("base64");
    const lines = encodedCertificate.match(/.{1,64}/g) ?? [];

    return [
        "-----BEGIN CERTIFICATE-----",
        ...lines,
        "-----END CERTIFICATE-----",
        "",
    ].join("\n");
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
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

function certificateDNSNames(certificate: TLS.PeerCertificate): string[] {
    if (typeof certificate.subjectaltname !== "string") {
        return [];
    }

    return uniqueNames(
        Array.from(
            certificate.subjectaltname.matchAll(/DNS:([^,]+)/g),
            (match: RegExpMatchArray) => match[1]
        )
    );
}

function selectServername(hostname: string, certificate: TLS.PeerCertificate): string {
    const commonName = typeof certificate.subject?.CN === "string"
        ? certificate.subject.CN
        : null;
    const dnsNames = certificateDNSNames(certificate);

    if (dnsNames.includes(hostname) || commonName === hostname) {
        return hostname;
    }

    return uniqueNames([...dnsNames, commonName, hostname])[0] ?? hostname;
}

function request(context: RequestContext): Promise<HTTPResponse> {
    return new Promise((resolve, reject) => {
        const options: HTTPS.RequestOptions = {
            headers: context.headers,
            hostname: context.url.hostname,
            method: "GET",
            path: `${context.url.pathname}${context.url.search}`,
            port: context.url.port === "" ? UNIFI_PORT : Number(context.url.port),
            protocol: context.url.protocol,
        };

        if (context.agent !== undefined) {
            options.agent = context.agent;
        }

        if (context.servername !== undefined) {
            options.servername = context.servername;
        }

        const outgoingRequest = HTTPS.request(options, (incomingResponse) => {
            const chunks: string[] = [];

            incomingResponse.setEncoding("utf8");
            incomingResponse.on("data", (chunk: string) => {
                chunks.push(chunk);
            });
            incomingResponse.once("end", () => {
                resolve({
                    body: chunks.join(""),
                    headers: incomingResponse.headers,
                    statusCode: incomingResponse.statusCode ?? 0,
                    statusMessage: incomingResponse.statusMessage ?? "",
                });
            });
            incomingResponse.once("error", reject);
        });

        outgoingRequest.once("error", reject);
        outgoingRequest.end();
    });
}

function collectPeerTrust(hostname: string): Promise<{agent: HTTPS.Agent, servername: string}> {
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

                const servername = selectServername(hostname, certificate);
                const agent = new HTTPS.Agent({
                    ca: serializeCertificate(certificate.raw),
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

async function requestSites(token: string): Promise<HTTPResponse> {
    const context: RequestContext = {
        headers: buildRequestHeaders(token),
        url: buildSitesURL(),
    };

    try {
        return await request(context);
    } catch (error: unknown) {
        if (!isTLSVerificationError(error)) {
            throw error;
        }

        const trust = await collectPeerTrust(context.url.hostname);

        return request({
            ...context,
            agent: trust.agent,
            servername: trust.servername,
        });
    }
}

async function sites() {
    const {"api-key": token} = configuration;
    const response = await requestSites(token);

    if (response.statusCode < 200 || response.statusCode >= 300) {
        console.error("UniFi API request failed.");
        console.error(Utilities.inspect(response, {depth: null}));

        return;
    }

    const contentTypeHeader = response.headers["content-type"];
    const contentType = Array.isArray(contentTypeHeader)
        ? contentTypeHeader.join(", ")
        : contentTypeHeader ?? "unknown";
    let data: JSONValue | null = null;

    if (!(response.body)) {
        console.warn("UniFi API response body was empty.");
    } else {
        try {
            data = JSON.parse(response.body) as JSONValue;
        } catch (error: unknown) {
            console.error("Failed to parse the UniFi API response body as JSON.");
            console.error(Utilities.inspect({
                body: response.body,
                contentType,
                error,
                statusCode: response.statusCode,
            }, {depth: null}));

            throw error;
        }
    }

    console.info(`Parsed UniFi API response body. content-type=${contentType}`);

    console.log({data});
}

/**
 * Main entry point for the application.
 */
async function main() {
    emitter.emit("setup");

    await sites();
}

/**
 * Exported function reference to the main application entry point.
 *
 * @see {@link main}
 */
export const CLI: Promise<void> = main().catch(console.error);

export default CLI;
