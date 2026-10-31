import type { App } from 'vue';
import { h, watch } from 'vue';
import type { PluginAPI, PluginInstance } from '@tak-ps/cloudtak';
// Host component (the plugin is built inside app/plugins/<name>/, like the Rubber Sheet plugin).
import MenuTemplate from '../../src/components/CloudTAK/util/MenuTemplate.vue';
import SarPane from './lib/SarPane.vue';
import { MenuIcon, removeMenuIconStyle } from './lib/MenuIcon.ts';
import { host, isMobile, saveBlob } from './lib/host.ts';
import { FEATURE_PATH, MENU_KEY, ROUTE_NAME, ROUTE_PATH } from './lib/constants.ts';
import { calculate, fetchStatus, tarrAvailable } from './lib/relay-client.ts';
import type { StatusReason } from './lib/relay-client.ts';
import { buildExportFiles } from './lib/export.ts';
import { buildFeatures } from './lib/features.ts';
import type { SarFeature } from './lib/features.ts';
import { SarLayers } from './lib/layers.ts';
import type { MapLike } from './lib/layers.ts';
import { startPicking } from './lib/picker.ts';
import type { PickMap } from './lib/picker.ts';
import { addToDataSync, createDataPackage, placeFeatures } from './lib/share.ts';
import {
    announce, bindController, bindStorage, cancelRun, clearAll, failRun, finishRun, form, resetAll,
    session, setStartPoint, startRun,
} from './lib/state.ts';
import type { MarkerChoice, StorageLike } from './lib/state.ts';
import type { AnalysisResult, CalcRequest, MissionChoice, RunMeta } from './lib/types.ts';
import { validateLat, validateLng, validateRun } from './lib/validation.ts';

