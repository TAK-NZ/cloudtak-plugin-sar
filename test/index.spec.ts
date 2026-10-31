import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { PluginInstance } from '@tak-ps/cloudtak';

const hostMock = vi.hoisted(() => ({
    host: {
        origin: () => 'https://cot.test',
        token: vi.fn(),
        fetch: vi.fn(),
    },
    isMobile: vi.fn(() => false),
    saveBlob: vi.fn(),
}));
vi.mock('../lib/host.ts', () => hostMock);
vi.mock('../lib/missions.ts', () => ({ listSubscribedMissions: vi.fn(async () => []) }));
// The host menu template: a pass-through that records its props.
vi.mock('../../../src/components/CloudTAK/util/MenuTemplate.vue', () => ({
    default: defineComponent({
        name: 'MenuTemplate',
        props: { name: { type: String, default: '' }, back: { type: Boolean, default: true } },
        setup(props, { slots }) {
            return () => h('div', { 'data-test': 'menu-template', 'data-name': props.name, 'data-back': String(props.back) }, slots.default?.());
        },
    }),
}));

import SarPlugin from '../index.ts';
import { MenuIcon } from '../lib/MenuIcon.ts';
import { blobBytes, unzipEntries } from './unzip.ts';
import { applySuggestion, controller, form, session, setMode, suggestionButtons } from '../lib/state.ts';
import { STORAGE_KEY } from '../lib/constants.ts';
import { EventedFakeMap, deferred, makeFakeApi } from './helpers.ts';
import type { FakeApi, FakeFeature } from './helpers.ts';
import { htmlResponse, jsonResponse, okBody, tarrBody } from './fixtures.ts';

const host = hostMock.host;
const STATUS_URL = 'https://cot.test/api/sar/status';
const CALC_URL = 'https://cot.test/api/sar/travel-time';
const TARR_URL = 'https://cot.test/api/sar/tarr';
const PACKAGE_URL = 'https://cot.test/api/marti/package';

type Plugin = PluginInstance & { pending: Promise<void>; generation: number };

let plugin: Plugin | undefined;
let wrapper: VueWrapper | undefined;
let statusReply: () => Promise<Response>;
let calcReply: (init?: RequestInit) => Promise<Response>;
let tarrReply: (init?: RequestInit) => Promise<Response>;
let packageReply: () => Promise<Response>;
let tokenValue: string | undefined;
const store = new Map<string, string>();

/** A request that never answers but ends when it is aborted, like fetch. */
const hang = (init?: RequestInit): Promise<Response> => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});
const ok = (): Promise<Response> => Promise.resolve(jsonResponse(200, { apiVersion: 1, enabled: true, modes: ['travel-time', 'tarr'] }));

async function install(map: EventedFakeMap | Error = new EventedFakeMap(), features: FakeFeature[] = []) {
    const fake = makeFakeApi(map, features);
    const instance = await SarPlugin.install({} as never, fake.api) as Plugin;
    plugin = instance;
    return { ...fake, instance, map: map instanceof Error ? undefined : map };
}

async function enabled(map = new EventedFakeMap(), features: FakeFeature[] = []) {
    const ctx = await install(map, features);
    await ctx.instance.enable();
    await plugin?.pending;
    return { ...ctx, map };
}

/** The route component the menu entry opens, mounted: the host template around the pane. */
function openPane(ctx: { routes: { component?: unknown }[] }): VueWrapper {
    wrapper = mount(ctx.routes[ctx.routes.length - 1].component as never, { attachTo: document.body });
    return wrapper;
}

const ours = (map: EventedFakeMap): string[] => map.layers.map((l) => l.id).filter((id) => id.startsWith('taknz-sar-'));
const oursSources = (map: EventedFakeMap): string[] => [...map.sources.keys()].filter((id) => id.startsWith('taknz-sar-'));
const calcCalls = (): unknown[][] => host.fetch.mock.calls.filter((c) => c[0] === CALC_URL);
const tarrCalls = (): unknown[][] => host.fetch.mock.calls.filter((c) => c[0] === TARR_URL);
const callsign = (f: FakeFeature): unknown => f.properties.callsign;

function type(lat = '-40', lng = '172'): void {
    form.lat = lat;
    form.lng = lng;
}

const dense = (extra: Record<string, unknown> = {}) => ({ status: 'error', code: 'area_too_dense', message: 'Synthetic dense-area message.', ...extra });

async function runWith(reply: () => Promise<Response>): Promise<void> {
    calcReply = reply;
    type();
    controller.run();
    await flushPromises();
}

async function runTarr(profile = 'Hiker'): Promise<void> {
    tarrReply = () => Promise.resolve(jsonResponse(200, tarrBody()));
    setMode('tarr');
    form.profile = profile;
    type();
    controller.run();
    await flushPromises();
}

/** Window and document listeners added and not yet removed. */
function trackListeners(): { outstanding: () => string[] } {
    const live = new Map<string, number>();
    const key = (target: string, type: string, fn: unknown): string => `${target}:${type}:${String((fn as { name?: string })?.name ?? '')}`;
    const wire = (name: string, target: Window | Document): void => {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        const ids = new Map<unknown, string>();
        let n = 0;
        vi.spyOn(target, 'addEventListener').mockImplementation((t: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
            if (!ids.has(fn)) ids.set(fn, `${n++}`);
            const k = `${key(name, t, fn)}#${ids.get(fn)}`;
            live.set(k, (live.get(k) ?? 0) + 1);
            add(t, fn, o);
        });
        vi.spyOn(target, 'removeEventListener').mockImplementation((t: string, fn: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) => {
            const k = `${key(name, t, fn)}#${ids.get(fn)}`;
            if (live.has(k)) live.set(k, (live.get(k) as number) - 1);
            remove(t, fn, o);
        });
    };
    wire('window', window);
    wire('document', document);
    return { outstanding: () => [...live.entries()].filter(([, n]) => n > 0).map(([k]) => k) };
}

