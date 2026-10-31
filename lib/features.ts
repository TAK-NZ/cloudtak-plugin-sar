import { FEATURE_PATH, IPP_CALLSIGN, IPP_MARKER_COLOR, RING_FILL_OPACITY, STALE_MS } from './constants.ts';
import { formatHours, formatKm, formatUtc } from './format.ts';
import type { AnalysisResult, PolygonGeometry, Position, RingFeature, RunMeta, TarrResult, TravelTimeResult } from './types.ts';

/**
 * A CloudTAK map feature in the shape the host's feature store takes. Polygons are `u-d-f`
 * (drawn shapes), the start point is `u-d-p` (a plain point marker, CloudTAK's default point type).
 */
export interface SarFeature {
    id: string;
    type: 'Feature';
    path: string;
    properties: { id: string; type: string; callsign: string; remarks: string; [key: string]: unknown };
    geometry: PolygonGeometry | { type: 'Point'; coordinates: Position };
}

const newUuid = (): string => crypto.randomUUID();

function centerOf(geometry: PolygonGeometry): Position {
    const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
    const points = ring.length > 1 ? ring.slice(0, -1) : ring;
    const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
}

function parts(geometry: PolygonGeometry): { type: 'Polygon'; coordinates: Position[][] }[] {
    return geometry.type === 'Polygon'
        ? [geometry]
        : geometry.coordinates.map((coordinates) => ({ type: 'Polygon' as const, coordinates }));
}

const point = (lat: number, lng: number): string => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

function subjectText(meta: RunMeta): string {
    const where = [meta.ecoregion, meta.terrain].filter((v): v is string => typeof v === 'string' && v !== '');
    return `${meta.profile ?? 'unknown'}${where.length ? ` (${where.join(', ')})` : ''}`;
}

/** The first lines of the remarks of every feature of a run: start point and time. */
function runLines(meta: RunMeta): string[] {
    return [`Start point ${point(meta.ipp.lat, meta.ipp.lng)}.`, `Run ${formatUtc(meta.ranAt)}.`];
}

function travelRemarks(band: number, result: TravelTimeResult, meta: RunMeta): string {
    const speed = meta.speedKmh ?? result.parameters.speed_kmh;
    return [
        `Travel time band ${formatHours(band)}: the outer edge of where a person walking at ${speed ?? 'the chosen'} km/h on flat ground could reach in that time, given terrain, land cover and trails.`,
        `Bands: ${(meta.bandsHours ?? result.parameters.intervals_hours).map(formatHours).join(', ')}.`,
        ...runLines(meta),
        'This shows reach, not where a person is. A smaller band is not a better place to search.',
        result.disclaimer,
    ].filter((line) => line !== '').join('\n');
}

function tarrRemarks(ring: RingFeature, result: TarrResult, meta: RunMeta): string {
    const cal = result.calibration;
    const lines: string[] = [];
    if (ring.kind === 'terrain') {
        lines.push(`${ring.label}. Terrain-adjusted range ring for the subject profile ${subjectText(meta)}.`);
        const bits: string[] = [];
        if (ring.koesterKm !== null) bits.push(`Koester distance ${formatKm(ring.koesterKm)} km`);
        if (ring.multiplier !== undefined) bits.push(`multiplier ${ring.multiplier}${cal?.region ? ` (${cal.region})` : ''}`);
        if (ring.distanceKm !== null) bits.push(`calibrated distance ${formatKm(ring.distanceKm)} km`);
        if (bits.length) lines.push(`${bits.join(', ')}.`);
    } else {
        lines.push(`${ring.label}. Plain circle at the Koester distance${ring.koesterKm !== null ? ` of ${formatKm(ring.koesterKm)} km` : ''} for the subject profile ${subjectText(meta)}, with no terrain and no multiplier.`);
    }
    lines.push('Not calibrated for New Zealand. The percentage comes from United States search records and is not the chance of finding someone in New Zealand.');
    lines.push(...runLines(meta));
    if (result.disclaimer) lines.push(result.disclaimer);
    return lines.join('\n');
}

/** The name of a ring on the map: source, percentage, kind and distance. */
export function ringName(ring: RingFeature): string {
    return ring.distanceKm !== null ? `${ring.label} (${formatKm(ring.distanceKm)} km)` : ring.label;
}

