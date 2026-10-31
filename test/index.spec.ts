import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { PluginInstance } from '@tak-ps/cloudtak';

const hostMock = vi.hoisted(() => ({
    host: {
        origin: () => 'https://cot.test',
        token: vi.fn(),
        fetch: vi.fn(),
    },
}));
const routerMock = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('../lib/host.ts', () => hostMock);
vi.mock('vue-router', () => ({ useRouter: () => routerMock }));

import SarPlugin from '../index.ts';
import SarPanel from '../lib/SarPanel.vue';
import { MenuIcon } from '../lib/MenuIcon.ts';
import { PANEL_CLOSE, PANEL_OPEN } from '../lib/panel-coordinator.ts';
import { applySuggestion, controller, form, session, suggestionButtons } from '../lib/state.ts';
import { STORAGE_KEY } from '../lib/constants.ts';
import { EventedFakeMap, deferred, makeFakeApi } from './helpers.ts';
import type { FakeFeature } from './helpers.ts';
import { htmlResponse, jsonResponse, okBody } from './fixtures.ts';

const host = hostMock.host;
const STATUS_URL = 'https://cot.test/api/sar/status';
const CALC_URL = 'https://cot.test/api/sar/travel-time';

type Plugin = PluginInstance & { pending: Promise<void>; generation: number };

let plugin: Plugin | undefined;
let wrapper: VueWrapper | undefined;
let statusReply: () => Promise<Response>;
let calcReply: (init?: RequestInit) => Promise<Response>;
let tokenValue: string | undefined;
const store = new Map<string, string>();

/** A request that never answers but ends when it is aborted, like fetch. */
const hang = (init?: RequestInit): Promise<Response> => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});

const ok = (): Promise<Response> => Promise.resolve(jsonResponse(200, { apiVersion: 1, enabled: true }));

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

/** The route component the menu entry opens, mounted: it launches the panel. */
function launch(ctx: { routes: { component?: unknown }[] }): VueWrapper {
    wrapper = mount(ctx.routes[ctx.routes.length - 1].component as never);
    return wrapper;
}

