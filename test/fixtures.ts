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
