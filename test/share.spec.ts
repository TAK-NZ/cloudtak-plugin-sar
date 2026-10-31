import { afterEach, describe, expect, it, vi } from 'vitest';
import { addToDataSync, createDataPackage, placeFeatures, safeFileName } from '../lib/share.ts';
import type { FeatureApi } from '../lib/share.ts';
import { buildFeatures } from '../lib/features.ts';
import type { SarFeature } from '../lib/features.ts';
import { parseResult } from '../lib/result.ts';
import type { Host, RunMeta, TravelTimeResult } from '../lib/types.ts';
import { jsonResponse, okBody } from './fixtures.ts';

const meta: RunMeta = { mode: 'travel-time', ranAt: '2026-03-01T12:00:00Z', ipp: { lat: -40, lng: 172 }, speedKmh: 2.5, bandsHours: [1, 2, 4] };
const result = parseResult(okBody()) as TravelTimeResult;
const sequence = (prefix: string): (() => string) => {
    let n = 0;
    return () => `${prefix}-${++n}`;
};
const features = (): SarFeature[] => buildFeatures(result, meta, sequence('f'));

interface Call {
    fn: 'add' | 'remove';
    ids: string[];
    mission?: string;
}

function fakeApi(opts: { failAddAt?: number; failRemove?: boolean } = {}): { api: FeatureApi; calls: Call[]; added: unknown[][] } {
    const calls: Call[] = [];
    const added: unknown[][] = [];
    let adds = 0;
    const api = {
        add: async (list: SarFeature[], o?: { mission?: string }) => {
            adds++;
            calls.push({ fn: 'add', ids: list.map((f) => f.id), mission: o?.mission });
            added.push(JSON.parse(JSON.stringify(list)));
            if (opts.failAddAt === adds) throw new Error('not loaded');
        },
        remove: async (ids: string[]) => {
            calls.push({ fn: 'remove', ids });
            if (opts.failRemove) throw new Error('remove failed');
        },
    };
    return { api: api as unknown as FeatureApi, calls, added };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('placeFeatures', () => {
    it('removes the previous features, then adds the new ones, and returns their ids', async () => {
        const { api, calls } = fakeApi();
        const f = features();
        const ids = await placeFeatures(api, ['old-1', 'old-2'], f);
        expect(calls.map((c) => [c.fn, c.ids])).toEqual([['remove', ['old-1', 'old-2']], ['add', f.map((x) => x.id)]]);
        expect(ids).toEqual(f.map((x) => x.id));
        expect(calls[1].mission).toBeUndefined();
    });

    it('does not call remove when there is nothing to remove', async () => {
        const { api, calls } = fakeApi();
        await placeFeatures(api, [], features());
        expect(calls.map((c) => c.fn)).toEqual(['add']);
    });

    it('logs a failed removal and goes on', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { api, calls } = fakeApi({ failRemove: true });
        await expect(placeFeatures(api, ['old'], features())).resolves.toHaveLength(4);
        expect(calls.map((c) => c.fn)).toEqual(['remove', 'add']);
        expect(warn).toHaveBeenCalled();
    });

    it('removes what it can and rethrows when the add fails', async () => {
        const { api, calls } = fakeApi({ failAddAt: 1 });
        const f = features();
        await expect(placeFeatures(api, [], f)).rejects.toThrow('not loaded');
        expect(calls.map((c) => c.fn)).toEqual(['add', 'remove']);
        expect(calls[1].ids).toEqual(f.map((x) => x.id));
    });
});

