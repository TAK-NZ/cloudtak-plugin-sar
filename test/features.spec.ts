import { describe, expect, it } from 'vitest';
import { buildFeatures, copyForMission, ippRemarks, ringName } from '../lib/features.ts';
import type { SarFeature } from '../lib/features.ts';
import { parseResult } from '../lib/result.ts';
import type { RunMeta, TarrResult, TravelTimeResult } from '../lib/types.ts';
import { feature, okBody, ring, tarrBody } from './fixtures.ts';

const NOW = new Date('2026-03-01T12:00:00Z');
const travelMeta: RunMeta = { mode: 'travel-time', ranAt: '2026-03-01T12:00:00Z', ipp: { lat: -40, lng: 172 }, speedKmh: 2.5, bandsHours: [1, 2, 4] };
const tarrMeta: RunMeta = { mode: 'tarr', ranAt: '2026-03-01T12:00:00Z', ipp: { lat: -40, lng: 172 }, profile: 'Hiker', ecoregion: 'Temperate', terrain: 'Mountainous' };
const travel = (over: Record<string, unknown> = {}): TravelTimeResult => parseResult(okBody(over)) as TravelTimeResult;
const tarr = (over: Record<string, unknown> = {}): TarrResult => parseResult(tarrBody(over), 'tarr') as TarrResult;
const counter = (): (() => string) => {
    let n = 0;
    return () => `id-${++n}`;
};
const build = (r: TravelTimeResult | TarrResult, m: RunMeta): SarFeature[] => buildFeatures(r, m, counter(), NOW);
const prop = (f: SarFeature, key: string): unknown => f.properties[key];