beforeEach(() => {
    tokenValue = 'tok-1';
    statusReply = ok;
    calcReply = () => Promise.resolve(jsonResponse(200, okBody()));
    tarrReply = () => Promise.resolve(jsonResponse(200, tarrBody()));
    packageReply = () => Promise.resolve(jsonResponse(200, { Hash: 'hash-1' }));
    host.token.mockReset();
    host.token.mockImplementation(async () => tokenValue);
    host.fetch.mockReset();
    host.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === STATUS_URL) return statusReply();
        if (url === TARR_URL) return tarrReply(init);
        if (url === PACKAGE_URL) return packageReply();
        if (url.startsWith('https://cot.test/api/marti/api/files/')) return new Response('zip-bytes', { status: 200 });
        return calcReply(init);
    });
    hostMock.isMobile.mockReset();
    hostMock.isMobile.mockReturnValue(false);
    hostMock.saveBlob.mockReset();
    store.clear();
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
    wrapper?.unmount();
    wrapper = undefined;
    await plugin?.disable();
    plugin = undefined;
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('status gate', () => {
    it('install has no side effects, and disable before enable does nothing', async () => {
        const { instance, calls } = await install();
        await instance.disable();
        expect(calls).toEqual([]);
        expect(host.fetch).not.toHaveBeenCalled();
    });

    it.each([
        ['disabled (enabled:false)', () => {
            statusReply = () => Promise.resolve(jsonResponse(200, { apiVersion: 1, enabled: false }));
        }],
        ['unreachable (status 500)', () => {
            statusReply = () => Promise.resolve(jsonResponse(500, {}));
        }],
        ['unreachable (status 404)', () => {
            statusReply = () => Promise.resolve(jsonResponse(404, {}));
        }],
        ['unreachable (HTML body)', () => {
            statusReply = () => Promise.resolve(htmlResponse(200));
        }],
        ['unreachable (network error)', () => {
            statusReply = () => Promise.reject(new TypeError('Failed to fetch'));
        }],
        ['unauthorized (status 401)', () => {
            statusReply = () => Promise.resolve(jsonResponse(401, {}));
        }],
        ['unauthorized (no token)', () => {
            tokenValue = undefined;
        }],
        ['incompatible (apiVersion 2)', () => {
            statusReply = () => Promise.resolve(jsonResponse(200, { apiVersion: 2, enabled: true }));
        }],
    ])('adds no menu item and no route when the relay is %s', async (_name, setup) => {
        setup();
        const map = new EventedFakeMap();
        const { instance, calls } = await install(map);
        await instance.enable();
        await plugin?.pending;
        await flushPromises();
        expect(calls).toEqual([]);
        expect(map.counters.addSource).toBe(0);
        expect(map.counters.addLayer).toBe(0);
        expect(map.listenerCount()).toBe(0);
    });

    it('ignores a status that arrives after disable()', async () => {
        const status = deferred<Response>();
        statusReply = () => status.promise;
        const { instance, calls } = await install();
        await instance.enable();
        await instance.disable();
        status.resolve(jsonResponse(200, { apiVersion: 1, enabled: true }));
        await plugin?.pending;
        expect(calls).toEqual([]);
    });

    it('does not register anything when the map is not available', async () => {
        const { instance, calls } = await install(new Error('no map'));
        await instance.enable();
        await plugin?.pending;
        expect(calls).toEqual(['routes.add:home-menu-plugin-sar:home-menu', 'menu.add:sar', 'menu.remove:sar', 'router.removeRoute:home-menu-plugin-sar']);
    });
});

