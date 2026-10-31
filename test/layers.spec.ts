import { afterEach, describe, expect, it, vi } from 'vitest';
import { attributionText, IDLE_THROTTLE_MS, markerAnchor, SarLayers } from '../lib/layers.ts';
import { parseResult } from '../lib/result.ts';
import { FakeMap } from './fake-map.ts';
import { feature, okBody } from './fixtures.ts';
import type { TravelTimeResult } from '../lib/types.ts';

const result = (): TravelTimeResult => parseResult(okBody()) as TravelTimeResult;
const ours = (m: FakeMap): string[] => m.layers.map((l) => l.id).filter((id) => id.startsWith('taknz-sar-'));
const ourSources = (m: FakeMap): string[] => [...m.sources.keys()].filter((id) => id.startsWith('taknz-sar-'));
const features = (m: FakeMap, id: string): { properties: Record<string, unknown> }[] => (m.getSource(id)?.data?.features ?? []) as { properties: Record<string, unknown> }[];

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
        expect(markerAnchor({ layers: [{ id: 'taknz-sar-label', type: 'symbol' }, { id: 'x', type: 'fill' }] })).toBeUndefined();
    });
});

describe('SarLayers.show', () => {
    it('adds the three sources and the contour layers with the right ids and paint', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        expect(ourSources(map).sort()).toEqual(['taknz-sar-contours', 'taknz-sar-labels']);
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label']);
        const fill = map.getLayer('taknz-sar-fill')!;
        expect(fill.type).toBe('fill');
        expect(fill.source).toBe('taknz-sar-contours');
        expect(fill.paint).toEqual({ 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 });
        const outline = map.getLayer('taknz-sar-outline')!;
        expect(outline.type).toBe('line');
        expect(outline.paint).toMatchObject({ 'line-color': ['get', 'color'], 'line-width': 2.5 });
        const label = map.getLayer('taknz-sar-label')!;
        expect(label.type).toBe('symbol');
        expect(label.source).toBe('taknz-sar-labels');
        expect(label.layout).toMatchObject({ 'text-field': ['get', 'text'], 'text-font': ['Open Sans Bold'] });
        expect(label.paint).toMatchObject({ 'text-halo-width': 2 });
    });
    it('draws larger bands underneath: sorted data and a sort key of minus hours', () => {
        const map = new FakeMap();
        new SarLayers(map).show(result());
        expect(features(map, 'taknz-sar-contours').map((f) => f.properties.hours)).toEqual([4, 2, 1]);
        const key = map.getLayer('taknz-sar-fill')!.layout!['fill-sort-key'];
        expect(key).toEqual(['-', 0, ['get', 'hours']]);
    });
    it('labels use the text built from hours, not the engine label', () => {
        const map = new FakeMap();
        new SarLayers(map).show(parseResult(okBody({ contours: { type: 'FeatureCollection', features: [feature(1), feature(2.5)] } }))!);
        expect(features(map, 'taknz-sar-labels').map((f) => f.properties.text)).toEqual(['2.5 h', '1 h']);
    });
    it('inserts below the marker layers', () => {
        const map = new FakeMap();
        new SarLayers(map).show(result());
        const ids = map.layers.map((l) => l.id);
        expect(ids.indexOf('taknz-sar-label')).toBeLessThan(ids.indexOf('mf-polygons'));
        expect(ids.indexOf('basemap')).toBeLessThan(ids.indexOf('taknz-sar-fill'));
    });
    it('fits the map to the bbox with room for the panel', () => {
        const map = new FakeMap();
        new SarLayers(map).show(result());
        expect(map.fitCalls).toHaveLength(1);
        expect(map.fitCalls[0].bounds).toEqual([[171, -41], [173, -39]]);
        expect(map.fitCalls[0].options.padding.bottom).toBeGreaterThan(map.fitCalls[0].options.padding.top);
        expect(map.fitCalls[0].options.duration).toBe(500);
    });
    it('does not animate under prefers-reduced-motion', () => {
        const original = window.matchMedia;
        window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof window.matchMedia;
        try {
            const map = new FakeMap();
            new SarLayers(map).show(result());
            expect(map.fitCalls[0].options.duration).toBe(0);
        } finally {
            window.matchMedia = original;
        }
    });
    it('does not fit when the result has no bbox', () => {
        const map = new FakeMap();
        new SarLayers(map).show(parseResult(okBody({ bbox: null }))!);
        expect(map.fitCalls).toHaveLength(0);
    });
    it('replaces the data of a second result without adding layers again', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        const adds = map.counters.addLayer;
        layers.show(parseResult(okBody({ contours: { type: 'FeatureCollection', features: [feature(3)] } }))!);
        expect(map.counters.addLayer).toBe(adds);
        expect(features(map, 'taknz-sar-contours').map((f) => f.properties.hours)).toEqual([3]);
    });
    it('works on a map with no marker layers (top of the stack)', () => {
        const map = new FakeMap([{ id: 'background', type: 'background' }]);
        new SarLayers(map).show(result());
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label']);
    });
});

