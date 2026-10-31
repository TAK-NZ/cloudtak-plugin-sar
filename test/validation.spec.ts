import { describe, expect, it } from 'vitest';
import {
    isBandHours, isRadius, normalizeBands, parseNumber, validateBand, validateBands, validateForm, validateLat, validateLng,
    validateRadius, validateSpeed, withLongestBand,
} from '../lib/validation.ts';

const ok = (r: { ok: boolean }): boolean => r.ok;

describe('parseNumber', () => {
    it('accepts plain decimals', () => {
        expect(parseNumber('2.5')).toBe(2.5);
        expect(parseNumber(' -40 ')).toBe(-40);
        expect(parseNumber('.5')).toBe(0.5);
        expect(parseNumber('+3')).toBe(3);
        expect(parseNumber('7.')).toBe(7);
    });
    it('rejects everything else', () => {
        for (const t of ['', ' ', 'abc', '1,5', '1e3', '0x10', 'Infinity', 'NaN', '--1', '1.2.3', '1 2', '-']) {
            expect(parseNumber(t), t).toBeNull();
        }
    });
});

describe('latitude and longitude', () => {
    it('checks both ends', () => {
        expect(ok(validateLat('-48'))).toBe(true);
        expect(ok(validateLat('-33.5'))).toBe(true);
        expect(ok(validateLat('-48.01'))).toBe(false);
        expect(ok(validateLat('-33.49'))).toBe(false);
        expect(ok(validateLng('165.5'))).toBe(true);
        expect(ok(validateLng('179.5'))).toBe(true);
        expect(ok(validateLng('165.49'))).toBe(false);
        expect(ok(validateLng('179.51'))).toBe(false);
    });
    it('explains the allowed range', () => {
        expect(validateLat('')).toEqual({ ok: false, error: 'Enter a latitude between -48 and -33.5.' });
        expect(validateLat('x')).toEqual({ ok: false, error: 'Latitude must be a decimal number between -48 and -33.5.' });
        expect(validateLng('10')).toEqual({ ok: false, error: 'Longitude must be between 165.5 and 179.5.' });
    });
});

describe('speed', () => {
    it('checks both ends', () => {
        expect(ok(validateSpeed('0.1'))).toBe(true);
        expect(ok(validateSpeed('10'))).toBe(true);
        expect(ok(validateSpeed('0.09'))).toBe(false);
        expect(ok(validateSpeed('10.01'))).toBe(false);
        expect(ok(validateSpeed('0'))).toBe(false);
    });
    it('names the unit in the message', () => {
        expect(validateSpeed('11')).toEqual({ ok: false, error: 'Speed must be between 0.1 and 10 km/h.' });
    });
    it('rejects comma, exponent and empty', () => {
        expect(ok(validateSpeed('2,5'))).toBe(false);
        expect(ok(validateSpeed('1e1'))).toBe(false);
        expect(ok(validateSpeed(''))).toBe(false);
    });
});

