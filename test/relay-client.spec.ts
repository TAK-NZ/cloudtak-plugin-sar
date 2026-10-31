import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculate, fetchStatus, parseSuggestions, parseStatus, tarrAvailable } from '../lib/relay-client.ts';
import type { CalcRequest, Host, TarrBody, TravelTimeBody } from '../lib/types.ts';
import { htmlResponse, jsonResponse, okBody, tarrBody } from './fixtures.ts';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function makeHost(fetchImpl: FetchFn, token: string | undefined | (() => Promise<string | undefined>) = 'test-token-value'): Host & { fetch: ReturnType<typeof vi.fn> } {
    return {
        origin: () => 'https://cloudtak.example',
        token: typeof token === 'function' ? token : async () => token,
        fetch: vi.fn(fetchImpl),
    };
}

const body: TravelTimeBody = { ipp: { lat: -40, lng: 172 }, speed_kmh: 2.5, intervals_hours: [1, 2], radius_km: 10 };
const request: CalcRequest = { mode: 'travel-time', body };
const tarrReq: TarrBody = { ipp: { lat: -40, lng: 172 }, profile: 'Hiker' };

afterEach(() => {
    vi.useRealTimers();
});

describe('fetchStatus', () => {
    it('is ok when enabled with a supported version', async () => {
        const host = makeHost(async () => jsonResponse(200, { apiVersion: 1, enabled: true }));
        expect(await fetchStatus(host)).toEqual({ status: { apiVersion: 1, enabled: true }, reason: 'ok' });
        const [url, init] = host.fetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://cloudtak.example/api/sar/status');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token-value');
    });
    it('is disabled when the relay says so', async () => {
        const host = makeHost(async () => jsonResponse(200, { apiVersion: 1, enabled: false }));
        expect((await fetchStatus(host)).reason).toBe('disabled');
    });
    it('is incompatible for an unknown major version', async () => {
        const host = makeHost(async () => jsonResponse(200, { apiVersion: 2, enabled: true }));
        expect((await fetchStatus(host)).reason).toBe('incompatible');
    });
    it('is unauthorized without a token or with 401 and 403', async () => {
        expect((await fetchStatus(makeHost(async () => jsonResponse(200, {}), ''))).reason).toBe('unauthorized');
        expect((await fetchStatus(makeHost(async () => jsonResponse(200, {}), async () => { throw new Error('no'); }))).reason).toBe('unauthorized');
        expect((await fetchStatus(makeHost(async () => jsonResponse(401, {})))).reason).toBe('unauthorized');
        expect((await fetchStatus(makeHost(async () => jsonResponse(403, {})))).reason).toBe('unauthorized');
    });
    it('is unreachable for 404, 5xx, HTML, bad shapes and network errors, and never throws', async () => {
        const cases: FetchFn[] = [
            async () => jsonResponse(404, {}),
            async () => jsonResponse(500, {}),
            async () => htmlResponse(502),
            async () => htmlResponse(200),
            async () => jsonResponse(200, { apiVersion: '1', enabled: true }),
            async () => jsonResponse(200, { apiVersion: 1, enabled: 'yes' }),
            async () => jsonResponse(200, []),
            async () => { throw new TypeError('Failed to fetch'); },
        ];
        for (const impl of cases) expect((await fetchStatus(makeHost(impl))).reason).toBe('unreachable');
    });
    it('gives up after its timeout', async () => {
        vi.useFakeTimers();
        const host = makeHost((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        const p = fetchStatus(host);
        await vi.advanceTimersByTimeAsync(8001);
        expect((await p).reason).toBe('unreachable');
    });
});

describe('calculate: success', () => {
    it('posts the body with the Bearer token and parses the result', async () => {
        const host = makeHost(async () => jsonResponse(200, okBody()));
        const out = await calculate(host, request);
        expect(out.ok).toBe(true);
        if (out.ok && out.result.mode === 'travel-time') expect(out.result.contours).toHaveLength(3);
        const [url, init] = host.fetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://cloudtak.example/api/sar/travel-time');
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token-value');
        expect(JSON.parse(init.body as string)).toEqual(body);
    });
    it('treats a 200 with a wrong shape or HTML as a failure', async () => {
        for (const res of [jsonResponse(200, { status: 'ok' }), htmlResponse(200), jsonResponse(200, [])]) {
            const out = await calculate(makeHost(async () => res), request);
            expect(out).toEqual({ ok: false, error: { kind: 'failed', status: 200 } });
        }
    });
});

describe('status modes', () => {
    it('reads the modes list and knows when TARR is available', async () => {
        const host = makeHost(async () => jsonResponse(200, { apiVersion: 1, enabled: true, modes: ['travel-time', 'tarr'] }));
        const { status } = await fetchStatus(host);
        expect(status?.modes).toEqual(['travel-time', 'tarr']);
        expect(tarrAvailable(status)).toBe(true);
    });
    it('treats a relay without modes as travel time only', () => {
        const status = parseStatus({ apiVersion: 1, enabled: true });
        expect(status?.modes).toBeUndefined();
        expect(tarrAvailable(status)).toBe(false);
        expect(tarrAvailable(null)).toBe(false);
        expect(tarrAvailable(parseStatus({ apiVersion: 1, enabled: true, modes: ['travel-time'] }))).toBe(false);
    });
    it('keeps only text entries of the modes list', () => {
        expect(parseStatus({ apiVersion: 1, enabled: true, modes: ['tarr', 3, null] })?.modes).toEqual(['tarr']);
        expect(parseStatus({ apiVersion: 1, enabled: true, modes: 'tarr' })?.modes).toBeUndefined();
    });
});

describe('calculate: TARR', () => {
    it('posts the TARR body to /api/sar/tarr with the Bearer token and parses the rings', async () => {
        const host = makeHost(async () => jsonResponse(200, tarrBody()));
        const out = await calculate(host, { mode: 'tarr', body: tarrReq });
        expect(out.ok).toBe(true);
        if (out.ok && out.result.mode === 'tarr') expect(out.result.rings).toHaveLength(6);
        const [url, init] = host.fetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://cloudtak.example/api/sar/tarr');
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token-value');
        expect(JSON.parse(init.body as string)).toEqual(tarrReq);
    });
    it('treats a travel-time answer to a TARR request, and the reverse, as a failure', async () => {
        expect(await calculate(makeHost(async () => jsonResponse(200, okBody())), { mode: 'tarr', body: tarrReq }))
            .toEqual({ ok: false, error: { kind: 'failed', status: 200 } });
        expect(await calculate(makeHost(async () => jsonResponse(200, tarrBody())), request))
            .toEqual({ ok: false, error: { kind: 'failed', status: 200 } });
    });
    it('classifies errors the same way as for travel time', async () => {
        const kind = async (res: Response): Promise<unknown> => {
            const out = await calculate(makeHost(async () => res), { mode: 'tarr', body: tarrReq });
            return out.ok ? 'ok' : out.error;
        };
        expect(await kind(jsonResponse(400, {}))).toEqual({ kind: 'invalid', status: 400 });
        expect(await kind(jsonResponse(429, {}, { 'Retry-After': '7' }))).toEqual({ kind: 'busy', status: 429, retryAfterS: 7 });
        expect(await kind(jsonResponse(502, { status: 502 }))).toEqual({ kind: 'unavailable', status: 502 });
        expect(await kind(jsonResponse(504, {}))).toMatchObject({ kind: 'timeout', status: 504 });
        expect(await kind(jsonResponse(422, { message: 'Sea.' }))).toEqual({ kind: 'rejected', status: 422, message: 'Sea.' });
        // The dense-area refusal of TARR has a code and no suggestions: no buttons.
        expect(await kind(jsonResponse(422, { code: 'area_too_dense', message: 'Dense.' })))
            .toEqual({ kind: 'rejected', status: 422, message: 'Dense.', code: 'area_too_dense' });
    });
});

describe('calculate: errors', () => {
    const kindOf = async (res: Response | (() => Promise<Response>)): Promise<unknown> => {
        const out = await calculate(makeHost(typeof res === 'function' ? res : async () => res), request);
        return out.ok ? 'ok' : out.error;
    };

    it('maps 401, 403 and 404 to unavailable', async () => {
        for (const s of [401, 403, 404]) expect(await kindOf(jsonResponse(s, { message: 'x' }))).toMatchObject({ kind: 'unavailable', status: s });
    });
    it('is unavailable without a token and sends nothing', async () => {
        const host = makeHost(async () => jsonResponse(200, okBody()), '');
        expect(await calculate(host, request)).toEqual({ ok: false, error: { kind: 'unavailable', status: 401 } });
        expect(host.fetch).not.toHaveBeenCalled();
    });
    it('maps 400 and 413 to invalid', async () => {
        expect(await kindOf(jsonResponse(400, { message: 'x' }))).toMatchObject({ kind: 'invalid', status: 400 });
        expect(await kindOf(jsonResponse(413, { message: 'x' }))).toMatchObject({ kind: 'invalid', status: 413 });
    });
    it('maps 429 to busy with Retry-After', async () => {
        expect(await kindOf(jsonResponse(429, { message: 'x' }, { 'Retry-After': '21' }))).toEqual({ kind: 'busy', status: 429, retryAfterS: 21 });
        expect(await kindOf(jsonResponse(429, { message: 'x' }))).toEqual({ kind: 'busy', status: 429, retryAfterS: undefined });
        expect(await kindOf(jsonResponse(429, {}, { 'Retry-After': 'soon' }))).toMatchObject({ kind: 'busy', retryAfterS: undefined });
        expect(await kindOf(jsonResponse(429, {}, { 'Retry-After': '0' }))).toMatchObject({ retryAfterS: undefined });
        expect(await kindOf(jsonResponse(429, {}, { 'Retry-After': '99999' }))).toMatchObject({ retryAfterS: undefined });
    });
    it('maps 502 with JSON to unavailable and 502 with HTML to timeout', async () => {
        expect(await kindOf(jsonResponse(502, { status: 502, message: 'SAR service unavailable' }))).toMatchObject({ kind: 'unavailable', status: 502 });
        expect(await kindOf(htmlResponse(502))).toMatchObject({ kind: 'timeout', status: 502 });
    });
    it('maps 504 to timeout, with or without a body', async () => {
        expect(await kindOf(jsonResponse(504, { message: 'x' }, { 'Retry-After': '30' }))).toEqual({ kind: 'timeout', status: 504, retryAfterS: 30 });
        expect(await kindOf(htmlResponse(504))).toMatchObject({ kind: 'timeout', status: 504 });
    });
    it('maps 500 and other statuses to failed', async () => {
        expect(await kindOf(jsonResponse(500, { message: 'Analysis failed.' }))).toMatchObject({ kind: 'failed', status: 500 });
        expect(await kindOf(htmlResponse(500))).toMatchObject({ kind: 'failed', status: 500 });
        expect(await kindOf(jsonResponse(418, {}))).toMatchObject({ kind: 'failed', status: 418 });
    });
    it('maps a network failure to network and never throws', async () => {
        expect(await kindOf(async () => { throw new TypeError('Failed to fetch'); })).toEqual({ kind: 'network' });
    });
});

describe('calculate: 422', () => {
    const rejected = async (json: unknown): Promise<ReturnType<typeof calculate>> => calculate(makeHost(async () => jsonResponse(422, json)), request);
    const errorOf = async (json: unknown): Promise<Record<string, unknown>> => {
        const out = await rejected(json);
        if (out.ok) throw new Error('expected an error');
        return out.error as unknown as Record<string, unknown>;
    };

    it('passes the message through exactly and has no code or suggestion for a plain refusal', async () => {
        const message = ' The start point is in the sea or open water. Move it onto land. ';
        expect(await errorOf({ status: 422, message })).toEqual({ kind: 'rejected', status: 422, message });
    });
    it('ignores suggestions that come without the dense-area code', async () => {
        const e = await errorOf({ message: 'Sea.', suggested_radius_km: 5, suggested_max_hours: 2 });
        expect(e).toEqual({ kind: 'rejected', status: 422, message: 'Sea.' });
        const other = await errorOf({ message: 'Other.', code: 'something_else', suggested_radius_km: 5 });
        expect(other).toEqual({ kind: 'rejected', status: 422, message: 'Other.', code: 'something_else' });
    });
    it('reads the radius suggestion', async () => {
        const e = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: 6.5 });
        expect(e).toEqual({ kind: 'rejected', status: 422, message: 'Dense.', code: 'area_too_dense', suggestions: { radiusKm: 6.5 } });
    });
    it('reads the longest-band suggestion', async () => {
        const e = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_max_hours: 3 });
        expect(e.suggestions).toEqual({ maxHours: 3 });
    });
    it('reads both suggestions', async () => {
        const e = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: 5, suggested_max_hours: 2.5 });
        expect(e.suggestions).toEqual({ radiusKm: 5, maxHours: 2.5 });
    });
    it('has no suggestions when neither is sent', async () => {
        const e = await errorOf({ message: 'Dense.', code: 'area_too_dense' });
        expect(e).toEqual({ kind: 'rejected', status: 422, message: 'Dense.', code: 'area_too_dense' });
    });
    it('ignores malformed suggestions and keeps the message', async () => {
        for (const bad of ['5', null, true, [], {}, Number.NaN, -3, 0]) {
            const e = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: bad, suggested_max_hours: bad });
            expect(e.message).toBe('Dense.');
            expect(e.suggestions).toBeUndefined();
        }
    });
    it('ignores a valid number outside the input limits and never clamps it', async () => {
        const tooBig = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: 31, suggested_max_hours: 25 });
        expect(tooBig.suggestions).toBeUndefined();
        const tooSmall = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: 0.5, suggested_max_hours: 0.1 });
        expect(tooSmall.suggestions).toBeUndefined();
    });
    it('offers only the usable suggestion when the other is unusable', async () => {
        const a = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: 40, suggested_max_hours: 2 });
        expect(a.suggestions).toEqual({ maxHours: 2 });
        const b = await errorOf({ message: 'Dense.', code: 'area_too_dense', suggested_radius_km: 8, suggested_max_hours: 'x' });
        expect(b.suggestions).toEqual({ radiusKm: 8 });
    });
    it('accepts the limits themselves', () => {
        expect(parseSuggestions({ suggested_radius_km: 1, suggested_max_hours: 0.25 })).toEqual({ radiusKm: 1, maxHours: 0.25 });
        expect(parseSuggestions({ suggested_radius_km: 30, suggested_max_hours: 24 })).toEqual({ radiusKm: 30, maxHours: 24 });
    });
    it('drops a code that is not a plain identifier', async () => {
        const e = await errorOf({ message: 'x', code: 'Area Too Dense!', suggested_radius_km: 5 });
        expect(e.code).toBeUndefined();
        expect(e.suggestions).toBeUndefined();
    });
    it('fails (not rejected) when there is no usable message', async () => {
        for (const json of [{}, { message: '' }, { message: 5 }, 'x', null]) {
            expect(await errorOf(json)).toEqual({ kind: 'failed', status: 422 });
        }
        const html = await calculate(makeHost(async () => htmlResponse(422)), request);
        expect(html).toEqual({ ok: false, error: { kind: 'failed', status: 422 } });
    });
});