describe('side pane registration', () => {
    it('registers one menu item and one route under home-menu, and nothing on the map', async () => {
        const { calls, menuItems, routes, map } = await enabled();
        expect(calls).toEqual(['routes.add:home-menu-plugin-sar:home-menu', 'menu.add:sar']);
        expect(menuItems).toHaveLength(1);
        expect(routes).toHaveLength(1);
        expect(menuItems[0]).toMatchObject({
            label: 'SAR planning', tooltip: 'SAR planning', route: 'home-menu-plugin-sar',
            description: 'Travel time and TARR analysis from a start point',
        });
        expect(map.counters).toEqual({ addSource: 0, addLayer: 0, removeLayer: 0, removeSource: 0, moveLayer: 0 });
        expect(map.listenerCount()).toBe(0);
        expect(host.fetch).toHaveBeenCalledTimes(1);
        expect(host.fetch.mock.calls[0][0]).toBe(STATUS_URL);
    });

    it('the route renders the host menu template without a back button, around the pane', async () => {
        const ctx = await enabled();
        const w = openPane(ctx);
        const template = w.get('[data-test=menu-template]');
        expect(template.attributes('data-name')).toBe('SAR planning');
        expect(template.attributes('data-back')).toBe('false');
        expect(template.find('[data-test=pane]').exists()).toBe(true);
        expect(w.find('[data-test=mode-travel-time]').exists()).toBe(true);
        expect(w.find('[data-test=mode-tarr]').exists()).toBe(true);
    });

    it('renders both modes', async () => {
        const w = openPane(await enabled());
        expect(w.find('[data-test=speed]').exists()).toBe(true);
        await w.get('[data-test=mode-tarr]').setValue(true);
        expect(w.find('[data-test=profile]').exists()).toBe(true);
        expect(w.find('[data-test=speed]').exists()).toBe(false);
    });

    it('uses no bottom bar, panel events or map attribution anywhere in the plugin', async () => {
        const { readdirSync, readFileSync } = await import('node:fs');
        const { dirname, join } = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const root = join(dirname(fileURLToPath(import.meta.url)), '..');
        const sources = [join(root, 'index.ts'), ...readdirSync(join(root, 'lib')).map((n) => join(root, 'lib', n))];
        for (const file of sources) {
            const text = readFileSync(file, 'utf8');
            expect(text, file).not.toMatch(/bottomBar|panel-coordinator|cloudtak-plugin:panel|PANEL_ID|BOTTOM_KEY|attributionText|getAttribution/);
        }
        const ctx = await enabled();
        expect('bottomBar' in (ctx.api as object)).toBe(false);
    });

    it('offers TARR only when the relay lists it', async () => {
        statusReply = () => Promise.resolve(jsonResponse(200, { apiVersion: 1, enabled: true }));
        const ctx = await enabled();
        expect(session.tarrAvailable).toBe(false);
        const w = openPane(ctx);
        expect((w.get('[data-test=mode-tarr]').element as HTMLInputElement).disabled).toBe(true);
        setMode('tarr');
        expect(form.mode).toBe('travel-time');
    });

    it('the menu icon shows a dot while a calculation runs', async () => {
        await enabled();
        calcReply = () => new Promise<Response>(() => undefined);
        type();
        controller.run();
        await flushPromises();
        const icon = mount(MenuIcon);
        expect(icon.find('.taknz-sar-menu-icon__dot').exists()).toBe(true);
        expect(icon.get('.taknz-sar-menu-icon__text').text()).toBe('Calculation running.');
        expect(icon.get('.taknz-sar-menu-icon').attributes('title')).toBe('SAR planning, calculation running');
        icon.unmount();
        controller.cancel();
        const idle = mount(MenuIcon);
        expect(idle.find('.taknz-sar-menu-icon__dot').exists()).toBe(false);
        idle.unmount();
    });
});

