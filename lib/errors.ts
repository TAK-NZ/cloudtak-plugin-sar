import type { CalcError, ErrorKind } from './types.ts';

export const MESSAGE_UNAVAILABLE = 'SAR planning is unavailable. Contact your administrator.';
export const MESSAGE_TIMEOUT = 'The calculation took too long. Try a smaller radius.';
export const MESSAGE_FAILED = 'Analysis failed. Try again, or try a smaller area.';
export const MESSAGE_INVALID = 'The values were not accepted. Check the start point and the settings.';
export const MESSAGE_NETWORK = 'Could not reach the server. Check your connection and try again.';
export const MESSAGE_CANCELLED = 'Calculation cancelled.';

/** The text for an error. The server's own message (422) is returned exactly as received. */
export function describeError(error: CalcError): string {
    switch (error.kind) {
        case 'unavailable': return MESSAGE_UNAVAILABLE;
        case 'timeout': return MESSAGE_TIMEOUT;
        case 'busy': {
            const n = error.retryAfterS;
            if (n === undefined) return 'Too many requests. Wait a moment and try again.';
            return `Too many requests. Try again in ${n} ${n === 1 ? 'second' : 'seconds'}.`;
        }
        case 'rejected': return typeof error.message === 'string' && error.message !== '' ? error.message : MESSAGE_FAILED;
        case 'invalid': return MESSAGE_INVALID;
        case 'network': return MESSAGE_NETWORK;
        case 'cancelled': return MESSAGE_CANCELLED;
        default: return MESSAGE_FAILED;
    }
}

/** Errors where the same request may work if sent again. */
export function isRetryable(kind: ErrorKind): boolean {
    return kind === 'timeout' || kind === 'network' || kind === 'failed' || kind === 'busy';
}
