import { FALLBACK_COLOR } from './constants.ts';
import { formatHours } from './format.ts';
import type { Bbox, ContourFeature, Position, ResultWarning, TravelTimeResult } from './types.ts';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

function isPosition(v: unknown): v is Position {
    return Array.isArray(v) && v.length >= 2 && isNum(v[0]) && isNum(v[1]);
}

const isRing = (v: unknown): boolean => Array.isArray(v) && v.length >= 4 && v.every(isPosition);
const isPolygon = (v: unknown): boolean => Array.isArray(v) && v.length >= 1 && v.every(isRing);

function parseFeature(raw: unknown): ContourFeature | null {
    if (!isObject(raw) || raw.type !== 'Feature' || !isObject(raw.geometry) || !isObject(raw.properties)) return null;
    const g = raw.geometry;
    if (g.type === 'Polygon' ? !isPolygon(g.coordinates) : g.type !== 'MultiPolygon' || !Array.isArray(g.coordinates) || !g.coordinates.every(isPolygon)) return null;
    const p = raw.properties;
    if (!isNum(p.hours) || p.hours <= 0) return null;
    const properties: ContourFeature['properties'] = {
        hours: p.hours,
        color: typeof p.color === 'string' && HEX.test(p.color) ? p.color : FALLBACK_COLOR,
    };
    if (isNum(p.label_lat) && isNum(p.label_lng)) {
        properties.label_lat = p.label_lat;
        properties.label_lng = p.label_lng;
    }
    return { type: 'Feature', geometry: g as unknown as ContourFeature['geometry'], properties };
}

function parseBbox(raw: unknown): Bbox | null {
    if (!isObject(raw) || !isNum(raw.west) || !isNum(raw.south) || !isNum(raw.east) || !isNum(raw.north)) return null;
    if (raw.west >= raw.east || raw.south >= raw.north) return null;
    return { west: raw.west, south: raw.south, east: raw.east, north: raw.north };
}

function parseWarnings(raw: unknown): ResultWarning[] {
    if (!Array.isArray(raw)) return [];
    const out: ResultWarning[] = [];
    for (const w of raw) {
        if (!isObject(w) || typeof w.message !== 'string' || w.message === '') continue;
        out.push({
            severity: w.severity === 'warning' ? 'warning' : 'info',
            source: typeof w.source === 'string' ? w.source : '',
            message: w.message,
        });
    }
    return out;
}

/**
 * Validate the 200 body of the relay. Returns null when it is not a travel-time result.
 * Optional parts are tolerated: a bad or missing one is dropped, a bad contour is skipped.
 * Engine strings are kept as received; they must only be rendered as text.
 */
export function parseResult(raw: unknown): TravelTimeResult | null {
    if (!isObject(raw) || raw.status !== 'ok' || raw.mode !== 'travel-time') return null;
    const c = raw.contours;
    if (!isObject(c) || c.type !== 'FeatureCollection' || !Array.isArray(c.features)) return null;
    const contours = c.features.map(parseFeature).filter((f): f is ContourFeature => f !== null);
    const params = isObject(raw.parameters) ? raw.parameters : {};
    const data = isObject(raw.data) ? raw.data : {};
    const timings = isObject(raw.timings_s) ? raw.timings_s : {};
    const total = isNum(timings.total) ? timings.total : null;
    return {
        contours,
        parameters: {
            speed_kmh: isNum(params.speed_kmh) ? params.speed_kmh : null,
            radius_km: isNum(params.radius_km) ? params.radius_km : null,
            intervals_hours: Array.isArray(params.intervals_hours) ? params.intervals_hours.filter(isNum) : [],
        },
        bbox: parseBbox(raw.bbox),
        warnings: parseWarnings(raw.warnings),
        osmBuiltAt: typeof data.osm_built_at === 'string' ? data.osm_built_at : null,
        attribution: Array.isArray(raw.attribution) ? raw.attribution.filter((a): a is string => typeof a === 'string' && a !== '') : [],
        disclaimer: typeof raw.disclaimer === 'string' ? raw.disclaimer : '',
        timingSeconds: total,
    };
}

export interface MapFeature {
    type: 'Feature';
    geometry: ContourFeature['geometry'];
    properties: { hours: number; color: string; text: string };
}

/**
 * Contours for the map, largest band first so smaller bands draw on top. The on-map text
 * is built here from `hours` (the engine's own `label` is not used).
 */
export function contourFeatures(result: TravelTimeResult): MapFeature[] {
    return [...result.contours]
        .sort((a, b) => b.properties.hours - a.properties.hours)
        .map((f) => ({
            type: 'Feature' as const,
            geometry: f.geometry,
            properties: { hours: f.properties.hours, color: f.properties.color, text: formatHours(f.properties.hours) },
        }));
}

export interface LabelPoint {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: Position };
    properties: { hours: number; color: string; text: string };
}

/** One point per contour that has a label position, largest band first. */
export function labelPoints(result: TravelTimeResult): LabelPoint[] {
    return [...result.contours]
        .filter((f) => f.properties.label_lat !== undefined && f.properties.label_lng !== undefined)
        .sort((a, b) => b.properties.hours - a.properties.hours)
        .map((f) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [f.properties.label_lng as number, f.properties.label_lat as number] as Position },
            properties: { hours: f.properties.hours, color: f.properties.color, text: formatHours(f.properties.hours) },
        }));
}

export function ippPoint(lng: number, lat: number): { type: 'Feature'; geometry: { type: 'Point'; coordinates: Position }; properties: Record<string, never> } {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} };
}