describe('a travel time calculation', () => {
    it('posts the form to the relay with the session token', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        const [, init] = calcCalls()[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toEqual({
            ipp: { lat: -40, lng: 172 },
            speed_kmh: 2.5,
            intervals_hours: [1, 2, 4, 8],
            radius_km: 10,
        });
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
        expect(session.run).toBe('done');
        expect(tarrCalls()).toHaveLength(0);
    });

    it('adds one polygon feature per band and the start point as map features', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(ctx.features.map(callsign)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(ctx.features.map((f) => f.properties.type)).toEqual(['u-d-f', 'u-d-f', 'u-d-f', 'u-d-p']);
        const ipp = ctx.features[3];
        expect(ipp.geometry).toEqual({ type: 'Point', coordinates: [172, -40] });
        expect(ipp.properties).toMatchObject({ callsign: 'SAR IPP', 'marker-color': '#FFD600', archived: true });
        expect(String(ipp.properties.remarks)).toMatch(/^Initial Planning Point\. Mode: Travel Time, speed 2\.5 km\/h, bands 1, 2, 4, 8 h\. Run \d{4}-\d\d-\d\d \d\d:\d\d UTC\.$/);
        expect(String(ctx.features[0].properties.remarks)).toContain('Synthetic disclaimer text.');
        expect(ctx.adds).toHaveLength(1);
        expect(ctx.adds[0].mission).toBeUndefined();
        expect(session.featureIds).toEqual(ctx.features.map((f) => f.id));
        expect(new Set(session.featureIds).size).toBe(4);
        expect(session.meta).toMatchObject({ mode: 'travel-time', ipp: { lat: -40, lng: 172 }, speedKmh: 2.5, bandsHours: [1, 2, 4, 8] });
    });

    it('fits the map to the result and announces it', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(ctx.map.fitCalls).toHaveLength(1);
        expect(ctx.map.fitCalls[0].bounds).toEqual([[171, -41], [173, -39]]);
        expect(session.announcement).toBe('Calculation finished. 3 contours and the start point added to the map as features.');
    });

    it('draws no overlay layer for the result: the features are the only copy', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
        expect(ctx.map.listenerCount()).toBe(0);
    });

    it('does nothing for an invalid form', async () => {
        await enabled();
        form.lat = '-10';
        form.lng = '172';
        controller.run();
        await flushPromises();
        expect(calcCalls()).toHaveLength(0);
        expect(session.run).toBe('idle');
    });

    it('a second run replaces the features of the first', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        const first = [...session.featureIds];
        controller.run();
        await flushPromises();
        expect(ctx.removes[0]).toEqual(first);
        expect(ctx.features).toHaveLength(4);
        expect(ctx.features.map((f) => f.id).some((id) => first.includes(id))).toBe(false);
        expect(session.featureIds).toEqual(ctx.features.map((f) => f.id));
    });

    it('fails the run when the features cannot be added, and leaves nothing behind', async () => {
        const ctx = await enabled();
        ctx.failNextAdd(new Error('map not ready'));
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(session.run).toBe('error');
        expect(session.error).toMatchObject({ kind: 'failed' });
        expect(session.result).toBeNull();
        expect(ctx.features).toEqual([]);
        expect(session.featureIds).toEqual([]);
    });

    it('counts the elapsed seconds and stops the timer when the run ends', async () => {
        vi.useFakeTimers();
        await enabled();
        const reply = deferred<Response>();
        calcReply = () => reply.promise;
        type();
        controller.run();
        await vi.advanceTimersByTimeAsync(3000);
        expect(session.elapsed).toBe(3);
        reply.resolve(jsonResponse(200, okBody()));
        await vi.advanceTimersByTimeAsync(0);
        expect(session.run).toBe('done');
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('a TARR calculation', () => {
    it('posts the profile to /api/sar/tarr and nothing else of the travel settings', async () => {
        await enabled();
        setMode('tarr');
        form.profile = 'Hiker';
        form.ecoregion = 'Temperate';
        form.terrain = 'Mountainous';
        type();
        controller.run();
        await flushPromises();
        expect(calcCalls()).toHaveLength(0);
        const [, init] = tarrCalls()[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toEqual({ ipp: { lat: -40, lng: 172 }, profile: 'Hiker', ecoregion: 'Temperate', terrain: 'Mountainous' });
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
        expect(session.run).toBe('done');
    });

    it('adds six ring polygons and the start point', async () => {
        const ctx = await enabled();
        await runTarr();
        expect(ctx.features.map(callsign)).toEqual([
            'Koester 75%, plain circle (3.22 km)', 'Koester 75%, terrain-adjusted (3.703 km)',
            'Koester 50%, plain circle (1.77 km)', 'Koester 50%, terrain-adjusted (2.036 km)',
            'Koester 25%, plain circle (0.64 km)', 'Koester 25%, terrain-adjusted (0.736 km)',
            'SAR IPP',
        ]);
        expect(ctx.features.filter((f) => f.properties['stroke-style'] === 'dashed')).toHaveLength(3);
        expect(String(ctx.features[1].properties.remarks)).toContain('multiplier 1.15 (Coconino County, Arizona)');
        expect(String(ctx.features[1].properties.remarks)).toContain('Not calibrated for New Zealand');
        expect(ctx.features[6].properties.remarks).toMatch(/^Initial Planning Point\. Mode: TARR, subject Hiker\. Run /);
        expect(session.announcement).toBe('Calculation finished. 6 rings and the start point added to the map as features.');
        expect(ours(ctx.map)).toEqual([]);
    });

    it('does not send a request without a profile', async () => {
        await enabled();
        setMode('tarr');
        type();
        controller.run();
        await flushPromises();
        expect(tarrCalls()).toHaveLength(0);
    });

    it('shows the 422 dense-area message without buttons', async () => {
        await enabled();
        setMode('tarr');
        form.profile = 'Snowmobiler';
        type();
        tarrReply = () => Promise.resolve(jsonResponse(422, dense()));
        controller.run();
        await flushPromises();
        expect(session.error).toMatchObject({ kind: 'rejected', code: 'area_too_dense', message: 'Synthetic dense-area message.' });
        expect(suggestionButtons(session.error)).toEqual([]);
    });
});

describe('start point preview and the IPP feature', () => {
    it('shows the dot as soon as the point is valid and removes it when it is not', async () => {
        const ctx = await enabled();
        type();
        expect(ours(ctx.map)).toEqual(['taknz-sar-ipp']);
        form.lat = '';
        expect(ours(ctx.map)).toEqual([]);
        expect(ctx.map.listenerCount()).toBe(0);
    });

    it('replaces the dot with the IPP feature once a result exists: no duplicate', async () => {
        const ctx = await enabled();
        type();
        expect(ours(ctx.map)).toEqual(['taknz-sar-ipp']);
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
        expect(ctx.features.filter((f) => f.properties.callsign === 'SAR IPP')).toHaveLength(1);
    });

    it('shows the dot again for a different point, and hides it for the result point', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        form.lat = '-41';
        expect(ours(ctx.map)).toEqual(['taknz-sar-ipp']);
        form.lat = '-40';
        expect(ours(ctx.map)).toEqual([]);
    });

    it('Clear removes the features, the dot and the form point', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        form.lat = '-41';
        expect(ours(ctx.map)).toEqual(['taknz-sar-ipp']);
        controller.clear();
        await flushPromises();
        expect(ctx.features).toEqual([]);
        expect(ctx.removes.at(-1)).toHaveLength(4);
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
        expect(ctx.map.listenerCount()).toBe(0);
        expect(session.result).toBeNull();
        expect(session.featureIds).toEqual([]);
        expect([form.lat, form.lng]).toEqual(['', '']);
    });

    it('Clear also works for a TARR result', async () => {
        const ctx = await enabled();
        await runTarr();
        expect(ctx.features).toHaveLength(7);
        controller.clear();
        await flushPromises();
        expect(ctx.features).toEqual([]);
        expect(ours(ctx.map)).toEqual([]);
    });

    it('Clear while the dot is shown and no result exists removes the dot', async () => {
        const ctx = await enabled();
        type();
        controller.clear();
        expect(ours(ctx.map)).toEqual([]);
        expect(ctx.removes).toEqual([]);
    });

    it('a failed removal on Clear is logged and the form is still cleared', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        (ctx.api.feature as { remove: unknown }).remove = async () => {
            throw new Error('gone');
        };
        controller.clear();
        await flushPromises();
        expect(session.result).toBeNull();
        expect(console.warn).toHaveBeenCalled();
    });
});