describe('attribution on the map', () => {
    const attribution = (m: FakeMap): unknown => (m.getSource('taknz-sar-contours')?.spec as { attribution?: string }).attribution;
    it('puts the engine attribution on the contours source, so the map shows it while contours are visible', () => {
        const map = new FakeMap();
        new SarLayers(map).show(result());
        expect(attribution(map)).toBe('Synthetic attribution one | Synthetic attribution two');
    });
    it('escapes markup in the attribution lines', () => {
        const r = { ...result(), attribution: ['A & B <b>"x"</b>'] };
        expect(attributionText(r)).toBe('A &amp; B &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    });
    it('leaves the key out when there are no attribution lines', () => {
        const map = new FakeMap();
        new SarLayers(map).show({ ...result(), attribution: [] });
        expect('attribution' in (map.getSource('taknz-sar-contours')!.spec as object)).toBe(false);
    });
    it('keeps it after a style reload and replaces it when a new result has different lines', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        map.reloadStyle('taknz-sar-');
        map.emit('style.load');
        expect(attribution(map)).toBe('Synthetic attribution one | Synthetic attribution two');
        layers.show({ ...result(), attribution: ['Synthetic attribution three'] });
        expect(attribution(map)).toBe('Synthetic attribution three');
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label']);
    });
});
describe('SarLayers.setIpp', () => {
    it('adds the start point on top of the contours, whatever the order of calls', () => {
        const a = new FakeMap();
        const la = new SarLayers(a);
        la.setIpp([172, -40]);
        la.show(result());
        const b = new FakeMap();
        const lb = new SarLayers(b);
        lb.show(result());
        lb.setIpp([172, -40]);
        const expected = ['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label', 'taknz-sar-ipp'];
        expect(ours(a)).toEqual(expected);
        expect(ours(b)).toEqual(expected);
        expect(a.layers.map((l) => l.id).indexOf('taknz-sar-ipp')).toBeLessThan(a.layers.map((l) => l.id).indexOf('mf-polygons'));
        const ipp = b.getLayer('taknz-sar-ipp')!;
        expect(ipp.type).toBe('circle');
        expect(features(b, 'taknz-sar-ipp')).toHaveLength(1);
    });
    it('moves the start point and removes it with null', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.setIpp([172, -40]);
        layers.setIpp([173, -41]);
        expect((features(map, 'taknz-sar-ipp')[0] as unknown as { geometry: { coordinates: number[] } }).geometry.coordinates).toEqual([173, -41]);
        layers.setIpp(null);
        expect(ours(map)).toEqual([]);
        expect(ourSources(map)).toEqual([]);
        expect(layers.isListening).toBe(false);
    });
    it('keeps the contours when only the start point is removed', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        layers.setIpp([172, -40]);
        layers.setIpp(null);
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label']);
        expect(layers.isListening).toBe(true);
    });
});

