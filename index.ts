import type { App } from 'vue';
import { watch } from 'vue';
import type { PluginAPI, PluginInstance } from '@tak-ps/cloudtak';
import SarPanel from './lib/SarPanel.vue';
import { MenuIcon, removeMenuIconStyle } from './lib/MenuIcon.ts';
import { createLaunchRoute } from './lib/LaunchRoute.ts';
import { host } from './lib/host.ts';
import { BOTTOM_KEY, MENU_KEY, PANEL_ID, ROUTE_NAME, ROUTE_PATH } from './lib/constants.ts';
import { createPanelCoordinator } from './lib/panel-coordinator.ts';
import type { PanelCoordinator } from './lib/panel-coordinator.ts';
import { calculate, fetchStatus } from './lib/relay-client.ts';
import type { StatusReason } from './lib/relay-client.ts';
import { SarLayers } from './lib/layers.ts';
import type { MapLike } from './lib/layers.ts';
import { startPicking } from './lib/picker.ts';
import type { PickMap } from './lib/picker.ts';
import {
    announce, bindController, bindStorage, cancelRun, clearAll, failRun, finishRun, form, requestHeadingFocus, resetAll,
    session, setStartPoint, startRun,
} from './lib/state.ts';
import type { MarkerChoice, StorageLike } from './lib/state.ts';
import { validateForm, validateLat, validateLng } from './lib/validation.ts';

/** Everything one successful activation registered, so teardown can undo exactly that. */
interface Activation {
    gen: number;
    dead: boolean;
    /** Bumped by every run, cancel and teardown; a response with an older number is discarded. */
    runId: number;
    map?: MapLike & PickMap;
    layers?: SarLayers;
    /** Tells other plugins when the panel opens or closes, and yields when one of them opens (lib/panel-coordinator.ts). */
    panel?: PanelCoordinator;
    abort?: AbortController;
    timer?: ReturnType<typeof setInterval>;
    stopPick?: () => void;
    /** Document-level Escape handler, present while the bar is shown. */
    onEscape?: (e: KeyboardEvent) => void;
    stops: (() => void)[];
    registered: { route: boolean; menu: boolean; bar: boolean };
}

function storage(): StorageLike | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

export default class SarPlugin implements PluginInstance {
    api: PluginAPI;
    generation = 0;
    /** The activation started by the latest enable(). Never rejects. */
    pending: Promise<void> = Promise.resolve();
    private active: Activation | null = null;

    constructor(api: PluginAPI) {
        this.api = api;
    }

    static async install(app: App, api: PluginAPI): Promise<PluginInstance> {
        void app;
        return new SarPlugin(api);
    }

    /**
     * CloudTAK awaits enable() of every plugin in turn, so this only starts the
     * activation and returns without waiting for the network.
     */
    async enable(): Promise<void> {
        this.generation++;
        this.teardown();
        this.pending = this.activate(this.generation);
    }

    async disable(): Promise<void> {
        this.generation++;
        this.teardown();
    }

    private async activate(gen: number): Promise<void> {
        try {
            const { reason } = await fetchStatus(host);
            if (gen !== this.generation) return;
            if (reason !== 'ok') {
                this.logInactive(reason);
                return;
            }
            this.build(gen);
        } catch (err) {
            console.error('[sar] Could not start the travel-time plugin', err);
            if (gen === this.generation) this.teardown();
        }
    }

    private logInactive(reason: StatusReason): void {
        if (reason === 'disabled') {
            console.info('[sar] Travel time is disabled on this server; plugin not active');
        } else {
            console.warn(`[sar] Travel-time status check failed (${reason}); plugin not active`);
        }
    }