describe('cancel and teardown during a run', () => {
    it('ignores a response that arrives after Cancel, and aborts the request', async () => {
        const ctx = await enabled();
        const reply = deferred<Response>();
        calcReply = () => reply.promise;
        type();
        controller.run();
        await flushPromises();
        const signal = (calcCalls()[0][1] as RequestInit).signal as AbortSignal;
        controller.cancel();
        expect(signal.aborted).toBe(true);
        expect(session.run).toBe('idle');
        expect(session.announcement).toBe('Calculation cancelled.');
        reply.resolve(jsonResponse(200, okBody()));
        await flushPromises();
        expect(session.run).toBe('idle');
        expect(session.result).toBeNull();
        expect(ctx.features).toEqual([]);
    });

    it('a new run after Cancel is not affected by the cancelled one', async () => {
        await enabled();
        const first = deferred<Response>();
        calcReply = () => first.promise;
        type();
        controller.run();
        await flushPromises();
        controller.cancel();
        const second = deferred<Response>();
        calcReply = () => second.promise;
        controller.run();
        await flushPromises();
        first.resolve(jsonResponse(500, {}));
        await flushPromises();
        expect(session.run).toBe('running');
        second.resolve(jsonResponse(200, okBody()));
        await flushPromises();
        expect(session.run).toBe('done');
    });

    it('takes the features off the map again when Cancel comes while they are being added', async () => {
        const ctx = await enabled();
        const adding = deferred<void>();
        const realAdd = (ctx.api.feature as { add: (...a: unknown[]) => Promise<void> }).add;
        (ctx.api.feature as { add: unknown }).add = async (...args: unknown[]) => {
            await adding.promise;
            return realAdd(...args);
        };
        type();
        controller.run();
        await flushPromises();
        expect(session.run).toBe('running');
        controller.cancel();
        adding.resolve();
        await flushPromises();
        expect(session.run).toBe('idle');
        expect(session.result).toBeNull();
        expect(ctx.features).toEqual([]);
    });

    it('ignores a response that arrives after disable()', async () => {
        const ctx = await enabled();
        const reply = deferred<Response>();
        calcReply = () => reply.promise;
        type();
        controller.run();
        await flushPromises();
        await ctx.instance.disable();
        reply.resolve(jsonResponse(200, okBody()));
        await flushPromises();
        expect(session.result).toBeNull();
        expect(ctx.features).toEqual([]);
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
    });
});

describe('errors from the relay', () => {
    const MESSAGE = 'Synthetic dense-area message.';

    it.each([
        ['401', () => Promise.resolve(jsonResponse(401, { status: 401 })), 'SAR planning is unavailable. Contact your administrator.'],
        ['502 with JSON', () => Promise.resolve(jsonResponse(502, { status: 502, message: 'x' })), 'SAR planning is unavailable. Contact your administrator.'],
        ['504', () => Promise.resolve(jsonResponse(504, { status: 504 }, { 'Retry-After': '30' })), 'The calculation took too long. Try a smaller radius.'],
        ['an HTML 502', () => Promise.resolve(htmlResponse(502)), 'The calculation took too long. Try a smaller radius.'],
        ['500', () => Promise.resolve(jsonResponse(500, {})), 'Analysis failed. Try again, or try a smaller area.'],
        ['429', () => Promise.resolve(jsonResponse(429, {}, { 'Retry-After': '21' })), 'Too many requests. Try again in 21 seconds.'],
        ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Could not reach the server. Check your connection and try again.'],
    ])('%s gives the message from the brief', async (_name, reply, text) => {
        const ctx = await enabled();
        await runWith(reply);
        expect(session.run).toBe('error');
        expect(session.announcement).toBe(text);
        expect(suggestionButtons(session.error)).toEqual([]);
        expect(ctx.features).toEqual([]);
    });

    it('a 422 without a code (a start point in the sea) shows the message verbatim and no button', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, { status: 'error', message: 'The start point is in the sea or open water. Move it onto land.', suggested_radius_km: 6 })));
        expect(session.error).toMatchObject({ kind: 'rejected', message: 'The start point is in the sea or open water. Move it onto land.' });
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    it('area_too_dense with both suggestions: the longest-band button sets both', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6, suggested_max_hours: 3 }))));
        const buttons = suggestionButtons(session.error);
        expect(buttons.map((b) => b.label)).toEqual(['Try 6 km', 'Set longest band to 3 h']);
        applySuggestion(buttons[1]);
        expect(form.radius).toBe('6');
        expect([...form.bands]).toEqual([1, 2, 3]);
    });

    it.each([
        ['strings', { suggested_radius_km: '6', suggested_max_hours: '3' }],
        ['null', { suggested_radius_km: null, suggested_max_hours: null }],
        ['outside the input limits', { suggested_radius_km: 31, suggested_max_hours: 25 }],
    ])('malformed suggestions (%s) are ignored and the message is still shown', async (_name, extra) => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense(extra))));
        expect(session.announcement).toBe(MESSAGE);
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    it('the suggestion buttons edit the inputs and never call the relay', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6, suggested_max_hours: 3 }))));
        const fetches = host.fetch.mock.calls.length;
        for (const button of suggestionButtons(session.error)) applySuggestion(button);
        await flushPromises();
        expect(host.fetch.mock.calls.length).toBe(fetches);
        expect(session.run).toBe('error');
        calcReply = () => Promise.resolve(jsonResponse(200, okBody()));
        controller.run();
        await flushPromises();
        expect(calcCalls()).toHaveLength(2);
        expect(JSON.parse((calcCalls()[1][1] as RequestInit).body as string)).toMatchObject({ radius_km: 6, intervals_hours: [1, 2, 3] });
    });

    it('moves focus to the button and announces the message in the pane (end to end)', async () => {
        const w = openPane(await enabled());
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6 }))));
        await flushPromises();
        expect(document.activeElement).toBe(w.get('[data-test=suggest-radius]').element);
        expect(w.get('[aria-live]').element.textContent).toBe(MESSAGE);
    });
});