const ours = (map: EventedFakeMap): string[] => map.layers.map((l) => l.id).filter((id) => id.startsWith('taknz-sar-'));
const oursSources = (map: EventedFakeMap): string[] => [...map.sources.keys()].filter((id) => id.startsWith('taknz-sar-'));
const calcCalls = (): unknown[][] => host.fetch.mock.calls.filter((c) => c[0] === CALC_URL);

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
    host.token.mockReset();
    host.token.mockImplementation(async () => tokenValue);
    host.fetch.mockReset();
    host.fetch.mockImplementation(async (url: string, init?: RequestInit) => (url === STATUS_URL ? statusReply() : calcReply(init)));
    routerMock.replace.mockReset();
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

    it('registers one menu item and one route, and nothing on the map, when the relay is enabled', async () => {
        const { calls, menuItems, routes, map } = await enabled();
        expect(calls).toEqual(['routes.add:home-menu-plugin-sar:home-menu', 'menu.add:sar']);
        expect(menuItems).toHaveLength(1);
        expect(routes).toHaveLength(1);
        expect(menuItems[0]).toMatchObject({ label: 'Travel time', tooltip: 'SAR travel time', route: 'home-menu-plugin-sar' });
        expect(map.counters).toEqual({ addSource: 0, addLayer: 0, removeLayer: 0, removeSource: 0, moveLayer: 0 });
        expect(map.listenerCount()).toBe(0);
        expect(host.fetch).toHaveBeenCalledTimes(1);
        expect(host.fetch.mock.calls[0][0]).toBe(STATUS_URL);
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

describe('launcher and panel', () => {
    it('the menu route opens the bottom panel, announces panel-open and goes back to the map', async () => {
        const opened: unknown[] = [];
        const onOpen = (e: Event): void => {
            opened.push((e as CustomEvent).detail);
        };
        window.addEventListener(PANEL_OPEN, onOpen);
        const ctx = await enabled();
        launch(ctx);
        await flushPromises();
        expect(ctx.bar.has('taknz-sar')).toBe(true);
        expect(opened).toEqual([{ id: 'taknz-sar', area: 'bottom' }]);
        expect(routerMock.replace).toHaveBeenCalledWith('/');
        window.removeEventListener(PANEL_OPEN, onOpen);
    });

    it('a second launch keeps one panel and asks for focus on its heading', async () => {
        const ctx = await enabled();
        launch(ctx);
        const before = session.focusSeq;
        wrapper?.unmount();
        launch(ctx);
        await flushPromises();
        expect(ctx.calls.filter((c) => c === 'bottomBar.add:taknz-sar')).toHaveLength(1);
        expect(session.focusSeq).toBe(before + 1);
    });

    it('closes the panel when another plugin opens its own', async () => {
        const closed: unknown[] = [];
        const onClose = (e: Event): void => {
            closed.push((e as CustomEvent).detail);
        };
        const ctx = await enabled();
        launch(ctx);
        window.addEventListener(PANEL_CLOSE, onClose);
        window.dispatchEvent(new CustomEvent(PANEL_OPEN, { detail: { id: 'other', area: 'bottom' } }));
        expect(ctx.bar.has('taknz-sar')).toBe(false);
        expect(session.minimized).toBe(false);
        expect(closed).toEqual([{ id: 'taknz-sar', area: 'bottom', by: 'other' }]);
        window.removeEventListener(PANEL_CLOSE, onClose);
    });

    it('minimizes with the dot while a calculation runs, and restores when the other panel closes', async () => {
        const ctx = await enabled();
        launch(ctx);
        const reply = deferred<Response>();
        calcReply = () => reply.promise;
        type();
        controller.run();
        await flushPromises();
        window.dispatchEvent(new CustomEvent(PANEL_OPEN, { detail: { id: 'other', area: 'bottom' } }));
        expect(ctx.bar.has('taknz-sar')).toBe(false);
        expect(session.minimized).toBe(true);
        expect(session.run).toBe('running');
        // The menu icon shows the dot and the hidden text.
        const icon = mount(MenuIcon);
        expect(icon.find('.taknz-sar-menu-icon__dot').exists()).toBe(true);
        expect(icon.get('.taknz-sar-menu-icon__text').text()).toBe('Controls hidden.');
        expect(icon.get('.taknz-sar-menu-icon').attributes('title')).toBe('Travel time, controls hidden');
        icon.unmount();
        // The calculation finishes while hidden; the panel stays hidden.
        reply.resolve(jsonResponse(200, okBody()));
        await flushPromises();
        expect(session.run).toBe('done');
        expect(ctx.bar.has('taknz-sar')).toBe(false);
        window.dispatchEvent(new CustomEvent(PANEL_CLOSE, { detail: { id: 'other', area: 'bottom' } }));
        expect(ctx.bar.has('taknz-sar')).toBe(true);
        expect(session.minimized).toBe(false);
        expect(mount(MenuIcon).find('.taknz-sar-menu-icon__dot').exists()).toBe(false);
    });

    it('tapping the menu entry of a minimized panel brings it back; an open of another plugin does not', async () => {
        const ctx = await enabled();
        launch(ctx);
        calcReply = () => new Promise<Response>(() => undefined);
        type();
        controller.run();
        await flushPromises();
        window.dispatchEvent(new CustomEvent(PANEL_OPEN, { detail: { id: 'other', area: 'bottom' } }));
        window.dispatchEvent(new CustomEvent(PANEL_OPEN, { detail: { id: 'third', area: 'bottom' } }));
        expect(ctx.bar.has('taknz-sar')).toBe(false);
        wrapper?.unmount();
        launch(ctx);
        await flushPromises();
        expect(ctx.bar.has('taknz-sar')).toBe(true);
        expect(session.minimized).toBe(false);
    });

    it('the close button closes the panel and cancels a running calculation', async () => {
        const ctx = await enabled();
        launch(ctx);
        const reply = deferred<Response>();
        calcReply = () => reply.promise;
        type();
        controller.run();
        await flushPromises();
        controller.close();
        expect(ctx.bar.has('taknz-sar')).toBe(false);
        expect(session.run).toBe('idle');
        reply.resolve(jsonResponse(200, okBody()));
        await flushPromises();
        expect(session.result).toBeNull();
    });

    it('Escape closes the panel, but only while it is open', async () => {
        const ctx = await enabled();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(ctx.calls.filter((c) => c.startsWith('bottomBar'))).toEqual([]);
        launch(ctx);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(ctx.bar.has('taknz-sar')).toBe(false);
    });

    it('Escape leaves the panel alone while a modal is open', async () => {
        const ctx = await enabled();
        launch(ctx);
        const modal = document.createElement('div');
        modal.setAttribute('aria-modal', 'true');
        document.body.append(modal);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(ctx.bar.has('taknz-sar')).toBe(true);
    });
});

describe('a calculation', () => {
    it('posts the form to the relay with the session token and draws the layers with the plugin ids', async () => {
        const ctx = await enabled();
        launch(ctx);
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
        expect(ours(ctx.map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label', 'taknz-sar-ipp']);
        expect(oursSources(ctx.map).sort()).toEqual(['taknz-sar-contours', 'taknz-sar-ipp', 'taknz-sar-labels']);
        expect(ctx.map.fitCalls).toHaveLength(1);
        expect(session.announcement).toBe('Calculation finished. 3 contours drawn.');
    });

    it('keeps the engine attribution on the map while contours stay visible with the panel closed', async () => {
        const ctx = await enabled();
        launch(ctx);
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(ctx.bar.has('taknz-sar')).toBe(false);
        expect(ours(ctx.map)).toContain('taknz-sar-fill');
        const spec = ctx.map.getSource('taknz-sar-contours')?.spec as { attribution?: string };
        expect(spec.attribution).toBe('Synthetic attribution one | Synthetic attribution two');
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
        expect(ours(ctx.map).filter((id) => id !== 'taknz-sar-ipp')).toEqual([]);
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
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
    });

    it('shows the start point on the map as soon as it is valid, and Clear removes everything', async () => {
        const ctx = await enabled();
        type();
        expect(ours(ctx.map)).toEqual(['taknz-sar-ipp']);
        form.lat = '';
        expect(ours(ctx.map)).toEqual([]);
        expect(ctx.map.listenerCount()).toBe(0);
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(ours(ctx.map)).toHaveLength(4);
        controller.clear();
        expect(ours(ctx.map)).toEqual([]);
        expect(oursSources(ctx.map)).toEqual([]);
        expect(ctx.map.listenerCount()).toBe(0);
        expect(session.result).toBeNull();
        expect([form.lat, form.lng]).toEqual(['', '']);
    });

    it('draws again after a style reload', async () => {
        const ctx = await enabled();
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        ctx.map.reloadStyle('taknz-sar-');
        expect(ours(ctx.map)).toHaveLength(4);
    });
});

describe('errors from the relay', () => {
    const MESSAGE = 'Synthetic dense-area message.';

    it.each([
        ['401', () => Promise.resolve(jsonResponse(401, { status: 401 })), 'SAR planning is unavailable. Contact your administrator.'],
        ['502 with JSON', () => Promise.resolve(jsonResponse(502, { status: 502, message: 'x' })), 'SAR planning is unavailable. Contact your administrator.'],
        ['504', () => Promise.resolve(jsonResponse(504, { status: 504 }, { 'Retry-After': '30' })), 'The calculation took too long. Try a smaller radius.'],
        ['an HTML 502', () => Promise.resolve(htmlResponse(502)), 'The calculation took too long. Try a smaller radius.'],
        ['an HTML 504', () => Promise.resolve(htmlResponse(504)), 'The calculation took too long. Try a smaller radius.'],
        ['500', () => Promise.resolve(jsonResponse(500, {})), 'Analysis failed. Try again, or try a smaller area.'],
        ['429', () => Promise.resolve(jsonResponse(429, {}, { 'Retry-After': '21' })), 'Too many requests. Try again in 21 seconds.'],
        ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Could not reach the server. Check your connection and try again.'],
    ])('%s gives the message from the brief', async (_name, reply, text) => {
        await enabled();
        await runWith(reply);
        expect(session.run).toBe('error');
        expect(session.announcement).toBe(text);
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    it('a 504 stays generic: a dense-area body on a 504 gets no buttons', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(504, dense({ suggested_radius_km: 6 }))));
        expect(session.error).toMatchObject({ kind: 'timeout' });
        expect(session.announcement).toBe('The calculation took too long. Try a smaller radius.');
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    it('a 422 without a code (a start point in the sea) shows the message verbatim and no button', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, { status: 'error', message: 'The start point is in the sea or open water. Move it onto land.', suggested_radius_km: 6 })));
        expect(session.error).toMatchObject({ kind: 'rejected', message: 'The start point is in the sea or open water. Move it onto land.' });
        expect(session.announcement).toBe('The start point is in the sea or open water. Move it onto land.');
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    it('area_too_dense with a radius only', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6.5 }))));
        expect(session.announcement).toBe(MESSAGE);
        expect(suggestionButtons(session.error).map((b) => b.label)).toEqual(['Try 6.5 km']);
    });

    it('area_too_dense with hours only', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_max_hours: 3 }))));
        expect(suggestionButtons(session.error).map((b) => b.label)).toEqual(['Set longest band to 3 h']);
    });

    it('area_too_dense with both: the longest-band button sets both', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6, suggested_max_hours: 3 }))));
        const buttons = suggestionButtons(session.error);
        expect(buttons.map((b) => b.label)).toEqual(['Try 6 km', 'Set longest band to 3 h']);
        applySuggestion(buttons[1]);
        expect(form.radius).toBe('6');
        expect([...form.bands]).toEqual([1, 2, 3]);
    });

    it('area_too_dense with neither: the message and no button', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense())));
        expect(session.announcement).toBe(MESSAGE);
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    it.each([
        ['strings', { suggested_radius_km: '6', suggested_max_hours: '3' }],
        ['null', { suggested_radius_km: null, suggested_max_hours: null }],
        ['objects', { suggested_radius_km: {}, suggested_max_hours: [] }],
        ['negative numbers', { suggested_radius_km: -5, suggested_max_hours: -1 }],
        ['zero', { suggested_radius_km: 0, suggested_max_hours: 0 }],
    ])('malformed suggestions (%s) are ignored and the message is still shown', async (_name, extra) => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense(extra))));
        expect(session.announcement).toBe(MESSAGE);
        expect(suggestionButtons(session.error)).toEqual([]);
    });

    // Decision: a number that is valid but outside the plugin's input limits is ignored exactly like a
    // malformed one. It is never clamped, because a clamped number would be a suggestion of our own.
    it('suggestions outside the input limits are ignored, never clamped', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 31, suggested_max_hours: 25 }))));
        expect(suggestionButtons(session.error)).toEqual([]);
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 0.9, suggested_max_hours: 0.2 }))));
        expect(suggestionButtons(session.error)).toEqual([]);
        expect(session.announcement.trim()).toBe(MESSAGE);
    });

    it('with one usable and one unusable suggestion only the usable one is offered', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 40, suggested_max_hours: 3 }))));
        expect(suggestionButtons(session.error).map((b) => [b.kind, b.alsoRadiusKm])).toEqual([['hours', undefined]]);
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6, suggested_max_hours: 'x' }))));
        expect(suggestionButtons(session.error).map((b) => b.kind)).toEqual(['radius']);
    });

    it('the suggestion buttons edit the inputs and never call the relay', async () => {
        await enabled();
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6, suggested_max_hours: 3 }))));
        const fetches = host.fetch.mock.calls.length;
        for (const button of suggestionButtons(session.error)) applySuggestion(button);
        await flushPromises();
        expect(host.fetch.mock.calls.length).toBe(fetches);
        expect(session.run).toBe('error');
        expect(form.radius).toBe('6');
        expect([...form.bands]).toEqual([1, 2, 3]);
        // The user presses Run: one new request with the edited values.
        calcReply = () => Promise.resolve(jsonResponse(200, okBody()));
        controller.run();
        await flushPromises();
        expect(calcCalls()).toHaveLength(2);
        expect(JSON.parse((calcCalls()[1][1] as RequestInit).body as string)).toMatchObject({ radius_km: 6, intervals_hours: [1, 2, 3] });
    });

    it('moves focus to the button and announces the message in the panel (end to end)', async () => {
        const ctx = await enabled();
        launch(ctx);
        wrapper?.unmount();
        const panel = mount(SarPanel, { attachTo: document.body });
        await runWith(() => Promise.resolve(jsonResponse(422, dense({ suggested_radius_km: 6 }))));
        await nextTick();
        await nextTick();
        expect(document.activeElement).toBe(panel.get('[data-test=suggest-radius]').element);
        expect(panel.get('[aria-live]').element.textContent).toBe(MESSAGE);
        expect(panel.get('[data-test=error-message]').element.textContent).toBe(MESSAGE);
        panel.unmount();
    });

    it('moves focus to the message container when there is no button (end to end)', async () => {
        await enabled();
        const panel = mount(SarPanel, { attachTo: document.body });
        await runWith(() => Promise.resolve(jsonResponse(422, dense())));
        await nextTick();
        await nextTick();
        expect(document.activeElement).toBe(panel.get('[data-test=error]').element);
        panel.unmount();
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
        // One click only.
        ctx.map.click(173, -41);
        expect(form.lat).toBe('-40.25');
        expect(ctx.map.listeners.get('click')?.size ?? 0).toBe(0);
    });

    it('Cancel and Escape stop picking and reset the cursor', async () => {
        const ctx = await enabled();
        launch(ctx);
        controller.pick();
        controller.pick();
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        controller.pick();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        // Escape only cancelled the pick: the panel is still open.
        expect(ctx.bar.has('taknz-sar')).toBe(true);
        expect(session.announcement).toBe('Picking cancelled.');
    });

    it('is cancelled when the panel minimizes for another plugin', async () => {
        const ctx = await enabled();
        launch(ctx);
        controller.pick();
        window.dispatchEvent(new CustomEvent(PANEL_OPEN, { detail: { id: 'other', area: 'bottom' } }));
        expect(session.picking).toBe(false);
        expect(ctx.map.cursor).toBe('');
        expect(session.minimized).toBe(true);
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
    it('keeps speed, bands and radius, never the start point', async () => {
        await enabled();
        form.speed = '3';
        type();
        const saved = JSON.parse(store.get(STORAGE_KEY) as string);
        expect(saved).toEqual({ speed: '3', bands: [1, 2, 4, 8], radius: '10' });
    });

    it('restores them on the next enable and does not overwrite them on disable', async () => {
        const ctx = await enabled();
        form.speed = '4';
        await ctx.instance.disable();
        expect(JSON.parse(store.get(STORAGE_KEY) as string).speed).toBe('4');
        expect(form.speed).toBe('2.5');
        await ctx.instance.enable();
        await plugin?.pending;
        expect(form.speed).toBe('4');
    });
});