describe('travel time features', () => {
    const features = build(travel(), travelMeta);

    it('makes one polygon per band, largest first, and the start point last', () => {
        expect(features.map((f) => f.properties.callsign)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(features.map((f) => f.properties.type)).toEqual(['u-d-f', 'u-d-f', 'u-d-f', 'u-d-p']);
        expect(features.slice(0, 3).map((f) => f.geometry.type)).toEqual(['Polygon', 'Polygon', 'Polygon']);
    });

    it('gives each polygon the band colour, stroke, fill and CoT fields', () => {
        const f = features[0];
        expect(f.id).toBe('id-1');
        expect(f.type).toBe('Feature');
        expect(f.path).toBe('/SAR/');
        expect(f.properties).toMatchObject({
            id: 'id-1', type: 'u-d-f', how: 'h-g-i-g-o', archived: true,
            stroke: '#fbc02d', 'stroke-width': 3, 'stroke-opacity': 1, 'stroke-style': 'solid', fill: '#fbc02d', 'fill-opacity': 0.15,
            time: '2026-03-01T12:00:00.000Z', start: '2026-03-01T12:00:00.000Z', stale: '2026-03-02T12:00:00.000Z',
        });
        expect(prop(f, 'center')).toEqual([expect.any(Number), expect.any(Number)]);
    });
    it('fills the travel time bands like the terrain-adjusted TARR rings', () => {
        for (const f of features.slice(0, 3)) expect(f.properties['fill-opacity']).toBe(0.15);
        expect(features[3].properties['fill-opacity']).toBeUndefined();
    });

    it('writes remarks with the speed, the bands, the start point, the run time, the reach sentence and the disclaimer', () => {
        const remarks = String(prop(features[1], 'remarks'));
        expect(remarks).toContain('Travel time band 2 h');
        expect(remarks).toContain('2.5 km/h');
        expect(remarks).toContain('Bands: 1 h, 2 h, 4 h.');
        expect(remarks).toContain('Start point -40.00000, 172.00000.');
        expect(remarks).toContain('Run 2026-03-01 12:00 UTC.');
        expect(remarks).toContain('reach, not where a person is');
        expect(remarks.endsWith('Synthetic disclaimer text.')).toBe(true);
    });

    it('makes the start point a u-d-p marker called SAR IPP with remarks on mode, speed, bands and time', () => {
        const ipp = features[3];
        expect(ipp.geometry).toEqual({ type: 'Point', coordinates: [172, -40] });
        expect(ipp.properties).toMatchObject({
            type: 'u-d-p', callsign: 'SAR IPP', 'marker-color': '#FFD600', 'marker-opacity': 1, archived: true, center: [172, -40],
        });
        expect(ipp.properties.remarks).toBe('Initial Planning Point. Mode: Travel Time, speed 2.5 km/h, bands 1, 2, 4 h. Run 2026-03-01 12:00 UTC.');
    });

    it('uses distinct ids and does not change the result order', () => {
        const r = travel();
        const f = build(r, travelMeta);
        expect(new Set(f.map((x) => x.id)).size).toBe(f.length);
        expect(r.contours.map((c) => c.properties.hours)).toEqual([1, 2, 4]);
    });

    it('names a fractional band without trailing zeros', () => {
        const r = travel({ contours: { type: 'FeatureCollection', features: [feature(0.25), feature(2.5)] } });
        expect(build(r, travelMeta).map((f) => f.properties.callsign)).toEqual(['SAR 2.5 h', 'SAR 0.25 h', 'SAR IPP']);
    });

    it('uses the plugin colours for the bands, not the colour the engine sent', () => {
        const r = travel({ contours: { type: 'FeatureCollection', features: [feature(1, { color: '#00bcd4' }), feature(2, { color: '#4caf50' })] } });
        const f = build(r, travelMeta);
        expect(f.map((x) => [x.properties.callsign, x.properties.stroke, x.properties.fill])).toEqual([
            ['SAR 2 h', '#f57c00', '#f57c00'], ['SAR 1 h', '#d32f2f', '#d32f2f'], ['SAR IPP', undefined, undefined],
        ]);
    });
});

describe('MultiPolygon and holes', () => {
    const square = (x: number): number[][][] => [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]];
    const hole = [[[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4], [0.2, 0.2]]];

    it('splits a MultiPolygon into one feature per part with a suffix', () => {
        const multi = { ...feature(2), geometry: { type: 'MultiPolygon', coordinates: [square(0), square(5), square(9)] } };
        const f = build(travel({ contours: { type: 'FeatureCollection', features: [multi] } }), travelMeta);
        expect(f.map((x) => x.properties.callsign)).toEqual(['SAR 2 h', 'SAR 2 h (2)', 'SAR 2 h (3)', 'SAR IPP']);
        expect(f.slice(0, 3).every((x) => x.geometry.type === 'Polygon')).toBe(true);
        expect(new Set(f.map((x) => x.id)).size).toBe(4);
    });

    it('keeps inner rings on the feature', () => {
        const withHole = { ...feature(2), geometry: { type: 'Polygon', coordinates: [square(0)[0], hole[0]] } };
        const f = build(travel({ contours: { type: 'FeatureCollection', features: [withHole] } }), travelMeta);
        expect((f[0].geometry as { coordinates: unknown[] }).coordinates).toHaveLength(2);
    });
});

