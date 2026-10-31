import type { CalcError, CalcOutcome, Host, RelayStatus, Suggestions, TravelTimeBody } from './types.ts';
import {
    API_VERSIONS_SUPPORTED, CALCULATE_TIMEOUT_MS, CODE_AREA_TOO_DENSE, STATUS_PATH, STATUS_TIMEOUT_MS, TRAVEL_TIME_PATH,
} from './constants.ts';
import { isBandHours, isRadius } from './validation.ts';
import { parseResult } from './result.ts';

export type StatusReason = 'ok' | 'disabled' | 'unauthorized' | 'unreachable' | 'incompatible';

export interface StatusResult {
    status: RelayStatus | null;
    reason: StatusReason;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseStatus(raw: unknown): RelayStatus | null {
    if (!isObject(raw)) return null;
    if (typeof raw.apiVersion !== 'number' || !Number.isInteger(raw.apiVersion)) return null;
    if (typeof raw.enabled !== 'boolean') return null;
    return { apiVersion: raw.apiVersion, enabled: raw.enabled };
}

async function readToken(host: Host): Promise<string | undefined> {
    try {
        return (await host.token()) || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Ask the CloudTAK server whether the SAR relay is available. Never throws.
 */
export async function fetchStatus(host: Host): Promise<StatusResult> {
    const token = await readToken(host);
    if (!token) return { status: null, reason: 'unauthorized' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), STATUS_TIMEOUT_MS);
    try {
        const res = await host.fetch(host.origin() + STATUS_PATH, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: ctl.signal,
        });
        if (res.status === 401 || res.status === 403) return { status: null, reason: 'unauthorized' };
        if (!res.ok) return { status: null, reason: 'unreachable' };
        let raw: unknown;
        try {
            raw = await res.json();
        } catch {
            return { status: null, reason: 'unreachable' };
        }
        const status = parseStatus(raw);
        if (!status) return { status: null, reason: 'unreachable' };
        if (!API_VERSIONS_SUPPORTED.includes(status.apiVersion)) return { status, reason: 'incompatible' };
        if (!status.enabled) return { status, reason: 'disabled' };
        return { status, reason: 'ok' };
    } catch {
        return { status: null, reason: 'unreachable' };
    } finally {
        clearTimeout(timer);
    }
}

/** Whole seconds from a Retry-After header (1 to 3600), else undefined. Dates are not used. */
function retryAfter(res: Response): number | undefined {
    let raw: string | null | undefined;
    try {
        raw = res.headers?.get('Retry-After');
    } catch {
        return undefined;
    }
    if (typeof raw !== 'string' || !/^\d{1,5}$/.test(raw.trim())) return undefined;
    const n = Number(raw.trim());
    return n >= 1 && n <= 3600 ? n : undefined;
}

/**
 * Suggestions from a dense-area refusal. A value that is not a finite number, or is outside
 * the plugin's input limits (radius 1 to 30 km, band 0.25 to 24 h), is dropped. Values are
 * never clamped: a clamped number would be a suggestion of our own.
 */
export function parseSuggestions(json: Record<string, unknown>): Suggestions | undefined {
    const out: Suggestions = {};
    if (isRadius(json.suggested_radius_km)) out.radiusKm = json.suggested_radius_km;
    if (isBandHours(json.suggested_max_hours)) out.maxHours = json.suggested_max_hours;
    return out.radiusKm !== undefined || out.maxHours !== undefined ? out : undefined;
}

const CODE = /^[a-z0-9_]{1,64}$/;

function rejected(json: unknown): CalcError {
    if (!isObject(json) || typeof json.message !== 'string' || json.message === '') return { kind: 'failed', status: 422 };
    const error: CalcError = { kind: 'rejected', status: 422, message: json.message };
    // A 422 without a code is another refusal (for example a start point in the sea): no suggestions.
    if (typeof json.code === 'string' && CODE.test(json.code)) {
        error.code = json.code;
        if (json.code === CODE_AREA_TOO_DENSE) {
            const suggestions = parseSuggestions(json);
            if (suggestions) error.suggestions = suggestions;
        }
    }
    return error;
}

function classify(res: Response, json: unknown): CalcOutcome {
    const status = res.status;
    if (status === 200) {
        const result = parseResult(json);
        return result ? { ok: true, result } : { ok: false, error: { kind: 'failed', status } };
    }
    const fail = (error: CalcError): CalcOutcome => ({ ok: false, error: { status, ...error } });
    if (status === 422) return { ok: false, error: rejected(json) };
    if (status === 400 || status === 413) return fail({ kind: 'invalid' });
    if (status === 401 || status === 403 || status === 404) return fail({ kind: 'unavailable' });
    if (status === 429) return fail({ kind: 'busy', retryAfterS: retryAfter(res) });
    if (status === 504) return fail({ kind: 'timeout', retryAfterS: retryAfter(res) });
    // The relay answers 502 with JSON when the engine is unavailable. A gateway page (HTML) in front of it means a timeout.
    if (status === 502 || status === 503) return isObject(json) ? fail({ kind: 'unavailable' }) : fail({ kind: 'timeout' });
    return fail({ kind: 'failed' });
}

/**
 * Run one travel-time calculation through the relay. Never throws.
 * `signal` is the user's cancel; our own timeout is separate and gives `timeout`.
 */
export async function calculate(host: Host, body: TravelTimeBody, signal?: AbortSignal, timeoutMs: number = CALCULATE_TIMEOUT_MS): Promise<CalcOutcome> {
    if (signal?.aborted) return { ok: false, error: { kind: 'cancelled' } };
    const token = await readToken(host);
    if (!token) return { ok: false, error: { kind: 'unavailable', status: 401 } };
    if (signal?.aborted) return { ok: false, error: { kind: 'cancelled' } };
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        ctl.abort();
    }, timeoutMs);
    const onAbort = (): void => ctl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        const res = await host.fetch(host.origin() + TRAVEL_TIME_PATH, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: ctl.signal,
        });
        let json: unknown;
        try {
            json = JSON.parse(await res.text());
        } catch {
            if (ctl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            json = undefined;
        }
        return classify(res, json);
    } catch {
        if (signal?.aborted) return { ok: false, error: { kind: 'cancelled' } };
        return { ok: false, error: { kind: timedOut ? 'timeout' : 'network' } };
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
