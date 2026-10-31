import { describe, expect, it } from 'vitest';
import { contourFeatures, ippPoint, labelPoints, parseResult } from '../lib/result.ts';
import { formatBuilt, formatElapsed, formatHours, formatKm } from '../lib/format.ts';
import type { Json } from './fixtures.ts';
import { feature, okBody } from './fixtures.ts';

describe('parseResult', () => {
    it('reads a valid body', () => {
        const r = parseResult(okBody());
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
            expect(parseResult(raw)).toBeNull();
        }
    });
    it('accepts a result with no contour', () => {
        expect(parseResult(okBody({ contours: { type: 'FeatureCollection', features: [] } }))?.contours).toEqual([]);
    });
    it('keeps a null osm_built_at as null', () => {
        expect(parseResult(okBody({ data: { osm_built_at: null } }))?.osmBuiltAt).toBeNull();
    });
    it('tolerates missing optional parts', () => {
        const raw: Json = okBody();
        for (const k of ['parameters', 'bbox', 'warnings', 'data', 'attribution', 'disclaimer', 'timings_s']) delete raw[k];
        const r = parseResult(raw);
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
        const r = parseResult(okBody({ contours: { type: 'FeatureCollection', features: [feature(1), ...bad, feature(2)] } }));
        expect(r?.contours.map((c) => c.properties.hours)).toEqual([1, 2]);
    });
    it('falls back to a default colour and drops half a label position', () => {
        const r = parseResult(okBody({ contours: { type: 'FeatureCollection', features: [feature(1, { color: 'red', label_lat: undefined })] } }));
        expect(r?.contours[0].properties.color).toBe('#3388ff');
        expect(r?.contours[0].properties.label_lat).toBeUndefined();
    });
    it('drops malformed warnings and attribution entries', () => {
        const r = parseResult(okBody({ warnings: [null, { message: '' }, { severity: 'other', message: 'm' }], attribution: ['a', 3, ''] }));
        expect(r?.warnings).toEqual([{ severity: 'info', source: '', message: 'm' }]);
        expect(r?.attribution).toEqual(['a']);
    });
    it('rejects an inverted bbox', () => {
        expect(parseResult(okBody({ bbox: { west: 2, south: 0, east: 1, north: 1 } }))?.bbox).toBeNull();
    });
});

describe('contourFeatures', () => {
    it('sorts largest first and builds its own text from hours', () => {
        const r = parseResult(okBody({
            contours: { type: 'FeatureCollection', features: [feature(0.25), feature(1), feature(2.5), feature(4)] },
        }));
        const f = contourFeatures(r!);
        expect(f.map((x) => x.properties.hours)).toEqual([4, 2.5, 1, 0.25]);
        expect(f.map((x) => x.properties.text)).toEqual(['4 h', '2.5 h', '1 h', '0.25 h']);
        expect(JSON.stringify(f)).not.toContain('1.0h');
    });
    it('does not change the result order', () => {
        const r = parseResult(okBody())!;
        contourFeatures(r);
        expect(r.contours.map((c) => c.properties.hours)).toEqual([1, 2, 4]);
    });
});

describe('labelPoints and ippPoint', () => {
    it('makes one point per contour with a label position, largest first', () => {
        const r = parseResult(okBody({
            contours: { type: 'FeatureCollection', features: [feature(1), feature(2, { label_lat: undefined, label_lng: undefined }), feature(4)] },
        }))!;
        const pts = labelPoints(r);
        expect(pts.map((p) => p.properties.text)).toEqual(['4 h', '1 h']);
        expect(pts[0].geometry.type).toBe('Point');
        expect(pts[0].geometry.coordinates).toEqual([172, -40 + 0.4]);
    });
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
});