describe('disable()', () => {
    it('leaves no trace: no menu item, route, bar, layer, source, map listener, timer or window listener', async () => {
        vi.useFakeTimers();
        const tracker = trackListeners();
        const ctx = await enabled();
        launch(ctx);
        controller.pick();
        controller.pick();
        calcReply = () => Promise.resolve(jsonResponse(200, okBody()));
        type();
        controller.run();
        await vi.advanceTimersByTimeAsync(0);
        expect(session.run).toBe('done');
        // A calculation is running at the time of the teardown.
        calcReply = hang;
        controller.run();
        await vi.advanceTimersByTimeAsync(1500);
        expect(session.run).toBe('running');
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        expect(tracker.outstanding().length).toBeGreaterThan(0);

        await ctx.instance.disable();
        // The aborted request settles on the next ticks and clears its own timeout.
        await vi.advanceTimersByTimeAsync(0);

        expect(ctx.bar.size).toBe(0);
        expect(ctx.calls).toEqual(expect.arrayContaining(['bottomBar.remove:taknz-sar', 'menu.remove:sar', 'router.removeRoute:home-menu-plugin-sar']));
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
    });

    it('announces panel-close when the panel was shown, and does not when it was not', async () => {
        const closed: unknown[] = [];
        const onClose = (e: Event): void => {
            closed.push((e as CustomEvent).detail);
        };
        window.addEventListener(PANEL_CLOSE, onClose);
        const first = await enabled();
        await first.instance.disable();
        expect(closed).toEqual([]);
        wrapper = undefined;
        const ctx = await install();
        await ctx.instance.enable();
        await plugin?.pending;
        launch(ctx);
        await ctx.instance.disable();
        expect(closed).toEqual([{ id: 'taknz-sar', area: 'bottom' }]);
        window.removeEventListener(PANEL_CLOSE, onClose);
    });

    it('is safe to call twice and after a failed map', async () => {
        const { instance } = await enabled();
        await instance.disable();
        await expect(instance.disable()).resolves.toBeUndefined();
    });

    it('then enable() works again', async () => {
        const ctx = await enabled();
        launch(ctx);
        await ctx.instance.disable();
        wrapper?.unmount();
        await ctx.instance.enable();
        await plugin?.pending;
        expect(ctx.calls.filter((c) => c === 'menu.add:sar')).toHaveLength(2);
        launch(ctx);
        await flushPromises();
        expect(ctx.bar.has('taknz-sar')).toBe(true);
        await runWith(() => Promise.resolve(jsonResponse(200, okBody())));
        expect(session.run).toBe('done');
        expect(ours(ctx.map)).toHaveLength(4);
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