describe('SarLayers.clear and dispose', () => {
    it('leave no layer, source or listener', () => {
        for (const method of ['clear', 'dispose'] as const) {
            const map = new FakeMap();
            const before = map.layers.map((l) => l.id);
            const layers = new SarLayers(map);
            layers.show(result());
            layers.setIpp([172, -40]);
            expect(map.listenerCount()).toBe(2);
            layers[method]();
            expect(map.layers.map((l) => l.id)).toEqual(before);
            expect(ourSources(map)).toEqual([]);
            expect(map.listenerCount()).toBe(0);
            expect(layers.isListening).toBe(false);
        }
    });
    it('are safe to call twice and before anything was drawn', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.clear();
        layers.dispose();
        layers.dispose();
        expect(map.listenerCount()).toBe(0);
    });
    it('does not draw again after dispose, and a style reload then adds nothing', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        layers.dispose();
        layers.show(result());
        layers.setIpp([172, -40]);
        layers.ensure();
        map.emit('style.load');
        expect(ours(map)).toEqual([]);
        expect(map.listenerCount()).toBe(0);
    });
    it('draws again after clear', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        layers.clear();
        layers.show(result());
        expect(ours(map)).toHaveLength(3);
        expect(map.listenerCount()).toBe(2);
    });
    it('does not touch layers of other owners', () => {
        const map = new FakeMap();
        map.addForeign({ id: 'taknz-wx-clouds', type: 'raster', source: 'wx' });
        const layers = new SarLayers(map);
        layers.show(result());
        layers.dispose();
        expect(map.getLayer('taknz-wx-clouds')).toBeDefined();
        expect(map.getSource('wx')).toBeDefined();
    });
});

describe('re-adding after the map changed', () => {
    it('a style.load event re-adds every source and layer with the current data', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        layers.setIpp([172, -40]);
        map.reloadStyle('taknz-sar-');
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label', 'taknz-sar-ipp']);
        expect(ourSources(map).sort()).toEqual(['taknz-sar-contours', 'taknz-sar-ipp', 'taknz-sar-labels']);
        expect(features(map, 'taknz-sar-contours')).toHaveLength(3);
        expect(features(map, 'taknz-sar-labels')).toHaveLength(3);
        expect(features(map, 'taknz-sar-ipp')).toHaveLength(1);
        expect(map.layers.map((l) => l.id).indexOf('taknz-sar-ipp')).toBeLessThan(map.layers.map((l) => l.id).indexOf('mf-polygons'));
    });
    it('style.load adds nothing when nothing is shown', () => {
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        layers.clear();
        map.emit('style.load');
        expect(ours(map)).toEqual([]);
    });
    it('idle re-adds a missing layer in its place, throttled', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        map.removeLayer('taknz-sar-outline');
        map.emit('idle');
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label']);
        map.removeLayer('taknz-sar-outline');
        map.emit('idle');
        expect(map.getLayer('taknz-sar-outline')).toBeUndefined();
        vi.setSystemTime(1_000_000 + IDLE_THROTTLE_MS + 1);
        map.emit('idle');
        expect(ours(map)).toEqual(['taknz-sar-fill', 'taknz-sar-outline', 'taknz-sar-label']);
    });
    it('idle moves our layers back below markers that were added under them', () => {
        vi.useFakeTimers();
        vi.setSystemTime(2_000_000);
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        map.addForeign({ id: 'late-markers', type: 'symbol', source: '-1' }, 'taknz-sar-fill');
        map.emit('idle');
        const ids = map.layers.map((l) => l.id);
        expect(ids.indexOf('taknz-sar-label')).toBeLessThan(ids.indexOf('late-markers'));
        expect(ids.indexOf('taknz-sar-fill')).toBeLessThan(ids.indexOf('taknz-sar-outline'));
    });
    it('idle does nothing when everything is in place', () => {
        vi.useFakeTimers();
        vi.setSystemTime(3_000_000);
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        const c = { ...map.counters };
        map.emit('idle');
        expect(map.counters).toEqual(c);
    });
    it('leaves no timer behind', () => {
        vi.useFakeTimers();
        const map = new FakeMap();
        const layers = new SarLayers(map);
        layers.show(result());
        map.emit('idle');
        layers.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does nothing while the map has no style yet', () => {
        const map = new FakeMap();
        map.getStyle = () => undefined as never;
        const layers = new SarLayers(map);
        expect(() => layers.show(result())).not.toThrow();
        expect(ours(map)).toEqual([]);
    });
});
