/**
 * Represents rate limit information for a resource.
 */
export interface RL {
    limit: number | null
    remaining: number | null
    resource: string | null
    reset: number | null
    used: number | null
    
    update: (headers: Headers) => void
}

export interface Logger {
    info: typeof console.info
    warn: typeof console.warn
}

export interface Snapshot {
    limit: number | null
    remaining: number | null
    resource: string | null
    reset: number | null
    used: number | null
}

function numberOrNull(
    value: string,
    logger: Logger,
    header: string
): number | null {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    
    logger.warn("Invalid ratelimit header number.", {header, value});
    return null;
}

/**
 * Parse known GitHub rate limit headers from a `Headers` instance.
 *
 * This intentionally returns a *partial* update because not all responses
 * include all rate limit headers. Callers that maintain state should only
 * overwrite fields when the corresponding header is present.
 */
export function parse(headers: Headers, logger: Logger = console): Partial<Snapshot> {
    const next: Partial<Snapshot> = {};
    
    const limit = headers.get("x-ratelimit-limit");
    if (limit !== null) next.limit = numberOrNull(limit, logger, "x-ratelimit-limit");
    
    const remaining = headers.get("x-ratelimit-remaining");
    if (remaining !== null) next.remaining = numberOrNull(remaining, logger, "x-ratelimit-remaining");
    
    const resource = headers.get("x-ratelimit-resource");
    if (resource !== null) next.resource = resource;
    
    const reset = headers.get("x-ratelimit-reset");
    if (reset !== null) next.reset = numberOrNull(reset, logger, "x-ratelimit-reset");
    
    const used = headers.get("x-ratelimit-used");
    if (used !== null) next.used = numberOrNull(used, logger, "x-ratelimit-used");
    
    return next;
}

/**
 * Represents rate limit information for an API or service.
 * Used to track the current rate limit status, including the total limit,
 * remaining requests, resource type, reset time, and used requests.
 *
 * @property {number|null} limit - The maximum number of requests allowed during the time window.
 * If null, it indicates the rate limit is undefined or not applicable.
 *
 * @property {number|null} remaining - The number of requests still available in the current time window.
 * If null, it indicates the remaining value is not defined.
 *
 * @property {string|null} resource - The resource or endpoint this rate limit information applies to.
 * If null, it indicates the resource is unspecified.
 *
 * @property {number|null} reset - The timestamp (in seconds since the epoch) when the rate limit resets.
 * If null, it indicates the reset time is not defined.
 *
 * @property {number|null} used - The number of requests already made in the current time window.
 * If null, it indicates the used value is not defined.
 */
export function create(logger: Logger = console): RL {
    const state: RL = {
        limit: null,
        remaining: null,
        resource: null,
        reset: null,
        used: null,
        
        update: (headers: Headers) => {
            const next = parse(headers, logger);
            const updated = Object.keys(next).length > 0;
            if (!updated) return;
            
            Object.assign(state, next);
            logger.info("Rate Limit Status", {ratelimit: state});
        }
    };
    
    return state;
}

export const RL: RL = create();

export default RL;