    /** Register everything. Runs synchronously so a disable() cannot interleave. */
    private build(gen: number): void {
        const act: Activation = {
            gen,
            dead: false,
            runId: 0,
            stops: [],
            registered: { route: false, menu: false, bar: false },
        };
        this.active = act;
        try {
            resetAll();
            bindStorage(storage());
            act.stops.push(() => bindStorage(null));

            this.api.routes.add({
                path: ROUTE_PATH,
                name: ROUTE_NAME,
                component: createLaunchRoute(() => this.launch(act)),
            }, 'home-menu');
            act.registered.route = true;
            this.api.menu.add({
                key: MENU_KEY,
                label: 'Travel time',
                route: ROUTE_NAME,
                tooltip: 'SAR travel time',
                description: 'Travel-time contours from a start point',
                icon: MenuIcon,
            });
            act.registered.menu = true;

            // Nothing is added to the map until there is something to show.
            const map = this.api.map as unknown as MapLike & PickMap;
            act.map = map;
            act.layers = new SarLayers(map);

            // A running calculation or a pending pick is work the user would lose: minimize instead of closing.
            const panel = createPanelCoordinator({
                id: PANEL_ID,
                isShown: () => act.registered.bar,
                hasState: () => session.run === 'running' || session.picking,
                close: () => this.removeBar(act),
                minimize: () => {
                    // Picking needs the panel's Cancel button; a calculation keeps running.
                    this.stopPicking(act);
                    this.removeBar(act);
                },
                restore: () => this.addBar(act),
                onMinimizedChange: (minimized) => {
                    session.minimized = minimized;
                },
            });
            act.panel = panel;
            act.stops.push(() => panel.dispose());

            bindController({
                run: () => this.run(act),
                cancel: () => this.cancel(act),
                clear: () => this.clear(act),
                pick: () => this.togglePick(act),
                close: () => this.closeByUser(act),
                loadMarkers: () => this.loadMarkers(),
            });
            act.stops.push(() => bindController(null));

            // The start point is shown on the map as soon as it is valid.
            act.stops.push(watch(
                () => [form.lat, form.lng] as const,
                ([lat, lng]) => {
                    const la = validateLat(lat);
                    const ln = validateLng(lng);
                    act.layers?.setIpp(la.ok && ln.ok ? [ln.value, la.value] : null);
                },
                { flush: 'sync' }
            ));
        } catch (err) {
            console.error('[sar] Could not start the travel-time plugin', err);
            this.teardown();
        }
    }

    /** The menu entry: open the panel, restore it when minimized, or move focus to it when it is open. */
    private launch(act: Activation): void {
        if (act.dead || this.active !== act || !act.panel) return;
        if (act.panel.minimized) {
            act.panel.restoreFromSelector();
        } else if (act.registered.bar) {
            requestHeadingFocus();
        } else {
            this.addBar(act);
            if (act.registered.bar) act.panel.opened();
        }
    }

    /** Adds the bottom bar item and the Escape handler. Never announces. */
    private addBar(act: Activation): void {
        if (act.dead || act.registered.bar) return;
        try {
            this.api.bottomBar.add({ key: BOTTOM_KEY, component: SarPanel });
            act.registered.bar = true;
        } catch (err) {
            console.warn('[sar] Could not open the travel-time panel', err);
            return;
        }
        this.addEscape(act);
    }

    /** Removes the bottom bar item and the Escape handler. Never announces. */
    private removeBar(act: Activation): void {
        this.removeEscape(act);
        if (!act.registered.bar) return;
        act.registered.bar = false;
        try {
            this.api.bottomBar.remove(BOTTOM_KEY);
        } catch {
            // Already removed.
        }
    }

    /** Close button and Escape. A calculation in progress is cancelled: nothing keeps running unseen. */
    private closeByUser(act: Activation): void {
        if (act.dead || !act.registered.bar) return;
        if (session.run === 'running') this.cancel(act);
        this.stopPicking(act);
        this.removeBar(act);
        act.panel?.closed();
    }

    private addEscape(act: Activation): void {
        if (act.onEscape || typeof document === 'undefined') return;
        const onEscape = (e: KeyboardEvent): void => {
            if (e.key !== 'Escape' || e.defaultPrevented || act.dead) return;
            // A modal (an image editor, for example) owns Escape while it is open.
            if (document.querySelector('[aria-modal="true"]')) return;
            this.closeByUser(act);
        };
        act.onEscape = onEscape;
        document.addEventListener('keydown', onEscape);
    }

    private removeEscape(act: Activation): void {
        if (!act.onEscape) return;
        if (typeof document !== 'undefined') document.removeEventListener('keydown', act.onEscape);
        act.onEscape = undefined;
    }

    private stopPicking(act: Activation): void {
        const stop = act.stopPick;
        act.stopPick = undefined;
        session.picking = false;
        stop?.();
    }