describe('picking the start point', () => {
    it('sets the fields from one click, resets the cursor and announces it', async () => {
        const ctx = await enabled();
        controller.pick();
        expect(session.picking).toBe(true);
        expect(ctx.map.cursor).toBe('crosshair');
        ctx.map.click(172.5, -40.25);
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        expect([form.lat, form.lng]).toEqual(['-40.25', '172.5']);
        expect(session.announcement).toBe('Start point set.');
        ctx.map.click(173, -41);
        expect(form.lat).toBe('-40.25');
        expect(ctx.map.listeners.get('click')?.size ?? 0).toBe(0);
        // Desktop: the pane stays where it is.
        expect(ctx.pushes).toEqual([]);
    });

    it('Cancel and Escape stop picking and reset the cursor', async () => {
        const ctx = await enabled();
        controller.pick();
        controller.pick();
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        controller.pick();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        expect(session.announcement).toBe('Picking cancelled.');
    });

    it('is not possible while a calculation runs', async () => {
        const ctx = await enabled();
        calcReply = () => new Promise<Response>(() => undefined);
        type();
        controller.run();
        await flushPromises();
        controller.pick();
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
    });

    it('on a phone closes the pane while picking and opens it again after the click', async () => {
        hostMock.isMobile.mockReturnValue(true);
        const ctx = await enabled();
        controller.pick();
        expect(ctx.pushes).toEqual(['/']);
        ctx.map.click(172.5, -40.25);
        await flushPromises();
        expect(ctx.pushes).toEqual(['/', { name: 'home-menu-plugin-sar' }]);
        expect([form.lat, form.lng]).toEqual(['-40.25', '172.5']);
    });

    it('on a phone Escape ends the pick and opens the pane again', async () => {
        hostMock.isMobile.mockReturnValue(true);
        const ctx = await enabled();
        controller.pick();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        expect(session.picking).toBe(false);
        expect(ctx.pushes).toEqual(['/', { name: 'home-menu-plugin-sar' }]);
    });

    it('on a phone opening the pane cancels a pending pick without navigating again', async () => {
        hostMock.isMobile.mockReturnValue(true);
        const ctx = await enabled();
        controller.pick();
        expect(session.picking).toBe(true);
        openPane(ctx);
        await flushPromises();
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        expect(ctx.pushes).toEqual(['/']);
    });
});

