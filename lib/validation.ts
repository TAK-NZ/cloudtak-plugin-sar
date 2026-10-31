import {
    BANDS_MAX, BANDS_MIN, HOURS_MAX, HOURS_MIN, LAT_MAX, LAT_MIN, LNG_MAX, LNG_MIN,
    RADIUS_MAX, RADIUS_MIN, SPEED_MAX, SPEED_MIN,
} from './constants.ts';
import type { TravelTimeBody } from './types.ts';

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface FormInput {
    lat: string;
    lng: string;
    speed: string;
    bands: readonly number[];
    radius: string;
}

export interface FormErrors {
    lat?: string;
    lng?: string;
    speed?: string;
    bands?: string;
    radius?: string;
}

export type FormCheck = { ok: true; body: TravelTimeBody } | { ok: false; errors: FormErrors };

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Strict decimal: digits with an optional sign and one dot. No comma, no exponent, no
 * `Infinity`, no hex, no empty text. Returns null when the text is not a decimal.
 */
export function parseNumber(text: string): number | null {
    if (typeof text !== 'string') return null;
    const t = text.trim();
    if (!DECIMAL.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

const inRange = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

/** Input limits as predicates. The relay client uses them for the engine's suggestions too. */
export const isLat = (n: unknown): n is number => inRange(n, LAT_MIN, LAT_MAX);
export const isLng = (n: unknown): n is number => inRange(n, LNG_MIN, LNG_MAX);
export const isSpeed = (n: unknown): n is number => inRange(n, SPEED_MIN, SPEED_MAX);
export const isBandHours = (n: unknown): n is number => inRange(n, HOURS_MIN, HOURS_MAX);
export const isRadius = (n: unknown): n is number => inRange(n, RADIUS_MIN, RADIUS_MAX);

function checkNumber(text: string, noun: string, min: number, max: number, unit = ''): Checked<number> {
    const range = `${min} and ${max}${unit}`;
    const name = `${noun[0].toUpperCase()}${noun.slice(1)}`;
    if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: `Enter a ${noun} between ${range}.` };
    const n = parseNumber(text);
    if (n === null) return { ok: false, error: `${name} must be a decimal number between ${range}.` };
    if (!inRange(n, min, max)) return { ok: false, error: `${name} must be between ${range}.` };
    return { ok: true, value: n };
}

export const validateLat = (text: string): Checked<number> => checkNumber(text, 'latitude', LAT_MIN, LAT_MAX);
export const validateLng = (text: string): Checked<number> => checkNumber(text, 'longitude', LNG_MIN, LNG_MAX);
export const validateSpeed = (text: string): Checked<number> => checkNumber(text, 'speed', SPEED_MIN, SPEED_MAX, ' km/h');
export const validateBand = (text: string): Checked<number> => checkNumber(text, 'time band', HOURS_MIN, HOURS_MAX, ' h');

/** The radius is optional: empty text means the engine's own default. */
export function validateRadius(text: string): Checked<number | undefined> {
    if (typeof text === 'string' && text.trim() === '') return { ok: true, value: undefined };
    return checkNumber(text, 'radius', RADIUS_MIN, RADIUS_MAX, ' km');
}

/** Between 1 and 8 bands, each 0.25 to 24 h. Duplicates collapse. The result is ascending. */
export function validateBands(bands: readonly number[]): Checked<number[]> {
    if (!Array.isArray(bands) || bands.length < BANDS_MIN) return { ok: false, error: `Add at least ${BANDS_MIN} time band.` };
    if (bands.length > BANDS_MAX) return { ok: false, error: `Use at most ${BANDS_MAX} time bands.` };
    if (!bands.every(isBandHours)) return { ok: false, error: `Each time band must be between ${HOURS_MIN} and ${HOURS_MAX} h.` };
    return { ok: true, value: normalizeBands(bands) };
}

/** Unique and ascending. */
export function normalizeBands(bands: readonly number[]): number[] {
    return [...new Set(bands)].sort((a, b) => a - b);
}

/**
 * Replace the longest band by `hours`, then collapse duplicates and sort. Returns null when
 * `hours` is not inside the band limits (the value is never clamped) or there is no band.
 */
export function withLongestBand(bands: readonly number[], hours: unknown): number[] | null {
    if (!isBandHours(hours) || bands.length === 0) return null;
    const sorted = normalizeBands(bands);
    sorted[sorted.length - 1] = hours;
    return normalizeBands(sorted);
}

/** Checks every field and builds the relay body. All field errors are returned together. */
export function validateForm(form: FormInput): FormCheck {
    const errors: FormErrors = {};
    const lat = validateLat(form.lat);
    if (!lat.ok) errors.lat = lat.error;
    const lng = validateLng(form.lng);
    if (!lng.ok) errors.lng = lng.error;
    const speed = validateSpeed(form.speed);
    if (!speed.ok) errors.speed = speed.error;
    const bands = validateBands(form.bands);
    if (!bands.ok) errors.bands = bands.error;
    const radius = validateRadius(form.radius);
    if (!radius.ok) errors.radius = radius.error;
    if (!lat.ok || !lng.ok || !speed.ok || !bands.ok || !radius.ok) return { ok: false, errors };
    const body: TravelTimeBody = {
        ipp: { lat: lat.value, lng: lng.value },
        speed_kmh: speed.value,
        intervals_hours: bands.value,
    };
    if (radius.value !== undefined) body.radius_km = radius.value;
    return { ok: true, body };
}