describe('addToDataSync', () => {
    const missions = [{ guid: 'g1', name: 'Alpha' }, { guid: 'g2', name: 'Bravo' }];

    it('adds a copy with fresh ids to each Data Sync, with the mission option', async () => {
        const { api, calls, added } = fakeApi();
        const f = features();
        const done = await addToDataSync(api, f, missions, sequence('m'));
        expect(done).toEqual(['Alpha', 'Bravo']);
        expect(calls.map((c) => c.mission)).toEqual(['g1', 'g2']);
        const first = added[0] as SarFeature[];
        const second = added[1] as SarFeature[];
        expect(first.map((x) => x.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4']);
        expect(second.map((x) => x.id)).toEqual(['m-5', 'm-6', 'm-7', 'm-8']);
        for (const x of [...first, ...second]) {
            expect(x.properties.id).toBe(x.id);
            expect(x.properties.uid).toBe(x.id);
        }
        // Everything else is the same, the IPP included.
        expect(first.map((x) => x.properties.callsign)).toEqual(f.map((x) => x.properties.callsign));
        expect(first.at(-1)?.properties.callsign).toBe('SAR IPP');
        expect(f[0].id).toBe('f-1');
    });

    it('stops at the first failure and says how far it got', async () => {
        const { api, calls } = fakeApi({ failAddAt: 2 });
        await expect(addToDataSync(api, features(), missions)).rejects.toThrow('Could not add to "Bravo": not loaded (1 of 2 done)');
        expect(calls).toHaveLength(2);
    });

    it('names the first Data Sync when that one fails', async () => {
        const { api } = fakeApi({ failAddAt: 1 });
        await expect(addToDataSync(api, features(), missions)).rejects.toThrow('Could not add to "Alpha": not loaded (0 of 2 done)');
    });
});

describe('createDataPackage', () => {
    const host = (replies: Response[]): Host & { fetch: ReturnType<typeof vi.fn> } => {
        const queue = [...replies];
        return {
            origin: () => 'https://cloudtak.example',
            token: async () => 'test-token-value',
            fetch: vi.fn(async () => queue.shift() as Response),
        };
    };

    it('puts the features to the package route, then downloads the hash as a zip', async () => {
        const h = host([jsonResponse(200, { Hash: 'abc123' }), new Response('zipbytes', { status: 200 })]);
        const f = features();
        const out = await createDataPackage(h, f, { name: 'SAR Travel Time', missionGuids: ['g1'] });
        const [putUrl, putInit] = h.fetch.mock.calls[0] as [string, RequestInit];
        expect(putUrl).toBe('https://cloudtak.example/api/marti/package');
        expect(putInit.method).toBe('PUT');
        expect((putInit.headers as Record<string, string>).Authorization).toBe('Bearer test-token-value');
        const body = JSON.parse(putInit.body as string) as Record<string, unknown> & { features: { id: string; type: string; properties: Record<string, unknown>; geometry: unknown }[] };
        expect(body).toMatchObject({
            type: 'FeatureCollection', name: 'SAR Travel Time', public: false, groups: [], keywords: ['sar'],
            destinations: [{ mission: 'g1' }], assets: [], basemaps: [],
        });
        expect(body.features.map((x) => x.id)).toEqual(f.map((x) => x.id));
        expect(body.features.every((x) => x.type === 'Feature')).toBe(true);
        expect(body.features.at(-1)?.properties.callsign).toBe('SAR IPP');
        const [getUrl, getInit] = h.fetch.mock.calls[1] as [string, RequestInit];
        expect(getUrl).toBe('https://cloudtak.example/api/marti/api/files/abc123?name=SAR%20Travel%20Time.zip');
        expect(getInit.method).toBe('GET');
        expect(out.filename).toBe('SAR Travel Time.zip');
        expect(await out.blob.text()).toBe('zipbytes');
    });

    it('sends no destination when none was chosen', async () => {
        const h = host([jsonResponse(200, { Hash: 'h' }), new Response('z')]);
        await createDataPackage(h, features(), { name: 'P', missionGuids: [] });
        const body = JSON.parse((h.fetch.mock.calls[0] as [string, RequestInit])[1].body as string) as { destinations: unknown[] };
        expect(body.destinations).toEqual([]);
    });

    it('uses the message of an error answer', async () => {
        const h = host([jsonResponse(400, { message: 'Not subscribed to the Data Sync' })]);
        await expect(createDataPackage(h, features(), { name: 'P', missionGuids: ['g'] })).rejects.toThrow('Not subscribed to the Data Sync');
    });

    it('falls back to the status when the error answer is not JSON', async () => {
        const h = host([new Response('<html>', { status: 502 })]);
        await expect(createDataPackage(h, features(), { name: 'P', missionGuids: [] })).rejects.toThrow('The server answered 502');
    });

    it('fails when the answer has no hash, and when the download fails', async () => {
        await expect(createDataPackage(host([jsonResponse(200, {})]), features(), { name: 'P', missionGuids: [] })).rejects.toThrow('did not return the package');
        await expect(createDataPackage(host([jsonResponse(200, { Hash: 'h' }), jsonResponse(404, { message: 'Gone' })]), features(), { name: 'P', missionGuids: [] })).rejects.toThrow('Gone');
    });

    it('fails without a token', async () => {
        const h = { ...host([]), token: async () => undefined };
        await expect(createDataPackage(h, features(), { name: 'P', missionGuids: [] })).rejects.toThrow('not signed in');
        expect(h.fetch).not.toHaveBeenCalled();
    });
});

describe('safeFileName', () => {
    it('replaces separators, reserved and control characters', () => {
        expect(safeFileName('a/b\\c:d*e?f"g<h>i|j\u0001k')).toBe('a_b_c_d_e_f_g_h_i_j_k');
        expect(safeFileName('  ')).toBe('sar');
        expect(safeFileName('SAR TARR 2026-03-01 12.05')).toBe('SAR TARR 2026-03-01 12.05');
    });
});
