import { describe, expect, it } from 'vitest';
import { BAND_COLORS } from '../lib/constants.ts';
import { ippPoint, parseResult, withoutPlainCircles } from '../lib/result.ts';
import type { TarrResult, TravelTimeResult } from '../lib/types.ts';
import { formatBuilt, formatElapsed, formatHours, formatKm, formatStamp, formatUtc } from '../lib/format.ts';
import type { Json } from './fixtures.ts';
import { feature, okBody, ring, tarrBody } from './fixtures.ts';
const travel = (raw: unknown): TravelTimeResult | null => parseResult(raw) as TravelTimeResult | null;
const tarr = (raw: unknown): TarrResult | null => parseResult(raw, 'tarr') as TarrResult | null;

describe('parseResult', () => {
    it('reads a valid body', () => {
        const r = travel(okBody());
        expect(r).not.toBeNull();
        expect(r?.contours).toHaveLength(3);
        expect(r?.parameters).toEqual({ speed_kmh: 2.5, radius_km: 12, intervals_hours: [1, 2, 4] });
        expect(r?.bbox).toEqual({ west: 171, south: -41, east: 173, north: -39 });
        expect(r?.warnings.map((w) => w.severity)).toEqual(['warning', 'info']);
        expect(r?.osmBuiltAt).toBe('2026-03-01T12:00:00Z');
        expect(r?.disclaimer).toBe('Synthetic disclaimer text.');
        expect(r?.attribution).toHaveLength(2);
        expect(r?.timingSeconds).toBe(3.5);
    });
    it('rejects bodies that are not a travel-time result', () => {
        for (const raw of [null, 'x', [], {}, okBody({ status: 'error' }), okBody({ mode: 'other' }), okBody({ contours: null }),
            okBody({ contours: { type: 'Feature', features: [] } }), okBody({ contours: { type: 'FeatureCollection' } })]) {
            expect(travel(raw)).toBeNull();
        }
    });
    it('accepts a result with no contour', () => {
        expect(travel(okBody({ contours: { type: 'FeatureCollection', features: [] } }))?.contours).toEqual([]);
    });
    it('keeps a null osm_built_at as null', () => {
        expect(travel(okBody({ data: { osm_built_at: null } }))?.osmBuiltAt).toBeNull();
    });
    it('tolerates missing optional parts', () => {
        const raw: Json = okBody();
        for (const k of ['parameters', 'bbox', 'warnings', 'data', 'attribution', 'disclaimer', 'timings_s']) delete raw[k];
        const r = travel(raw);
        expect(r).not.toBeNull();
        expect(r?.bbox).toBeNull();
        expect(r?.warnings).toEqual([]);
        expect(r?.attribution).toEqual([]);
        expect(r?.disclaimer).toBe('');
        expect(r?.parameters.radius_km).toBeNull();
        expect(r?.timingSeconds).toBeNull();
    });
    it('skips bad contours and keeps the good ones', () => {
        const bad = [null, { type: 'Feature' }, feature(3, { hours: 'x' }), feature(0, { hours: 0 }),
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0]]] }, properties: { hours: 1 } }];
        const r = travel(okBody({ contours: { type: 'FeatureCollection', features: [feature(1), ...bad, feature(2)] } }));
        expect(r?.contours.map((c) => c.properties.hours)).toEqual([1, 2]);
    });
    it('drops half a label position', () => {
        const r = travel(okBody({ contours: { type: 'FeatureCollection', features: [feature(1, { label_lat: undefined })] } }));
        expect(r?.contours[0].properties.label_lat).toBeUndefined();
    });
    it('ignores the engine colours and colours the bands by rank, smallest first, whatever the order', () => {
        const r = travel(okBody({ contours: { type: 'FeatureCollection', features: [feature(4, { color: '#00bcd4' }), feature(1, { color: 'nope' }), feature(2.5)] } }));
        expect(r?.contours.map((c) => [c.properties.hours, c.properties.color])).toEqual([[4, '#fbc02d'], [1, '#d32f2f'], [2.5, '#f57c00']]);
    });
    it('starts the colours again after eight bands', () => {
        const hours = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
        const r = travel(okBody({ contours: { type: 'FeatureCollection', features: hours.map((h) => feature(h)) } }));
        expect(r?.contours.map((c) => c.properties.color)).toEqual([...BAND_COLORS, BAND_COLORS[0]]);
        expect(new Set(BAND_COLORS).size).toBe(BAND_COLORS.length);
    });
    it('drops malformed warnings and attribution entries', () => {
        const r = travel(okBody({ warnings: [null, { message: '' }, { severity: 'other', message: 'm' }], attribution: ['a', 3, ''] }));
        expect(r?.warnings).toEqual([{ severity: 'info', source: '', message: 'm' }]);
        expect(r?.attribution).toEqual(['a']);
    });
    it('rejects an inverted bbox', () => {
        expect(travel(okBody({ bbox: { west: 2, south: 0, east: 1, north: 1 } }))?.bbox).toBeNull();
    });
});

