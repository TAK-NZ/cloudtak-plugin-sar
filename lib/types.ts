export interface Host {
    origin(): string;
    token(): Promise<string | undefined>;
    fetch(input: string, init?: RequestInit): Promise<Response>;
}

/** The body the relay accepts. */
export interface TravelTimeBody {
    ipp: { lat: number; lng: number };
    speed_kmh: number;
    intervals_hours: number[];
    radius_km?: number;
}

export interface RelayStatus {
    apiVersion: number;
    enabled: boolean;
}

export interface ResultWarning {
    severity: 'warning' | 'info';
    source: string;
    message: string;
}

export interface Bbox {
    west: number;
    south: number;
    east: number;
    north: number;
}

export type Position = [number, number];

export interface ContourFeature {
    type: 'Feature';
    geometry: { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };
    properties: {
        hours: number;
        color: string;
        label_lat?: number;
        label_lng?: number;
    };
}

export interface TravelTimeResult {
    contours: ContourFeature[];
    parameters: { speed_kmh: number | null; radius_km: number | null; intervals_hours: number[] };
    bbox: Bbox | null;
    warnings: ResultWarning[];
    /** ISO date-time of the roads and trails data, or null when unknown. */
    osmBuiltAt: string | null;
    attribution: string[];
    disclaimer: string;
    timingSeconds: number | null;
}

/**
 * Why a calculation did not give a result.
 *  unavailable: the relay is off, rejected our session or cannot reach the engine
 *  timeout:     the calculation took too long (relay 504, a gateway page, or our own timeout)
 *  busy:        the relay rate limit (429)
 *  rejected:    the engine refused the input and sent a message (422)
 *  invalid:     the relay or engine rejected the request shape (400, 413)
 *  failed:      anything else that went wrong on the server
 *  network:     the request never got an answer
 *  cancelled:   the user cancelled
 */
export type ErrorKind = 'unavailable' | 'timeout' | 'busy' | 'rejected' | 'invalid' | 'failed' | 'network' | 'cancelled';

/**
 * Suggestions of the engine's dense-area refusal. Only values that are finite numbers
 * inside the plugin's input limits are kept; anything else is dropped (never clamped).
 */
export interface Suggestions {
    radiusKm?: number;
    maxHours?: number;
}

export interface CalcError {
    kind: ErrorKind;
    /** HTTP status when there was a response. */
    status?: number;
    /** Seconds from Retry-After (busy, timeout). */
    retryAfterS?: number;
    /** The server's message, exactly as received (rejected only). */
    message?: string;
    /** The machine-readable code of a 422 (for example `area_too_dense`). */
    code?: string;
    /** Only set together with the code `area_too_dense`. */
    suggestions?: Suggestions;
}

export type CalcOutcome = { ok: true; result: TravelTimeResult } | { ok: false; error: CalcError };