    private togglePick(act: Activation): void {
        if (act.dead || !act.map) return;
        if (session.picking) {
            this.stopPicking(act);
            announce('Picking cancelled.');
            return;
        }
        if (session.run === 'running') return;
        try {
            act.stopPick = startPicking(act.map, (lng, lat) => {
                if (act.dead) return;
                act.stopPick = undefined;
                session.picking = false;
                setStartPoint(lng, lat);
                announce('Start point set.');
            }, () => {
                act.stopPick = undefined;
                session.picking = false;
                announce('Picking cancelled.');
            });
        } catch (err) {
            console.warn('[sar] Could not start picking on the map', err);
            return;
        }
        session.picking = true;
        session.markerOpen = false;
        announce('Tap the map to set the start point.');
    }

    private async loadMarkers(): Promise<MarkerChoice[]> {
        const features = await this.api.feature.list({
            filter: (f) => f?.geometry?.type === 'Point',
        });
        const out: MarkerChoice[] = [];
        for (const f of features) {
            const c = (f.geometry as { coordinates?: unknown }).coordinates;
            if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number' || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
            const props = (f.properties ?? {}) as Record<string, unknown>;
            const callsign = typeof props.callsign === 'string' && props.callsign.trim() !== '' ? props.callsign : String(f.id);
            out.push({ id: String(f.id), callsign, lng: c[0], lat: c[1] });
        }
        return out.sort((a, b) => a.callsign.localeCompare(b.callsign));
    }

    private run(act: Activation): void {
        if (act.dead || this.active !== act || session.run === 'running') return;
        const check = validateForm({ lat: form.lat, lng: form.lng, speed: form.speed, bands: form.bands, radius: form.radius });
        if (!check.ok) return;
        this.stopPicking(act);
        const id = ++act.runId;
        const ctl = new AbortController();
        act.abort = ctl;
        const started = Date.now();
        startRun();
        act.timer = setInterval(() => {
            session.elapsed = Math.floor((Date.now() - started) / 1000);
        }, 1000);
        void calculate(host, check.body, ctl.signal).then((outcome) => {
            // Cancelled, closed or torn down meanwhile: the answer is not wanted.
            if (act.dead || id !== act.runId) return;
            this.endRun(act);
            if (!outcome.ok) {
                failRun(outcome.error);
                return;
            }
            try {
                act.layers?.show(outcome.result);
            } catch (err) {
                console.error('[sar] Could not draw the contours', err);
                failRun({ kind: 'failed' });
                return;
            }
            finishRun(outcome.result);
        });
    }

    /** Stops the elapsed timer and forgets the request. */
    private endRun(act: Activation): void {
        if (act.timer !== undefined) clearInterval(act.timer);
        act.timer = undefined;
        act.abort = undefined;
    }

    private cancel(act: Activation): void {
        if (act.dead || session.run !== 'running') return;
        act.runId++;
        act.abort?.abort();
        this.endRun(act);
        cancelRun();
    }

    private clear(act: Activation): void {
        if (act.dead || session.run === 'running') return;
        try {
            act.layers?.clear();
        } catch (err) {
            console.warn('[sar] Could not clear the map', err);
        }
        clearAll();
    }

    /**
     * Undo the active registration. Idempotent; every access to the app (map, menu,
     * router) is separate so one failure, e.g. a destroyed map, cannot skip the rest.
     */
    private teardown(): void {
        const act = this.active;
        this.active = null;
        if (!act) return;
        act.dead = true;
        act.runId++;
        act.abort?.abort();
        this.endRun(act);
        this.stopPicking(act);
        this.removeEscape(act);
        // Tell other plugins the panel is gone before the coordinator stops listening.
        if (act.registered.bar || act.panel?.minimized) act.panel?.closed();
        for (const stop of act.stops) {
            try {
                stop();
            } catch {
                // Nothing left to undo.
            }
        }
        act.stops = [];
        try {
            act.layers?.dispose();
        } catch {
            // The map is gone, so are the layers.
        }
        act.layers = undefined;
        if (act.registered.bar) {
            try {
                this.api.bottomBar.remove(BOTTOM_KEY);
            } catch {
                // Already removed.
            }
            act.registered.bar = false;
        }
        if (act.registered.menu) {
            try {
                this.api.menu.remove(MENU_KEY);
            } catch {
                // Already removed.
            }
        }
        if (act.registered.route) {
            try {
                this.api.router.removeRoute(ROUTE_NAME);
            } catch {
                // Already removed.
            }
        }
        removeMenuIconStyle();
        resetAll();
    }
}
