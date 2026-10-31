import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIT_PADDING, IDLE_THROTTLE_MS, markerAnchor, SarLayers } from '../lib/layers.ts';
import { FakeMap } from './fake-map.ts';

const ours = (m: FakeMap): string[] => m.layers.map((l) => l.id).filter((id) => id.startsWith('taknz-sar-'));
const ourSources = (m: FakeMap): string[] => [...m.sources.keys()].filter((id) => id.startsWith('taknz-sar-'));
const coordinates = (m: FakeMap): unknown => ((m.getSource('taknz-sar-ipp')?.data?.features?.[0] ?? {}) as { geometry?: { coordinates?: unknown } }).geometry?.coordinates;

afterEach(() => {
    vi.useRealTimers();
});

describe('markerAnchor', () => {
    it('is the first Map Features layer, then the first foreign symbol layer', () => {
        expect(markerAnchor(new FakeMap().getStyle())).toBe('mf-polygons');
        expect(markerAnchor({ layers: [{ id: 'a', type: 'fill' }, { id: 's', type: 'symbol' }] })).toBe('s');
        expect(markerAnchor({ layers: [{ id: 'a', type: 'fill' }] })).toBeUndefined();
    });

    it('skips our own layers', () => {
        expect(markerAnchor({ layers: [{ id: 'taknz-sar-ipp', type: 'symbol' }, { id: 'x', type: 'fill' }] })).toBeUndefined();
    });
});

describe('SarLayers preview of the start point', () => {
    it('adds one source and one circle layer below the marker layers', () => {
        const map = new FakeMap();
        new SarLayers(map).setIpp([172, -40]);
        expect(ourSources(map)).toEqual(['taknz-sar-ipp']);
        expect(ours(map)).toEqual(['taknz-sar-ipp']);
        expect(map.getLayer('taknz-sar-ipp')?.type).toBe('circle');
        const ids = map.layers.map((l) => l.id);
        expect(ids.indexOf('taknz-sar-ipp')).toBeLessThan(ids.indexOf('mf-polygons'));
        expect(ids.indexOf('basemap')).toBeLessThan(ids.indexOf('taknz-sar-ipp'));
        expect(coordinates(map)).toEqual([172, -40]);
    });

    it('goes on top of a map without marker layers', () => {
        const map = new FakeMap([{ id: 'background', type: 'background' }, { id: 'basemap', type: 'raster', source: 'basemap' }]);
        new SarLayers(map).setIpp([172, -40]);
        expect(map.layers.map((l) => l.id).pop()).toBe('taknz-sar-ipp');
    });

    it('moves the point and removes it with null, with its listeners', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        expect(layers.isListening).toBe(true);
        layers.setIpp([173, -41]);
        expect(coordinates(map)).toEqual([173, -41]);
        expect(map.counters.addLayer).toBe(1);
        layers.setIpp(null);
        expect(ours(map)).toEqual([]);
        expect(ourSources(map)).toEqual([]);
        expect(layers.isListening).toBe(false);
        expect(map.listenerCount()).toBe(0);
    });

    it('has no attribution on any source', () => {
        const map = new FakeMap();
        new SarLayers(map).setIpp([172, -40]);
        for (const id of ourSources(map)) expect('attribution' in (map.getSource(id)?.spec ?? {})).toBe(false);
    });

    it('does nothing for contours: no contour or label layers exist', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        expect(layers.layerIds).toEqual(['taknz-sar-ipp']);
    });
});

describe('SarLayers.fit', () => {
    const bbox = { west: 171, south: -41, east: 173, north: -39 };

    it('fits to the bounds with equal padding when the host reports no side offset', () => {
        const map = new FakeMap();
        new SarLayers(map).fit(bbox);
        expect(map.fitCalls).toHaveLength(1);
        expect(map.fitCalls[0].bounds).toEqual([[171, -41], [173, -39]]);
        expect(map.fitCalls[0].options.padding).toEqual({ top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING });
        expect(map.fitCalls[0].options.duration).toBe(500);
    });

    it('adds the host side offset on the right', () => {
        const map = new FakeMap();
        map.container.style.setProperty('--map-side-offset', '380px');
        document.body.appendChild(map.container);
        try {
            new SarLayers(map).fit(bbox);
            expect(map.fitCalls[0].options.padding.right).toBe(FIT_PADDING + 380);
            expect(map.fitCalls[0].options.padding.left).toBe(FIT_PADDING);
        } finally {
            map.container.remove();
        }
    });

    it('ignores an unreadable side offset', () => {
        const map = new FakeMap();
        map.container.style.setProperty('--map-side-offset', 'wide');
        document.body.appendChild(map.container);
        try {
            new SarLayers(map).fit(bbox);
            expect(map.fitCalls[0].options.padding.right).toBe(FIT_PADDING);
        } finally {
            map.container.remove();
        }
    });

    it('does not animate under prefers-reduced-motion', () => {
        const original = window.matchMedia;
        window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof window.matchMedia;
        try {
            const map = new FakeMap();
            new SarLayers(map).fit(bbox);
            expect(map.fitCalls[0].options.duration).toBe(0);
        } finally {
            window.matchMedia = original;
        }
    });

    it('does nothing after dispose', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.dispose();
        layers.fit(bbox);
        expect(map.fitCalls).toHaveLength(0);
    });
});