describe('markers', () => {
    const point = (id: string, callsign: unknown, coordinates: unknown = [172, -40]): FakeFeature => ({ id, path: '/', properties: { callsign }, geometry: { type: 'Point', coordinates } });

    it('lists point features by callsign and ignores other geometry and bad coordinates', async () => {
        await enabled(new EventedFakeMap(), [
            point('b', 'Bravo'),
            point('a', 'Alpha', [173, -41]),
            point('c', ''),
            point('d', 'Bad', ['x', 1]),
            { id: 'l', path: '/', properties: { callsign: 'Line' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
        ]);
        const list = await controller.loadMarkers();
        expect(list.map((m) => m.callsign)).toEqual(['Alpha', 'Bravo', 'c']);
        expect(list[0]).toEqual({ id: 'a', callsign: 'Alpha', lng: 173, lat: -41 });
    });
});

describe('saved values', () => {
    it('keeps mode, speed, bands, radius and the profile, never the start point', async () => {
        await enabled();
        form.speed = '3';
        setMode('tarr');
        form.profile = 'Hiker';
        type();
        const saved = JSON.parse(store.get(STORAGE_KEY) as string);
        expect(saved).toEqual({ mode: 'tarr', speed: '3', bands: [1, 2, 4, 8], radius: '10', profile: 'Hiker', ecoregion: '', terrain: '' });
    });

    it('restores them on the next enable and does not overwrite them on disable', async () => {
        const ctx = await enabled();
        form.speed = '4';
        setMode('tarr');
        form.profile = 'Camper';
        await ctx.instance.disable();
        expect(JSON.parse(store.get(STORAGE_KEY) as string).speed).toBe('4');
        expect(form.speed).toBe('2.5');
        await ctx.instance.enable();
        await plugin?.pending;
        expect(form.speed).toBe('4');
        expect(form.mode).toBe('tarr');
        expect(form.profile).toBe('Camper');
    });

    it('opens in travel time when TARR was saved but the relay no longer lists it', async () => {
        store.set(STORAGE_KEY, JSON.stringify({ mode: 'tarr', profile: 'Hiker' }));
        statusReply = () => Promise.resolve(jsonResponse(200, { apiVersion: 1, enabled: true }));
        await enabled();
        expect(form.mode).toBe('travel-time');
    });
});

describe('Add to Data Sync', () => {
    const SYNCS = [{ guid: 'g1', name: 'Alpha' }, { guid: 'g2', name: 'Bravo' }];

    it('files copies with fresh ids in each Data Sync and moves the features off the map', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        const localIds = ctx.features.map((f) => f.id);
        await controller.addToDataSync(SYNCS);
        expect(ctx.adds.map((a) => a.mission)).toEqual([undefined, 'g1', 'g2']);
        const [one, two] = [ctx.missionFeatures.get('g1') as FakeFeature[], ctx.missionFeatures.get('g2') as FakeFeature[]];
        expect(one.map(callsign)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        const ids = [...one, ...two].map((f) => f.id);
        expect(new Set(ids).size).toBe(8);
        expect(ids.some((id) => localIds.includes(id))).toBe(false);
        for (const f of one) expect([f.properties.id, f.properties.uid]).toEqual([f.id, f.id]);
        expect(ctx.features).toEqual([]);
        expect(session.featureIds).toEqual([]);
        expect(session.movedTo).toEqual(['Alpha', 'Bravo']);
        expect(session.share.message).toBe('Added 4 features to "Alpha", "Bravo". They moved there from your map.');
        expect(session.announcement).toBe(session.share.message);
        expect(session.share.busy).toBe(false);
    });

    it('uses the edited features from the map, not the original result', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        ctx.features[0].properties.callsign = 'Renamed by the user';
        await controller.addToDataSync([SYNCS[0]]);
        expect((ctx.missionFeatures.get('g1') as FakeFeature[])[0].properties.callsign).toBe('Renamed by the user');
    });

    it('keeps the features on the map and shows the error when it fails', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        ctx.failAddFor('g2');
        await controller.addToDataSync(SYNCS);
        expect(ctx.features).toHaveLength(4);
        expect(session.featureIds).toHaveLength(4);
        expect(session.movedTo).toEqual([]);
        expect(session.share.error).toBe('Could not add to "Bravo": not loaded (1 of 2 done)');
        expect(session.announcement).toBe('Error: Could not add to "Bravo": not loaded (1 of 2 done)');
        expect(session.share.message).toBe('');
        expect(session.share.busy).toBe(false);
    });

    it('a second add after the move rebuilds the features from the result', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        await controller.addToDataSync([SYNCS[0]]);
        await controller.addToDataSync([SYNCS[1]]);
        const second = ctx.missionFeatures.get('g2') as FakeFeature[];
        expect(second.map(callsign)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(second.map((f) => f.id).some((id) => (ctx.missionFeatures.get('g1') as FakeFeature[]).some((g) => g.id === id))).toBe(false);
        expect(session.movedTo).toEqual(['Bravo']);
    });

    it('also moves a TARR result with the IPP', async () => {
        const ctx = await enabled();
        await runTarr();
        await controller.addToDataSync([SYNCS[0]]);
        const filed = ctx.missionFeatures.get('g1') as FakeFeature[];
        expect(filed).toHaveLength(7);
        expect(filed.at(-1)?.properties.callsign).toBe('SAR IPP');
        expect(ctx.features).toEqual([]);
    });

    it('does nothing without a Data Sync, and while another action is busy', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        await controller.addToDataSync([]);
        expect(session.share.error).toBe('Choose at least one Data Sync.');
        session.share.busy = true;
        const adds = ctx.adds.length;
        await controller.addToDataSync(SYNCS);
        expect(ctx.adds).toHaveLength(adds);
    });

    it('does nothing without a result', async () => {
        const ctx = await enabled();
        await controller.addToDataSync(SYNCS);
        expect(ctx.adds).toEqual([]);
        expect(session.share.error).toBe('');
    });
});

describe('Create data package', () => {
    it('sends the features from the map to the server and downloads the zip', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        await controller.createPackage({ name: 'My package', missions: [] });
        const [, init] = host.fetch.mock.calls.find((c) => c[0] === PACKAGE_URL) as [string, RequestInit];
        expect(init.method).toBe('PUT');
        const body = JSON.parse(init.body as string) as { name: string; public: boolean; destinations: unknown[]; features: { id: string; properties: { callsign: string } }[] };
        expect(body).toMatchObject({ name: 'My package', public: false, destinations: [] });
        expect(body.features.map((f) => f.properties.callsign)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(body.features.map((f) => f.id)).toEqual(ctx.features.map((f) => f.id));
        expect(host.fetch.mock.calls.some((c) => c[0] === 'https://cot.test/api/marti/api/files/hash-1?name=My%20package.zip')).toBe(true);
        expect(hostMock.saveBlob).toHaveBeenCalledTimes(1);
        expect(hostMock.saveBlob.mock.calls[0][1]).toBe('My package.zip');
        expect(session.share.message).toBe('Data package "My package" created and downloaded.');
        // The features stay on the map.
        expect(ctx.features).toHaveLength(4);
    });

    it('can file the package in a Data Sync as well', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        await controller.createPackage({ name: 'P', missions: [{ guid: 'g1', name: 'Alpha' }] });
        const body = JSON.parse((host.fetch.mock.calls.find((c) => c[0] === PACKAGE_URL) as [string, RequestInit])[1].body as string) as { destinations: unknown[] };
        expect(body.destinations).toEqual([{ mission: 'g1' }]);
        expect(session.share.message).toBe('Data package "P" created and downloaded. It was also added to "Alpha".');
    });

    it('shows the server message and downloads nothing when it fails', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        packageReply = () => Promise.resolve(jsonResponse(400, { message: 'Not subscribed to the Data Sync' }));
        await controller.createPackage({ name: 'P', missions: [{ guid: 'g1', name: 'Alpha' }] });
        expect(session.share.error).toBe('Not subscribed to the Data Sync');
        expect(hostMock.saveBlob).not.toHaveBeenCalled();
    });

    it('packages a TARR result with the IPP', async () => {
        await enabled();
        await runTarr();
        await controller.createPackage({ name: 'T', missions: [] });
        const body = JSON.parse((host.fetch.mock.calls.find((c) => c[0] === PACKAGE_URL) as [string, RequestInit])[1].body as string) as { features: { properties: { callsign: string } }[] };
        expect(body.features).toHaveLength(7);
        expect(body.features.at(-1)?.properties.callsign).toBe('SAR IPP');
    });
});