describe('time bands', () => {
    it('checks each band at both ends', () => {
        expect(ok(validateBand('0.25'))).toBe(true);
        expect(ok(validateBand('24'))).toBe(true);
        expect(ok(validateBand('0.24'))).toBe(false);
        expect(ok(validateBand('24.01'))).toBe(false);
        expect(ok(validateBands([0.25, 24]))).toBe(true);
        expect(ok(validateBands([0.24]))).toBe(false);
        expect(ok(validateBands([24.01]))).toBe(false);
        expect(ok(validateBands([1, Number.NaN]))).toBe(false);
    });
    it('needs 1 to 8 bands', () => {
        expect(validateBands([])).toEqual({ ok: false, error: 'Add at least 1 time band.' });
        expect(ok(validateBands([1]))).toBe(true);
        expect(ok(validateBands([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(true);
        expect(validateBands([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({ ok: false, error: 'Use at most 8 time bands.' });
    });
    it('sorts and collapses duplicates', () => {
        expect(validateBands([4, 1, 2, 2, 8, 1])).toEqual({ ok: true, value: [1, 2, 4, 8] });
        expect(normalizeBands([3, 1, 3])).toEqual([1, 3]);
    });
});

describe('radius', () => {
    it('checks both ends', () => {
        expect(ok(validateRadius('0.99'))).toBe(false);
        expect(ok(validateRadius('1'))).toBe(true);
        expect(ok(validateRadius('30'))).toBe(true);
        expect(ok(validateRadius('30.01'))).toBe(false);
    });
    it('is optional', () => {
        expect(validateRadius('')).toEqual({ ok: true, value: undefined });
        expect(validateRadius('  ')).toEqual({ ok: true, value: undefined });
    });
    it('shares its limits with the suggestion check', () => {
        expect(isRadius(1)).toBe(true);
        expect(isRadius(30)).toBe(true);
        expect(isRadius(0.99)).toBe(false);
        expect(isRadius(30.01)).toBe(false);
        expect(isRadius('5')).toBe(false);
        expect(isRadius(Number.NaN)).toBe(false);
        expect(isRadius(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isBandHours(0.25)).toBe(true);
        expect(isBandHours(24)).toBe(true);
        expect(isBandHours(0.24)).toBe(false);
        expect(isBandHours(24.01)).toBe(false);
        expect(isBandHours(null)).toBe(false);
    });
});

describe('withLongestBand', () => {
    it('replaces the largest band and drops every band above the suggestion', () => {
        expect(withLongestBand([1, 2, 4, 8], 3)).toEqual([1, 2, 3]);
        expect(withLongestBand([8, 1, 4, 2], 6)).toEqual([1, 2, 4, 6]);
        expect(withLongestBand([1, 2, 4, 8], 2)).toEqual([1, 2]);
        expect(withLongestBand([1, 2, 4, 8], 12)).toEqual([1, 2, 4, 12]);
        expect(withLongestBand([1, 2, 4, 8], 0.5)).toEqual([0.5]);
        expect(withLongestBand([5], 3)).toEqual([3]);
    });
    it('always makes the longest band equal to the suggestion', () => {
        for (const h of [0.25, 0.5, 1, 1.5, 2, 3, 4, 7.9, 8, 9, 24]) {
            const bands = withLongestBand([1, 2, 4, 8], h) as number[];
            expect(Math.max(...bands)).toBe(h);
            expect(bands).toEqual([...bands].sort((a, b) => a - b));
            expect(new Set(bands).size).toBe(bands.length);
        }
    });
    it('uses a fractional suggestion unchanged', () => {
        expect(withLongestBand([1, 2, 4, 8], 3.333)).toEqual([1, 2, 3.333]);
    });
    it('does not clamp: a value outside the limits gives null', () => {
        expect(withLongestBand([1, 2], 25)).toBeNull();
        expect(withLongestBand([1, 2], 0.1)).toBeNull();
        expect(withLongestBand([1, 2], '3')).toBeNull();
        expect(withLongestBand([1, 2], Number.NaN)).toBeNull();
        expect(withLongestBand([], 3)).toBeNull();
    });
});

describe('validateForm', () => {
    const good = { lat: '-40', lng: '172', speed: '2.5', bands: [8, 1, 4, 2], radius: '10' };
    it('builds the relay body with sorted bands', () => {
        expect(validateForm(good)).toEqual({
            ok: true,
            body: { ipp: { lat: -40, lng: 172 }, speed_kmh: 2.5, intervals_hours: [1, 2, 4, 8], radius_km: 10 },
        });
    });
    it('leaves radius_km out when the radius is empty', () => {
        const r = validateForm({ ...good, radius: '' });
        expect(r.ok && 'radius_km' in r.body).toBe(false);
    });
    it('returns every field error together', () => {
        const r = validateForm({ lat: '', lng: '0', speed: '0', bands: [], radius: '31' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['bands', 'lat', 'lng', 'radius', 'speed']);
    });
});
