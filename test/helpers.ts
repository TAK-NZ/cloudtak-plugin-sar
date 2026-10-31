import type { PluginAPI } from '@tak-ps/cloudtak';
import type { PickEvent } from '../lib/picker.ts';
import { FakeMap } from './fake-map.ts';
import type { FakeLayer } from './fake-map.ts';

export { FakeMap };
export type { FakeLayer };

type Listener = (e: PickEvent) => void;

/** FakeMap plus events that carry a payload (MapLibre passes an event object) and a canvas. */
export class EventedFakeMap extends FakeMap {
    on(type: string, fn: Listener): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)?.add(fn as () => void);
    }

    off(type: string, fn: Listener): void {
        this.listeners.get(type)?.delete(fn as () => void);
    }

    emit(type: string, event: PickEvent = {}): void {
        for (const fn of [...(this.listeners.get(type) ?? [])]) (fn as Listener)(event);
    }

    /** A click at a position, as MapLibre reports it. */
    click(lng: number, lat: number): void {
        this.emit('click', { lngLat: { lng, lat } });
    }
}

export function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

export interface FakeFeature {
    id: string;
    path: string;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
    origin?: { mode: string; mode_id: string };
}

export interface FakeApi {
    api: PluginAPI;
    /** Every menu / route / router / feature call as a string, in order. */
    calls: string[];
    menuItems: { key: string; label?: string; tooltip?: string; route?: string; description?: string }[];
    routes: { name?: unknown; component?: unknown }[];
    /** The features on the "map": the ones passed in, then every add and remove. */
    features: FakeFeature[];
    /** Features filed in a Data Sync, by mission guid. */
    missionFeatures: Map<string, FakeFeature[]>;
    /** Every call of feature.add, with its options. */
    adds: { features: FakeFeature[]; mission?: string }[];
    removes: string[][];
    pushes: unknown[];
    /** Make the next feature.add reject once. */
    failNextAdd(error?: Error): void;
    failAddFor(mission: string, error?: Error): void;
}

/** Records every menu / route / router / feature call. The feature store behaves like the host's: add stores, remove deletes, list filters. */
export function makeFakeApi(map: EventedFakeMap | Error = new EventedFakeMap(), features: FakeFeature[] = []): FakeApi {
    const calls: string[] = [];
    const menuItems: FakeApi['menuItems'] = [];
    const routes: FakeApi['routes'] = [];
    const missionFeatures = new Map<string, FakeFeature[]>();
    const adds: FakeApi['adds'] = [];
    const removes: string[][] = [];
    const pushes: unknown[] = [];
    let failNext: Error | null = null;
    const failFor = new Map<string, Error>();
    const api = {
        routes: {
            add: (route: FakeApi['routes'][number], parent?: string) => {
                routes.push(route);
                calls.push(`routes.add:${String(route.name)}:${parent}`);
            },
        },
        menu: {
            add: (item: FakeApi['menuItems'][number]) => {
                menuItems.push(item);
                calls.push(`menu.add:${item.key}`);
            },
            remove: (key: string) => {
                calls.push(`menu.remove:${key}`);
            },
        },
        router: {
            removeRoute: (name: string) => {
                calls.push(`router.removeRoute:${name}`);
            },
            push: async (to: unknown) => {
                pushes.push(to);
                calls.push(`router.push:${typeof to === 'string' ? to : JSON.stringify(to)}`);
            },
        },
        feature: {
            list: async (opts: { filter?: (f: FakeFeature) => boolean } = {}) => (opts.filter ? features.filter(opts.filter) : [...features]),
            add: async (list: FakeFeature[], opts: { mission?: string } = {}) => {
                const copies = JSON.parse(JSON.stringify(list)) as FakeFeature[];
                adds.push({ features: copies, mission: opts.mission });
                calls.push(`feature.add:${copies.length}:${opts.mission ?? ''}`);
                if (failNext) {
                    const error = failNext;
                    failNext = null;
                    throw error;
                }
                const error = opts.mission ? failFor.get(opts.mission) : undefined;
                if (error) throw error;
                if (opts.mission) {
                    missionFeatures.set(opts.mission, [...(missionFeatures.get(opts.mission) ?? []), ...copies]);
                } else {
                    features.push(...copies);
                }
            },
            remove: async (ids: string[]) => {
                removes.push([...ids]);
                calls.push(`feature.remove:${ids.length}`);
                for (const id of ids) {
                    const at = features.findIndex((f) => f.id === id);
                    if (at >= 0) features.splice(at, 1);
                }
            },
        },
        get map(): EventedFakeMap {
            if (map instanceof Error) throw map;
            return map;
        },
    };
    return {
        api: api as unknown as PluginAPI,
        calls,
        menuItems,
        routes,
        features,
        missionFeatures,
        adds,
        removes,
        pushes,
        failNextAdd: (error = new Error('add failed')) => {
            failNext = error;
        },
        failAddFor: (mission, error = new Error('not loaded')) => {
            failFor.set(mission, error);
        },
    };
}

/** The radio input behind a pill of a TablerPillGroup, found by the text of its label. */
export function pill(w: { findAll(selector: string): { text(): string; attributes(name: string): string | undefined }[]; get(selector: string): { element: Element; trigger(event: string): Promise<void> } }, text: string) {
    const label = w.findAll('label.btn').find((l) => l.text() === text);
    if (!label) throw new Error(`No pill "${text}"`);
    return w.get(`#${label.attributes('for')}`);
}