describe('Download KML and GeoJSON', () => {
    it('downloads a zip with the KML, the GeoJSON and a README, including the IPP', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        await controller.exportFiles();
        expect(hostMock.saveBlob).toHaveBeenCalledTimes(1);
        const [blob, name] = hostMock.saveBlob.mock.calls[0] as [Blob, string];
        expect(name).toMatch(/^sar-travel-time-\d{8}-\d{4}Z\.zip$/);
        const entries = unzipEntries(await blobBytes(blob));
        expect(entries.map((e) => e.name.replace(/^sar-travel-time-\d{8}-\d{4}Z/, 'base'))).toEqual(['base.kml', 'base.geojson', 'README.txt']);
        const kml = new TextDecoder().decode(entries[0].data);
        expect(kml).toContain('<name>SAR IPP</name>');
        expect(kml).toContain('<name>SAR 4 h</name>');
        const gj = JSON.parse(new TextDecoder().decode(entries[1].data)) as { features: { properties: { callsign: string } }[] };
        expect(gj.features.map((f) => f.properties.callsign)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(session.share.message).toBe(`Downloaded ${name}.`);
    });

    it('exports the TARR rings, holes and the IPP', async () => {
        await enabled();
        await runTarr();
        await controller.exportFiles();
        const [blob, name] = hostMock.saveBlob.mock.calls[0] as [Blob, string];
        expect(name).toMatch(/^sar-tarr-/);
        const entries = unzipEntries(await blobBytes(blob));
        const kml = new TextDecoder().decode(entries[0].data);
        expect(kml).toContain('<innerBoundaryIs>');
        expect(kml).toContain('<name>SAR IPP</name>');
        expect(new TextDecoder().decode(entries[2].data)).toContain('Not calibrated for New Zealand');
    });

    it('exports the result again after the features were moved', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        await controller.addToDataSync([{ guid: 'g1', name: 'Alpha' }]);
        await controller.exportFiles();
        const [blob] = hostMock.saveBlob.mock.calls[0] as [Blob, string];
        const entries = unzipEntries(await blobBytes(blob));
        expect(new TextDecoder().decode(entries[0].data)).toContain('<name>SAR IPP</name>');
    });
});

describe('disable()', () => {
    it('leaves no trace of the plugin, but leaves the features on the map', async () => {
        vi.useFakeTimers();
        const tracker = trackListeners();
        const ctx = await enabled();
        controller.pick();
        controller.pick();
        calcReply = () => Promise.resolve(jsonResponse(200, okBody()));
        type();
        controller.run();
        await vi.advanceTimersByTimeAsync(0);
        expect(session.run).toBe('done');
        const kept = ctx.features.map((f) => f.id);
        // A calculation is running at the time of the teardown.
        calcReply = hang;
        controller.run();
        await vi.advanceTimersByTimeAsync(1500);
        expect(session.run).toBe('running');
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        await ctx.instance.disable();
        await vi.advanceTimersByTimeAsync(0);
        expect(ctx.calls).toEqual(expect.arrayContaining(['menu.remove:sar', 'router.removeRoute:home-menu-plugin-sar']));
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
        expect(ctx.map.listenerCount()).toBe(0);
        expect(ctx.map.cursor).toBe('');
        expect(vi.getTimerCount()).toBe(0);
        expect(tracker.outstanding()).toEqual([]);
        expect(document.getElementById('taknz-sar-menu-icon-style')).toBeNull();
        expect(session.run).toBe('idle');
        expect(session.result).toBeNull();
        expect([form.lat, form.lng]).toEqual(['', '']);
        // The features are ordinary map features now.
        expect(ctx.features.map((f) => f.id)).toEqual(kept);
    });

    it('stops a pending pick and removes its keyboard listener', async () => {
        const tracker = trackListeners();
        const ctx = await enabled();
        controller.pick();
        expect(session.picking).toBe(true);
        expect(tracker.outstanding().length).toBeGreaterThan(0);
        await ctx.instance.disable();
        expect(tracker.outstanding()).toEqual([]);
        expect(ctx.map.cursor).toBe('');
        expect(ctx.map.listenerCount()).toBe(0);
    });

    it('is safe to call twice and after a failed map', async () => {
        const { instance } = await enabled();
        await instance.disable();
        await expect(instance.disable()).resolves.toBeUndefined();
    });

    it('then enable() works again', async () => {
        const ctx = await enabled();
        await ctx.instance.disable();
        await ctx.instance.enable();
        await plugin?.pending;
        expect(ctx.calls.filter((c) => c === 'menu.add:sar')).toHaveLength(2);
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(session.run).toBe('done');
        expect(ctx.features.filter((f) => f.properties.callsign === 'SAR IPP')).toHaveLength(1);
    });

    it('enable() twice in a row registers once', async () => {
        const ctx = await enabled();
        await ctx.instance.enable();
        await plugin?.pending;
        const adds = ctx.calls.filter((c) => c === 'menu.add:sar').length;
        const removes = ctx.calls.filter((c) => c === 'menu.remove:sar').length;
        expect(adds - removes).toBe(1);
    });
});

export type { FakeApi };