/** Everything one successful activation registered, so teardown can undo exactly that. */
interface Activation {
    gen: number;
    dead: boolean;
    /** Bumped by every run, cancel and teardown; a response with an older number is discarded. */
    runId: number;
    map?: MapLike & PickMap;
    layers?: SarLayers;
    abort?: AbortController;
    timer?: ReturnType<typeof setInterval>;
    stopPick?: () => void;
    stops: (() => void)[];
    registered: { route: boolean; menu: boolean };
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
            const { status, reason } = await fetchStatus(host);
            if (gen !== this.generation) return;
            if (reason !== 'ok') {
                this.logInactive(reason);
                return;
            }
            this.build(gen, tarrAvailable(status));
        } catch (err) {
            console.error('[sar] Could not start the SAR plugin', err);
            if (gen === this.generation) this.teardown();
        }
    }

    private logInactive(reason: StatusReason): void {
        if (reason === 'disabled') {
            console.info('[sar] SAR planning is disabled on this server; plugin not active');
        } else {
            console.warn(`[sar] SAR status check failed (${reason}); plugin not active`);
        }
    }

    /** Register everything. Runs synchronously so a disable() cannot interleave. */
    private build(gen: number, tarr: boolean): void {
        const act: Activation = {
            gen,
            dead: false,
            runId: 0,
            stops: [],
            registered: { route: false, menu: false },
        };
        this.active = act;
        try {
            resetAll();
            session.tarrAvailable = tarr;
            bindStorage(storage());
            act.stops.push(() => bindStorage(null));

            // The pane is a menu route, like the Rubber Sheet plugin: the host shows it in the side menu.
            this.api.routes.add({
                path: ROUTE_PATH,
                name: ROUTE_NAME,
                component: { render: () => h(MenuTemplate, { name: 'SAR planning', back: false }, { default: () => h(SarPane) }) },
            }, 'home-menu');
            act.registered.route = true;
            this.api.menu.add({
                key: MENU_KEY,
                label: 'SAR planning',
                route: ROUTE_NAME,
                tooltip: 'SAR planning',
                description: 'Travel time and TARR analysis from a start point',
                icon: MenuIcon,
            });
            act.registered.menu = true;

            // Nothing is added to the map until there is something to show.
            const map = this.api.map as unknown as MapLike & PickMap;
            act.map = map;
            act.layers = new SarLayers(map);

            bindController({
                run: () => this.run(act),
                cancel: () => this.cancel(act),
                clear: () => this.clear(act),
                pick: () => this.togglePick(act),
                loadMarkers: () => this.loadMarkers(),
                addToDataSync: (missions) => this.shareTask(act, () => this.moveToDataSync(missions)),
                createPackage: (options) => this.shareTask(act, () => this.makePackage(options)),
                exportFiles: () => this.shareTask(act, () => this.downloadFiles()),
            });
            act.stops.push(() => bindController(null));

            // The start point is previewed as a dot as soon as it is valid, until a result exists for it:
            // then the start point is a map feature and the dot would only duplicate it.
            act.stops.push(watch(
                () => [form.lat, form.lng, session.result, session.meta] as const,
                () => this.syncPreview(act),
                { flush: 'sync' }
            ));
        } catch (err) {
            console.error('[sar] Could not start the SAR plugin', err);
            this.teardown();
        }
    }

    /** Show the preview dot only for a valid start point that has no result yet. */
    private syncPreview(act: Activation): void {
        const la = validateLat(form.lat);
        const ln = validateLng(form.lng);
        if (!la.ok || !ln.ok) {
            act.layers?.setIpp(null);
            return;
        }
        const meta = session.meta;
        const replaced = session.result !== null && meta !== null && meta.ipp.lat === la.value && meta.ipp.lng === ln.value;
        act.layers?.setIpp(replaced ? null : [ln.value, la.value]);
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
        // On a phone the pane covers the map: close it while picking and open it again afterwards.
        const mobile = isMobile();
        try {
            act.stopPick = startPicking(act.map, (lng, lat) => {
                if (act.dead) return;
                act.stopPick = undefined;
                session.picking = false;
                setStartPoint(lng, lat);
                announce('Start point set.');
                if (mobile) this.openPane();
            }, () => {
                act.stopPick = undefined;
                session.picking = false;
                announce('Picking cancelled.');
                if (mobile) this.openPane();
            });
        } catch (err) {
            console.warn('[sar] Could not start picking on the map', err);
            return;
        }
        session.picking = true;
        session.markerOpen = false;
        announce('Tap the map to set the start point.');
        if (mobile) this.navigate('/');
    }

    private openPane(): void {
        this.navigate({ name: ROUTE_NAME });
    }

    private navigate(to: string | { name: string }): void {
        try {
            void Promise.resolve(this.api.router.push(to)).catch(() => undefined);
        } catch {
            // The router is gone.
        }
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
        const check = validateRun(form.mode, form);
        if (!check.ok) return;
        this.stopPicking(act);
        const id = ++act.runId;
        const stale = (): boolean => act.dead || id !== act.runId;
        const ctl = new AbortController();
        act.abort = ctl;
        const started = Date.now();
        startRun(check.request.mode);
        act.timer = setInterval(() => {
            session.elapsed = Math.floor((Date.now() - started) / 1000);
        }, 1000);
        void this.runAndPlace(act, check.request, ctl.signal, stale);
    }

    /** Calculate, put the features on the map, then show the result. Cancel and teardown discard it. */
    private async runAndPlace(act: Activation, request: CalcRequest, signal: AbortSignal, stale: () => boolean): Promise<void> {
        const outcome = await calculate(host, request, signal);
        // Cancelled, closed or torn down meanwhile: the answer is not wanted.
        if (stale()) return;
        if (!outcome.ok) {
            this.endRun(act);
            failRun(outcome.error);
            return;
        }
        const meta = runMeta(request);
        let ids: string[];
        try {
            ids = await placeFeatures(this.api.feature, session.featureIds, buildFeatures(outcome.result, meta));
        } catch (err) {
            if (stale()) return;
            console.error('[sar] Could not add the features to the map', err);
            this.endRun(act);
            session.featureIds = [];
            failRun({ kind: 'failed' });
            return;
        }
        if (stale()) {
            // Cancelled while the features were being added: take them off the map again.
            session.featureIds = [];
            await this.api.feature.remove(ids).catch(() => undefined);
            return;
        }
        this.endRun(act);
        try {
            if (outcome.result.bbox) act.layers?.fit(outcome.result.bbox);
        } catch (err) {
            console.warn('[sar] Could not move the map to the result', err);
        }
        finishRun(outcome.result, meta, ids);
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

    /** Removes the features, the preview dot and the form values. */
    private clear(act: Activation): void {
        if (act.dead || session.run === 'running') return;
        const ids = [...session.featureIds];
        try {
            act.layers?.clear();
        } catch (err) {
            console.warn('[sar] Could not clear the map', err);
        }
        clearAll();
        if (ids.length) {
            this.api.feature.remove(ids).catch((err: unknown) => console.warn('[sar] Could not remove the features', err));
        }
    }

    // Sharing

    /** One share action at a time: busy flag, message or error, and an announcement. */
    private async shareTask(act: Activation, task: () => Promise<string>): Promise<void> {
        if (act.dead || session.share.busy || !session.result) return;
        session.share.busy = true;
        session.share.message = '';
        session.share.error = '';
        try {
            const message = await task();
            if (act.dead) return;
            session.share.message = message;
            announce(message);
        } catch (err) {
            if (act.dead) return;
            const text = err instanceof Error && err.message !== '' ? err.message : 'The action failed.';
            session.share.error = text;
            announce(`Error: ${text}`);
        } finally {
            session.share.busy = false;
        }
    }

    /**
     * The features as they are on the map now, so edits are included. When they were moved into a Data Sync,
     * or none are left, they are rebuilt from the result.
     */
    private async currentFeatures(): Promise<SarFeature[]> {
        const result = session.result as AnalysisResult;
        const meta = session.meta as RunMeta;
        const ids = session.featureIds;
        if (ids.length && session.movedTo.length === 0) {
            const wanted = new Set(ids);
            const rows = await this.api.feature.list({ filter: (f) => wanted.has(String(f.id)) });
            const found = ids.map((id) => rows.find((r) => String(r.id) === id)).filter((r): r is NonNullable<typeof r> => r !== undefined);
            if (found.length) return found.map(toSarFeature);
        }
        return buildFeatures(result, meta);
    }

    private async moveToDataSync(missions: MissionChoice[]): Promise<string> {
        if (missions.length === 0) throw new Error('Choose at least one Data Sync.');
        const features = await this.currentFeatures();
        const done = await addToDataSync(this.api.feature, features, missions);
        // The Data Sync copies are the features now: take the originals off the map (the host Share dialog does the same).
        const local = [...session.featureIds];
        session.featureIds = [];
        session.movedTo = done;
        if (local.length) {
            await this.api.feature.remove(local).catch((err: unknown) => console.warn('[sar] Could not remove the local features', err));
        }
        const noun = features.length === 1 ? 'feature' : 'features';
        return `Added ${features.length} ${noun} to ${done.map((n) => `"${n}"`).join(', ')}. They moved there from your map.`;
    }

    private async makePackage(options: { name: string; missions: MissionChoice[] }): Promise<string> {
        const features = await this.currentFeatures();
        const { blob, filename } = await createDataPackage(host, features, { name: options.name, missionGuids: options.missions.map((m) => m.guid) });
        saveBlob(blob, filename);
        const extra = options.missions.length ? ` It was also added to ${options.missions.map((m) => `"${m.name}"`).join(', ')}.` : '';
        return `Data package "${options.name}" created and downloaded.${extra}`;
    }

    private async downloadFiles(): Promise<string> {
        const features = await this.currentFeatures();
        const file = buildExportFiles(features, session.result as AnalysisResult, session.meta as RunMeta);
        saveBlob(new Blob([file.bytes as BlobPart], { type: file.mime }), file.filename);
        return `Downloaded ${file.filename}.`;
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

function runMeta(request: CalcRequest): RunMeta {
    const meta: RunMeta = { mode: request.mode, ranAt: new Date().toISOString(), ipp: { ...request.body.ipp } };
    if (request.mode === 'travel-time') {
        meta.speedKmh = request.body.speed_kmh;
        meta.bandsHours = [...request.body.intervals_hours];
    } else {
        meta.profile = request.body.profile;
        if (request.body.ecoregion) meta.ecoregion = request.body.ecoregion;
        if (request.body.terrain) meta.terrain = request.body.terrain;
    }
    return meta;
}

/** A feature row from the host store as the shape the exports and the Data Sync copies use. */
function toSarFeature(row: { id: unknown; path?: unknown; properties?: unknown; geometry: unknown }): SarFeature {
    const id = String(row.id);
    const props = (row.properties ?? {}) as Record<string, unknown>;
    return {
        id,
        type: 'Feature',
        path: typeof row.path === 'string' ? row.path : FEATURE_PATH,
        properties: {
            ...props,
            id,
            type: typeof props.type === 'string' ? props.type : '',
            callsign: typeof props.callsign === 'string' ? props.callsign : '',
            remarks: typeof props.remarks === 'string' ? props.remarks : '',
        },
        geometry: row.geometry as SarFeature['geometry'],
    };
}
