import { FALLBACK_COLOR } from './constants.ts';
import type {
    AnalysisResult, Bbox, ContourFeature, PolygonGeometry, Position, ResultBase, ResultWarning, RingFeature, TarrCalibration, TarrResult,
    TravelTimeResult, Triple,
} from './types.ts';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

function isPosition(v: unknown): v is Position {
    return Array.isArray(v) && v.length >= 2 && isNum(v[0]) && isNum(v[1]);
}

const isRing = (v: unknown): boolean => Array.isArray(v) && v.length >= 4 && v.every(isPosition);
const isPolygon = (v: unknown): boolean => Array.isArray(v) && v.length >= 1 && v.every(isRing);

function parseGeometry(g: unknown): PolygonGeometry | null {
    if (!isObject(g)) return null;
    if (g.type === 'Polygon' ? !isPolygon(g.coordinates) : g.type !== 'MultiPolygon' || !Array.isArray(g.coordinates) || !g.coordinates.every(isPolygon)) return null;
    return g as unknown as PolygonGeometry;
}

function parseFeature(raw: unknown): ContourFeature | null {
    if (!isObject(raw) || raw.type !== 'Feature' || !isObject(raw.properties)) return null;
    const geometry = parseGeometry(raw.geometry);
    if (!geometry) return null;
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
    return { type: 'Feature', geometry, properties };
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

function parseRing(raw: unknown): RingFeature | null {
    if (!isObject(raw) || raw.type !== 'Feature' || !isObject(raw.properties)) return null;
    const geometry = parseGeometry(raw.geometry);
    const p = raw.properties;
    if (!geometry || (p.kind !== 'terrain' && p.kind !== 'plain')) return null;
    if (p.percent !== 25 && p.percent !== 50 && p.percent !== 75) return null;
    if (typeof p.label !== 'string' || p.label === '') return null;
    const ring: RingFeature = {
        kind: p.kind,
        percent: p.percent,
        label: p.label,
        color: typeof p.color === 'string' && HEX.test(p.color) ? p.color : FALLBACK_COLOR,
        koesterKm: isNum(p.koester_km) ? p.koester_km : null,
        distanceKm: isNum(p.distance_km) ? p.distance_km : null,
        geometry,
    };
    if (isNum(p.threshold_m)) ring.thresholdM = p.threshold_m;
    if (isNum(p.multiplier)) ring.multiplier = p.multiplier;
    return ring;
}

function parseTriple(raw: unknown): Triple | null {
    if (!isObject(raw) || !isNum(raw.p25) || !isNum(raw.p50) || !isNum(raw.p75)) return null;
    return { p25: raw.p25, p50: raw.p50, p75: raw.p75 };
}

function parseCalibration(raw: unknown): TarrCalibration | null {
    if (!isObject(raw)) return null;
    return {
        region: typeof raw.region === 'string' ? raw.region : '',
        note: typeof raw.note === 'string' ? raw.note : '',
        source: typeof raw.source === 'string' ? raw.source : '',
        profileSpecific: typeof raw.profile_specific === 'boolean' ? raw.profile_specific : null,
        multiplier: parseTriple(raw.multiplier),
    };
}

function parseBase(raw: Record<string, unknown>): ResultBase {
    const data = isObject(raw.data) ? raw.data : {};
    const timings = isObject(raw.timings_s) ? raw.timings_s : {};
    return {
        bbox: parseBbox(raw.bbox),
        warnings: parseWarnings(raw.warnings),
        osmBuiltAt: typeof data.osm_built_at === 'string' ? data.osm_built_at : null,
        attribution: Array.isArray(raw.attribution) ? raw.attribution.filter((a): a is string => typeof a === 'string' && a !== '') : [],
        disclaimer: typeof raw.disclaimer === 'string' ? raw.disclaimer : '',
        timingSeconds: isNum(timings.total) ? timings.total : null,
    };
}

function features(raw: unknown): unknown[] | null {
    if (!isObject(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) return null;
    return raw.features;
}

/**
 * Validate the 200 body of the relay. Returns null when it is not a result of the expected
 * mode (`travel-time` unless `expected` says otherwise). Optional parts are tolerated: a bad
 * or missing one is dropped, a bad contour or ring is skipped.
 * Engine strings are kept as received; they must only be rendered as text.
 */
export function parseResult(raw: unknown, expected: 'travel-time' | 'tarr' = 'travel-time'): AnalysisResult | null {
    if (!isObject(raw) || raw.status !== 'ok' || raw.mode !== expected) return null;
    const list = features(raw.contours);
    if (!list) return null;
    const base = parseBase(raw);
    const params = isObject(raw.parameters) ? raw.parameters : {};
    if (expected === 'tarr') {
        const result: TarrResult = {
            mode: 'tarr',
            ...base,
            rings: list.map(parseRing).filter((f): f is RingFeature => f !== null),
            parameters: {
                profile: typeof params.profile === 'string' ? params.profile : '',
                ecoregion: typeof params.ecoregion === 'string' ? params.ecoregion : null,
                terrain: typeof params.terrain === 'string' ? params.terrain : null,
                koesterKm: parseTriple(params.koester_km),
                calibratedKm: parseTriple(params.calibrated_km),
                radiusKm: isNum(params.radius_km) ? params.radius_km : null,
            },
            calibration: parseCalibration(raw.calibration),
        };
        return result;
    }
    const result: TravelTimeResult = {
        mode: 'travel-time',
        ...base,
        contours: list.map(parseFeature).filter((f): f is ContourFeature => f !== null),
        parameters: {
            speed_kmh: isNum(params.speed_kmh) ? params.speed_kmh : null,
            radius_km: isNum(params.radius_km) ? params.radius_km : null,
            intervals_hours: Array.isArray(params.intervals_hours) ? params.intervals_hours.filter(isNum) : [],
        },
    };
    return result;
}

export function ippPoint(lng: number, lat: number): { type: 'Feature'; geometry: { type: 'Point'; coordinates: Position }; properties: Record<string, never> } {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} };
}