describe('calculate: cancel and timeout', () => {
    const hang: FetchFn = (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });

    it('is cancelled when the signal is already aborted and sends nothing', async () => {
        const host = makeHost(async () => jsonResponse(200, okBody()));
        const ctl = new AbortController();
        ctl.abort();
        expect(await calculate(host, request, ctl.signal)).toEqual({ ok: false, error: { kind: 'cancelled' } });
        expect(host.fetch).not.toHaveBeenCalled();
    });
    it('is cancelled when the user aborts a running request', async () => {
        const host = makeHost(hang);
        const ctl = new AbortController();
        const p = calculate(host, request, ctl.signal);
        await vi.waitFor(() => expect(host.fetch).toHaveBeenCalled());
        ctl.abort();
        expect(await p).toEqual({ ok: false, error: { kind: 'cancelled' } });
    });
    it('is cancelled when the user aborts while the body is read', async () => {
        const ctl = new AbortController();
        const res = { status: 200, headers: new Headers(), text: async () => { ctl.abort(); throw new DOMException('Aborted', 'AbortError'); } };
        const host = makeHost(async () => res as unknown as Response);
        expect(await calculate(host, request, ctl.signal)).toEqual({ ok: false, error: { kind: 'cancelled' } });
    });
    it('times out on its own', async () => {
        vi.useFakeTimers();
        const host = makeHost(hang);
        const p = calculate(host, request, undefined, 80000);
        await vi.advanceTimersByTimeAsync(80001);
        expect(await p).toEqual({ ok: false, error: { kind: 'timeout' } });
    });
    it('does not leave a timer behind after an answer', async () => {
        vi.useFakeTimers();
        const host = makeHost(async () => jsonResponse(200, okBody()));
        await calculate(host, request);
        expect(vi.getTimerCount()).toBe(0);
    });
});