describe('parseResult: TARR', () => {
    it('reads a valid TARR body', () => {
        const r = tarr(tarrBody());
        expect(r?.mode).toBe('tarr');
        expect(r?.rings).toHaveLength(6);
        expect(r?.rings[1]).toMatchObject({ kind: 'terrain', percent: 75, label: 'Koester 75%, terrain-adjusted', color: '#fbc02d', koesterKm: 3.22, distanceKm: 3.703, multiplier: 1.15 });
        expect(r?.rings[1].thresholdM).toBeCloseTo(3703);
        expect(r?.rings[0]).toMatchObject({ kind: 'plain', distanceKm: 3.22 });
        expect(r?.rings[0].multiplier).toBeUndefined();
        expect(r?.parameters).toEqual({
            profile: 'Hiker', ecoregion: null, terrain: null,
            koesterKm: { p25: 0.64, p50: 1.77, p75: 3.22 }, calibratedKm: { p25: 0.736, p50: 2.036, p75: 3.703 }, radiusKm: 5.7,
        });
        expect(r?.calibration).toEqual({
            region: 'Coconino County, Arizona', note: 'Synthetic calibration note.', source: 'built-in', profileSpecific: true,
            multiplier: { p25: 1.15, p50: 1.15, p75: 1.15 },
        });
        expect(r?.disclaimer).toBe('Synthetic TARR disclaimer.');
        expect(r?.osmBuiltAt).toBe('2026-03-01T12:00:00Z');
    });
    it('only accepts the mode that was asked for', () => {
        expect(parseResult(tarrBody())).toBeNull();
        expect(parseResult(okBody(), 'tarr')).toBeNull();
        expect(parseResult(tarrBody({ contours: null }), 'tarr')).toBeNull();
    });
    it('skips rings with a bad kind, percent, label or geometry', () => {
        const bad = [null, ring(50, 'terrain', { kind: 'other' }), ring(50, 'terrain', { percent: 60 }), ring(50, 'terrain', { label: '' }),
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0]]] }, properties: ring(50, 'plain').properties }];
        const r = tarr(tarrBody({ contours: { type: 'FeatureCollection', features: [ring(25, 'plain'), ...bad, ring(25, 'terrain')] } }));
        expect(r?.rings.map((x) => `${x.kind}${x.percent}`)).toEqual(['plain25', 'terrain25']);
    });
    it('falls back to the default colour for a bad colour', () => {
        expect(tarr(tarrBody({ contours: { type: 'FeatureCollection', features: [ring(25, 'plain', { color: 'red' })] } }))?.rings[0].color).toBe('#3388ff');
    });
    it('tolerates a missing calibration and missing distances', () => {
        const raw = tarrBody();
        delete raw.calibration;
        raw.parameters = { profile: 'Hiker', koester_km: { p25: 1 } };
        const r = tarr(raw);
        expect(r?.calibration).toBeNull();
        expect(r?.parameters.koesterKm).toBeNull();
        expect(r?.parameters.calibratedKm).toBeNull();
        expect(r?.rings).toHaveLength(6);
    });
    it('keeps inner rings', () => {
        const hole = tarr(tarrBody())?.rings[1];
        expect(hole?.geometry.type === 'Polygon' && hole.geometry.coordinates.length).toBe(2);
    });
});