/** The IPP remarks: mode, speed or subject profile, bands, time of the run. */
export function ippRemarks(result: AnalysisResult, meta: RunMeta): string {
    if (result.mode === 'tarr') {
        return `Initial Planning Point. Mode: TARR, subject ${subjectText(meta)}. Run ${formatUtc(meta.ranAt)}.`;
    }
    const speed = meta.speedKmh ?? result.parameters.speed_kmh;
    const bands = meta.bandsHours ?? result.parameters.intervals_hours;
    return `Initial Planning Point. Mode: Travel Time, speed ${speed ?? 'unknown'} km/h, bands ${bands.map((b) => Number(b.toFixed(2))).join(', ')} h. Run ${formatUtc(meta.ranAt)}.`;
}

interface PolygonSpec {
    name: string;
    remarks: string;
    color: string;
    dashed: boolean;
    geometry: PolygonGeometry;
}

function specs(result: AnalysisResult, meta: RunMeta): PolygonSpec[] {
    if (result.mode === 'tarr') {
        return result.rings.map((ring) => ({
            name: ringName(ring),
            remarks: tarrRemarks(ring, result, meta),
            color: ring.color,
            dashed: ring.kind === 'plain',
            geometry: ring.geometry,
        }));
    }
    // Largest band first so smaller bands draw on top.
    return [...result.contours]
        .sort((a, b) => b.properties.hours - a.properties.hours)
        .map((f) => ({
            name: `SAR ${formatHours(f.properties.hours)}`,
            remarks: travelRemarks(f.properties.hours, result, meta),
            color: f.properties.color,
            dashed: false,
            geometry: f.geometry,
        }));
}

/**
 * The features of one result, largest first, the start point last. A MultiPolygon becomes one
 * feature per part (`name (2)`, `name (3)`). Inner rings are kept on the feature.
 */
export function buildFeatures(result: AnalysisResult, meta: RunMeta, newId: () => string = newUuid, now: Date = new Date()): SarFeature[] {
    const time = now.toISOString();
    const stale = new Date(now.getTime() + STALE_MS).toISOString();
    const out: SarFeature[] = [];
    for (const spec of specs(result, meta)) {
        parts(spec.geometry).forEach((geometry, i) => {
            const id = newId();
            out.push({
                id,
                type: 'Feature',
                path: FEATURE_PATH,
                properties: {
                    id,
                    type: 'u-d-f',
                    how: 'h-g-i-g-o',
                    archived: true,
                    callsign: i === 0 ? spec.name : `${spec.name} (${i + 1})`,
                    remarks: spec.remarks,
                    time,
                    start: time,
                    stale,
                    center: centerOf(geometry),
                    stroke: spec.color,
                    'stroke-width': 3,
                    'stroke-opacity': 1,
                    'stroke-style': spec.dashed ? 'dashed' : 'solid',
                    fill: spec.color,
                    'fill-opacity': spec.dashed ? 0 : RING_FILL_OPACITY,
                },
                geometry,
            });
        });
    }
    const id = newId();
    const coordinates: Position = [meta.ipp.lng, meta.ipp.lat];
    out.push({
        id,
        type: 'Feature',
        path: FEATURE_PATH,
        properties: {
            id,
            type: 'u-d-p',
            how: 'h-g-i-g-o',
            archived: true,
            callsign: IPP_CALLSIGN,
            remarks: ippRemarks(result, meta),
            time,
            start: time,
            stale,
            center: coordinates,
            'marker-color': IPP_MARKER_COLOR,
            'marker-opacity': 1,
        },
        geometry: { type: 'Point', coordinates },
    });
    return out;
}

/** Deep copies with fresh ids, for filing the same features in another Data Sync (ids must not repeat between Data Syncs). */
export function copyForMission(features: readonly SarFeature[], newId: () => string = newUuid): SarFeature[] {
    return features.map((f) => {
        const copy = JSON.parse(JSON.stringify(f)) as SarFeature;
        const id = newId();
        copy.id = id;
        copy.properties.id = id;
        copy.properties.uid = id;
        return copy;
    });
}