describe('SarLayers.clear and dispose', () => {
    it('leave no layer, source or listener', () => {
        const map = new FakeMap();
        const before = map.listenerCount();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        layers.clear();
        expect(ours(map)).toEqual([]);
        expect(ourSources(map)).toEqual([]);
        expect(map.listenerCount()).toBe(before);
        layers.setIpp([172, -40]);
        layers.dispose();
        expect(ours(map)).toEqual([]);
        expect(map.listenerCount()).toBe(before);
    });

    it('are safe to call twice and before anything was drawn', () => {
        const layers = new SarLayers(new FakeMap());
        expect(() => {
            layers.clear();
            layers.clear();
            layers.dispose();
            layers.dispose();
        }).not.toThrow();
    });

    it('does not draw again after dispose, and a style reload then adds nothing', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.dispose();
        layers.setIpp([172, -40]);
        map.emit('style.load');
        expect(ours(map)).toEqual([]);
    });

    it('does not touch layers of other owners', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        layers.dispose();
        expect(map.layers.map((l) => l.id)).toEqual(['background', 'basemap', 'mf-polygons', 'mf-lines', 'labels']);
    });
});

describe('re-adding after the map changed', () => {
    it('a style.load event re-adds the source and layer with the current point', () => {
        const map = new FakeMap();
        new SarLayers(map).setIpp([172, -40]);
        map.reloadStyle('taknz-sar-');
        expect(ours(map)).toEqual(['taknz-sar-ipp']);
        expect(coordinates(map)).toEqual([172, -40]);
        expect(map.layers.map((l) => l.id).indexOf('taknz-sar-ipp')).toBeLessThan(map.layers.map((l) => l.id).indexOf('mf-polygons'));
    });

    it('style.load adds nothing when nothing is shown', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        layers.clear();
        map.emit('style.load');
        expect(ours(map)).toEqual([]);
    });

    it('idle re-adds a missing layer, throttled', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const map = new FakeMap();
        new SarLayers(map).setIpp([172, -40]);
        map.removeLayer('taknz-sar-ipp');
        map.emit('idle');
        expect(ours(map)).toEqual(['taknz-sar-ipp']);
        map.removeLayer('taknz-sar-ipp');
        map.emit('idle');
        expect(map.getLayer('taknz-sar-ipp')).toBeUndefined();
        vi.setSystemTime(1_000_000 + IDLE_THROTTLE_MS + 1);
        map.emit('idle');
        expect(ours(map)).toEqual(['taknz-sar-ipp']);
    });

    it('idle moves the dot back below markers that were added under it', () => {
        vi.useFakeTimers();
        vi.setSystemTime(2_000_000);
        const map = new FakeMap();
        new SarLayers(map).setIpp([172, -40]);
        map.addForeign({ id: 'late-markers', type: 'symbol', source: '-1' }, 'taknz-sar-ipp');
        map.emit('idle');
        const ids = map.layers.map((l) => l.id);
        expect(ids.indexOf('taknz-sar-ipp')).toBeLessThan(ids.indexOf('late-markers'));
    });

    it('idle does nothing when everything is in place', () => {
        vi.useFakeTimers();
        vi.setSystemTime(3_000_000);
        const map = new FakeMap();
        new SarLayers(map).setIpp([172, -40]);
        const c = { ...map.counters };
        map.emit('idle');
        expect(map.counters).toEqual(c);
    });

    it('leaves no timer behind', () => {
        vi.useFakeTimers();
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        map.emit('idle');
        layers.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does nothing while the map has no style yet', () => {
        const map = new FakeMap();
        map.getStyle = () => undefined as never;
        expect(() => new SarLayers(map).setIpp([172, -40])).not.toThrow();
        expect(ours(map)).toEqual([]);
    });
});
