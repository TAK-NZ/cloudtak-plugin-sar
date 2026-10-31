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
}

export interface FakeApi {
    api: PluginAPI;
    /** Every menu / route / bottom-bar / router call as a string, in order. */
    calls: string[];
    menuItems: { key: string; label?: string; tooltip?: string; route?: string }[];
    routes: { name?: unknown; component?: unknown }[];
    /** The bottom bar items now registered. */
    bar: Set<string>;
    features: FakeFeature[];
}

/** Records every menu / route / bottom-bar / router call. */
export function makeFakeApi(map: EventedFakeMap | Error = new EventedFakeMap(), features: FakeFeature[] = []): FakeApi {
    const calls: string[] = [];
    const menuItems: FakeApi['menuItems'] = [];
    const routes: FakeApi['routes'] = [];
    const bar = new Set<string>();
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
        bottomBar: {
            add: (item: { key: string }) => {
                bar.add(item.key);
                calls.push(`bottomBar.add:${item.key}`);
            },
            remove: (key: string) => {
                bar.delete(key);
                calls.push(`bottomBar.remove:${key}`);
            },
        },
        router: {
            removeRoute: (name: string) => {
                calls.push(`router.removeRoute:${name}`);
            },
        },
        feature: {
            list: async (opts: { filter?: (f: FakeFeature) => boolean } = {}) => (opts.filter ? features.filter(opts.filter) : features),
        },
        get map(): EventedFakeMap {
            if (map instanceof Error) throw map;
            return map;
        },
    };
    return { api: api as unknown as PluginAPI, calls, menuItems, routes, bar, features };
}