describe('TARR features', () => {
    const features = build(tarr(), tarrMeta);

    it('makes six rings in the relay order and the start point last', () => {
        expect(features.map((f) => f.properties.callsign)).toEqual([
            'Koester 75%, plain circle (3.22 km)',
            'Koester 75%, terrain-adjusted (3.703 km)',
            'Koester 50%, plain circle (1.77 km)',
            'Koester 50%, terrain-adjusted (2.036 km)',
            'Koester 25%, plain circle (0.64 km)',
            'Koester 25%, terrain-adjusted (0.736 km)',
            'SAR IPP',
        ]);
    });

    it('names rings by source, percentage, kind and distance', () => {
        const r = tarr();
        expect(ringName(r.rings[3])).toBe('Koester 50%, terrain-adjusted (2.036 km)');
        expect(ringName({ ...r.rings[3], distanceKm: null })).toBe('Koester 50%, terrain-adjusted');
    });

    it('draws the plain circle dashed and without fill, and the terrain ring solid with fill', () => {
        expect(features[0].properties).toMatchObject({ 'stroke-style': 'dashed', 'fill-opacity': 0, stroke: '#fbc02d' });
        expect(features[1].properties).toMatchObject({ 'stroke-style': 'solid', 'fill-opacity': 0.15, stroke: '#fbc02d' });
    });

    it('states the multiplier, region, distances and the not-calibrated sentences in the remarks of a terrain ring', () => {
        const remarks = String(prop(features[3], 'remarks'));
        expect(remarks).toContain('Koester 50%, terrain-adjusted. Terrain-adjusted range ring for the subject profile Hiker (Temperate, Mountainous).');
        expect(remarks).toContain('Koester distance 1.77 km, multiplier 1.15 (Coconino County, Arizona), calibrated distance 2.036 km.');
        expect(remarks).toContain('Not calibrated for New Zealand.');
        expect(remarks).toContain('not the chance of finding someone in New Zealand');
        expect(remarks).toContain('Run 2026-03-01 12:00 UTC.');
        expect(remarks.endsWith('Synthetic TARR disclaimer.')).toBe(true);
    });

    it('says a plain circle has no terrain and no multiplier', () => {
        const remarks = String(prop(features[2], 'remarks'));
        expect(remarks).toContain('Plain circle at the Koester distance of 1.77 km');
        expect(remarks).toContain('with no terrain and no multiplier');
        expect(remarks).not.toContain('multiplier 1.15');
    });

    it('makes the start point remarks name the mode and the subject profile', () => {
        const ipp = features[6];
        expect(ipp.properties).toMatchObject({ type: 'u-d-p', callsign: 'SAR IPP' });
        expect(ipp.properties.remarks).toBe('Initial Planning Point. Mode: TARR, subject Hiker (Temperate, Mountainous). Run 2026-03-01 12:00 UTC.');
        expect(ippRemarks(tarr(), { ...tarrMeta, ecoregion: undefined, terrain: undefined })).toContain('subject Hiker.');
    });

    it('keeps the hole of a terrain ring', () => {
        expect((features[1].geometry as { coordinates: unknown[] }).coordinates).toHaveLength(2);
    });

    it('skips a ring that is missing and still ends with the start point', () => {
        const f = build(tarr({ contours: { type: 'FeatureCollection', features: [ring(50, 'plain')] } }), tarrMeta);
        expect(f.map((x) => x.properties.callsign)).toEqual(['Koester 50%, plain circle (1.77 km)', 'SAR IPP']);
    });
});

describe('generated text', () => {
    it('contains none of the words the plugin avoids', () => {
        const all = [...build(travel(), travelMeta), ...build(tarr(), tarrMeta)];
        expect(/probab|likelihood|percentile|confiden/i.test(JSON.stringify(all))).toBe(false);
    });
});

describe('copyForMission', () => {
    it('returns deep copies with fresh ids in id, properties.id and properties.uid', () => {
        const features = build(travel(), travelMeta);
        const copies = copyForMission(features, counter());
        expect(copies.map((f) => f.id)).toEqual(['id-1', 'id-2', 'id-3', 'id-4']);
        for (const c of copies) {
            expect(c.properties.id).toBe(c.id);
            expect(c.properties.uid).toBe(c.id);
        }
        expect(features[0].id).toBe('id-1');
        const originalIds = features.map((f) => f.id);
        const second = copyForMission(features);
        expect(second.every((c) => !originalIds.includes(c.id))).toBe(true);
        (copies[0].properties as Record<string, unknown>).callsign = 'changed';
        expect(features[0].properties.callsign).toBe('SAR 4 h');
        expect(features[0].properties.uid).toBeUndefined();
    });
});