describe('ippPoint', () => {
    it('builds the start point as [lng, lat]', () => {
        expect(ippPoint(172, -40).geometry.coordinates).toEqual([172, -40]);
    });
});
describe('format', () => {
    it('formats hours', () => {
        expect(formatHours(1)).toBe('1 h');
        expect(formatHours(2.5)).toBe('2.5 h');
        expect(formatHours(0.25)).toBe('0.25 h');
        expect(formatHours(24)).toBe('24 h');
    });
    it('formats elapsed seconds', () => {
        expect(formatElapsed(0)).toBe('0 s');
        expect(formatElapsed(12.9)).toBe('12 s');
        expect(formatElapsed(65)).toBe('1 min 5 s');
        expect(formatElapsed(-3)).toBe('0 s');
        expect(formatElapsed(Number.NaN)).toBe('0 s');
    });
    it('formats the roads and trails date', () => {
        expect(formatBuilt('2026-03-01T12:00:00Z')).toBe('1 March 2026');
        expect(formatBuilt(null)).toBeNull();
        expect(formatBuilt('')).toBeNull();
        expect(formatBuilt('not a date')).toBeNull();
    });
    it('formats kilometres without rounding', () => {
        expect(formatKm(10)).toBe('10');
        expect(formatKm(12.5)).toBe('12.5');
        expect(formatKm(7.25)).toBe('7.25');
    });
    it('formats UTC times for text and file names', () => {
        expect(formatUtc('2026-03-01T12:05:59Z')).toBe('2026-03-01 12:05 UTC');
        expect(formatUtc('nonsense')).toBe('nonsense');
        expect(formatStamp('2026-03-01T12:05:59Z')).toBe('20260301-1205Z');
        expect(formatStamp('nonsense')).toBe('unknown-time');
    });
});
describe('withoutPlainCircles', () => {
    const rings = (...r: [25 | 50 | 75, 'terrain' | 'plain'][]): TarrResult => parseResult(tarrBody({
        contours: { type: 'FeatureCollection', features: r.map(([p, k]) => ring(p, k)) },
        warnings: [],
    }), 'tarr') as TarrResult;
    it('keeps the terrain rings and returns the same object when there is nothing to drop', () => {
        const only = rings([25, 'terrain'], [50, 'terrain']);
        expect(withoutPlainCircles(only)).toBe(only);
        const both = withoutPlainCircles(rings([25, 'terrain'], [25, 'plain'], [50, 'terrain'], [50, 'plain']));
        expect(both.rings.map((r) => `${r.percent} ${r.kind}`)).toEqual(['25 terrain', '50 terrain']);
        expect(both.warnings).toEqual([]);
    });
    it('notes each percentage that is left without any ring, once, smallest first', () => {
        const out = withoutPlainCircles(rings([75, 'plain'], [50, 'plain'], [25, 'terrain'], [25, 'plain']));
        expect(out.rings.map((r) => `${r.percent} ${r.kind}`)).toEqual(['25 terrain']);
        expect(out.warnings.map((w) => w.message)).toEqual([
            'No terrain ring for 50%. Its plain circle is hidden because plain circles are switched off.',
            'No terrain ring for 75%. Its plain circle is hidden because plain circles are switched off.',
        ]);
        expect(out.warnings.every((w) => w.severity === 'info')).toBe(true);
    });
});
