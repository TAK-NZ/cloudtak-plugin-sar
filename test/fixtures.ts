// Synthetic data only: round numbers on a small grid, no real places.
export type Json = Record<string, unknown>;

function square(west: number, south: number, east: number, north: number): number[][][] {
    return [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
}

export function feature(hours: number, extra: Json = {}, size = hours): Json {
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: square(172 - size / 10, -40 - size / 10, 172 + size / 10, -40 + size / 10) },
        properties: {
            hours,
            label: `${hours.toFixed(1)}h`,
            callsign: 'x',
            remarks: 'x',
            threshold_m: 1000,
            color: '#ff0000',
            label_lat: -40 + size / 10,
            label_lng: 172,
            ...extra,
        },
    };
}

/** A relay 200 body for bands 1, 2 and 4 (ascending, like the engine). */
export function okBody(overrides: Json = {}): Json {
    return {
        status: 'ok',
        mode: 'travel-time',
        contours: { type: 'FeatureCollection', features: [feature(1), feature(2), feature(4)] },
        parameters: { speed_kmh: 2.5, intervals_hours: [1, 2, 4], radius_km: 12, cell_size_m: 30 },
        bbox: { west: 171, south: -41, east: 173, north: -39 },
        warnings: [{ severity: 'warning', source: 'limits', message: 'Synthetic warning.' }, { severity: 'info', source: 'data', message: 'Synthetic note.' }],
        data: { land_cover: 'x', elevation: 'x', osm_built_at: '2026-03-01T12:00:00Z' },
        attribution: ['Synthetic attribution one', 'Synthetic attribution two'],
        disclaimer: 'Synthetic disclaimer text.',
        timings_s: { total: 3.5 },
        ...overrides,
    };
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function htmlResponse(status: number, headers: Record<string, string> = {}): Response {
    return new Response('<html><body>Gateway</body></html>', { status, headers: { 'Content-Type': 'text/html', ...headers } });
}

const TARR_COLORS = { 25: '#d32f2f', 50: '#f57c00', 75: '#fbc02d' } as const;

/** A TARR ring as the relay sends it; the polygon is a square (with a hole when `hole` is set). */
export function ring(percent: 25 | 50 | 75, kind: 'terrain' | 'plain', extra: Json = {}, hole = false): Json {
    const half = percent / 100;
    const outer = square(172 - half, -40 - half, 172 + half, -40 + half)[0];
    const inner = square(172 - half / 4, -40 - half / 4, 172 + half / 4, -40 + half / 4)[0];
    const km = { 25: 0.64, 50: 1.77, 75: 3.22 }[percent];
    const cal = { 25: 0.736, 50: 2.036, 75: 3.703 }[percent];
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: hole ? [outer, inner] : [outer] },
        properties: {
            kind,
            percent,
            label: `Koester ${percent}%, ${kind === 'terrain' ? 'terrain-adjusted' : 'plain circle'}`,
            color: TARR_COLORS[percent],
            koester_km: km,
            distance_km: kind === 'terrain' ? cal : km,
            ...(kind === 'terrain' ? { threshold_m: cal * 1000, multiplier: 1.15 } : {}),
            label_lat: -40,
            label_lng: 172,
            ...extra,
        },
    };
}

/** A relay 200 body for TARR: plain 75, terrain 75, plain 50, terrain 50, plain 25, terrain 25. */
export function tarrBody(overrides: Json = {}): Json {
    return {
        status: 'ok',
        mode: 'tarr',
        contours: {
            type: 'FeatureCollection',
            features: [ring(75, 'plain'), ring(75, 'terrain', {}, true), ring(50, 'plain'), ring(50, 'terrain'), ring(25, 'plain'), ring(25, 'terrain')],
        },
        parameters: {
            profile: 'Hiker',
            ecoregion: null,
            terrain: null,
            koester_km: { p25: 0.64, p50: 1.77, p75: 3.22 },
            calibrated_km: { p25: 0.736, p50: 2.036, p75: 3.703 },
            radius_km: 5.7,
            cell_size_m: 12.5,
        },
        calibration: {
            region: 'Coconino County, Arizona',
            source: 'built-in',
            profile_specific: true,
            multiplier: { p25: 1.15, p50: 1.15, p75: 1.15 },
            calibrated_for_nz: false,
            note: 'Synthetic calibration note.',
        },
        bbox: { west: 171, south: -41, east: 173, north: -39 },
        warnings: [{ severity: 'warning', source: 'calibration', message: 'Synthetic calibration warning.' }],
        data: { land_cover: 'x', elevation: 'x', osm_built_at: '2026-03-01T12:00:00Z' },
        attribution: ['Synthetic attribution one', 'Synthetic attribution two'],
        disclaimer: 'Synthetic TARR disclaimer.',
        timings_s: { total: 4.5 },
        ...overrides,
    };
}
