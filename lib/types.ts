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

/** The body the relay accepts for a TARR run. Empty ecoregion and terrain are left out. */
export interface TarrBody {
    ipp: { lat: number; lng: number };
    profile: string;
    ecoregion?: string;
    terrain?: string;
}

export type Mode = 'travel-time' | 'tarr';

export type CalcRequest = { mode: 'travel-time'; body: TravelTimeBody } | { mode: 'tarr'; body: TarrBody };

export interface RelayStatus {
    apiVersion: number;
    enabled: boolean;
    /** The modes the relay can route. Absent on a relay that predates TARR: travel time only. */
    modes?: string[];
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

export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };

export interface ContourFeature {
    type: 'Feature';
    geometry: PolygonGeometry;
    properties: {
        hours: number;
        color: string;
        label_lat?: number;
        label_lng?: number;
    };
}

/** What both modes share. */
export interface ResultBase {
    bbox: Bbox | null;
    warnings: ResultWarning[];
    /** ISO date-time of the roads and trails data, or null when unknown. */
    osmBuiltAt: string | null;
    attribution: string[];
    disclaimer: string;
    timingSeconds: number | null;
}

export interface TravelTimeResult extends ResultBase {
    mode: 'travel-time';
    contours: ContourFeature[];
    parameters: { speed_kmh: number | null; radius_km: number | null; intervals_hours: number[] };
}

/** Distances or multipliers for the 25%, 50% and 75% rings. */
export interface Triple {
    p25: number;
    p50: number;
    p75: number;
}

export interface RingFeature {
    kind: 'terrain' | 'plain';
    percent: 25 | 50 | 75;
    label: string;
    color: string;
    koesterKm: number | null;
    distanceKm: number | null;
    thresholdM?: number;
    multiplier?: number;
    geometry: PolygonGeometry;
}

export interface TarrCalibration {
    region: string;
    note: string;
    source: string;
    profileSpecific: boolean | null;
    multiplier: Triple | null;
}

export interface TarrResult extends ResultBase {
    mode: 'tarr';
    rings: RingFeature[];
    parameters: {
        profile: string;
        ecoregion: string | null;
        terrain: string | null;
        koesterKm: Triple | null;
        calibratedKm: Triple | null;
        radiusKm: number | null;
    };
    calibration: TarrCalibration | null;
}

export type AnalysisResult = TravelTimeResult | TarrResult;

/** What was asked for, kept next to the result for the feature remarks and the exports. */
export interface RunMeta {
    mode: Mode;
    /** ISO date-time of the run. */
    ranAt: string;
    ipp: { lat: number; lng: number };
    speedKmh?: number;
    bandsHours?: number[];
    profile?: string;
    ecoregion?: string;
    terrain?: string;
}

/** A Data Sync the user can file features in. */
export interface MissionChoice {
    guid: string;
    name: string;
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

export type CalcOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: CalcError };
