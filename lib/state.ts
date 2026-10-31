import { reactive, watch } from 'vue';
import type { WatchHandle } from 'vue';
import { BANDS_MAX, CODE_AREA_TOO_DENSE, DEFAULT_BANDS, DEFAULT_RADIUS, DEFAULT_SPEED, STORAGE_KEY } from './constants.ts';
import { describeError } from './errors.ts';
import { formatHours, formatKm } from './format.ts';
import type { CalcError, TravelTimeResult } from './types.ts';
import { isBandHours, isRadius, normalizeBands, validateBand, validateBands, validateRadius, validateSpeed, withLongestBand } from './validation.ts';

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

/** A point marker the user can take as the start point. */
export interface MarkerChoice {
    id: string;
    callsign: string;
    lat: number;
    lng: number;
}

export type RunState = 'idle' | 'running' | 'done' | 'error';

/** The form. All values are text the user can edit, except the bands. */
export const form = reactive({
    lat: '',
    lng: '',
    speed: DEFAULT_SPEED,
    bands: [...DEFAULT_BANDS] as number[],
    radius: DEFAULT_RADIUS,
});

export const session = reactive({
    run: 'idle' as RunState,
    /** Whole seconds since the run started. */
    elapsed: 0,
    error: null as CalcError | null,
    result: null as TravelTimeResult | null,
    /** The map is waiting for one click that sets the start point. */
    picking: false,
    markerOpen: false,
    markers: null as MarkerChoice[] | null,
    markersLoading: false,
    markersFailed: false,
    /** The panel is hidden for another plugin's panel while a calculation or pick is going on. */
    minimized: false,
    /** The text of the single aria-live region. */
    announcement: '',
    /** Bumped to ask the panel to move focus to its heading. */
    focusSeq: 0,
});

/** What the panel can ask the plugin to do. index.ts binds the real functions. */
export interface Controller {
    run(): void;
    cancel(): void;
    clear(): void;
    pick(): void;
    close(): void;
    loadMarkers(): Promise<MarkerChoice[]>;
}

const noop = (): void => undefined;
export const controller: Controller = {
    run: noop,
    cancel: noop,
    clear: noop,
    pick: noop,
    close: noop,
    loadMarkers: () => Promise.resolve([]),
};

export function bindController(c: Controller | null): void {
    Object.assign(controller, c ?? { run: noop, cancel: noop, clear: noop, pick: noop, close: noop, loadMarkers: () => Promise.resolve([]) });
}

/** Say something in the aria-live region. The same text twice in a row is still announced. */
export function announce(text: string): void {
    session.announcement = text === session.announcement ? `${text}\u00a0` : text;
}

export function requestHeadingFocus(): void {
    session.focusSeq++;
}

// Persistence of speed, bands and radius. The start point is never saved.

function readStored(storage: StorageLike): { speed: string; bands: number[]; radius: string } {
    const d = { speed: DEFAULT_SPEED, bands: [...DEFAULT_BANDS], radius: DEFAULT_RADIUS };
    let raw: unknown;
    try {
        raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
        return d;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return d;
    const o = raw as Record<string, unknown>;
    const speed = typeof o.speed === 'string' && validateSpeed(o.speed).ok ? o.speed : d.speed;
    const radius = typeof o.radius === 'string' && validateRadius(o.radius).ok ? o.radius : d.radius;
    let bands = d.bands;
    if (Array.isArray(o.bands) && o.bands.every((b) => typeof b === 'number')) {
        const checked = validateBands(o.bands as number[]);
        if (checked.ok) bands = checked.value;
    }
    return { speed, bands, radius };
}

let stopSaving: WatchHandle | null = null;

/** Load the saved values into the form and save every change. `null` stops saving. */
export function bindStorage(storage: StorageLike | null): void {
    stopSaving?.stop();
    stopSaving = null;
    if (!storage) return;
    const saved = readStored(storage);
    form.speed = saved.speed;
    form.bands = saved.bands;
    form.radius = saved.radius;
    stopSaving = watch(
        () => [form.speed, form.radius, form.bands.join(',')] as const,
        () => {
            try {
                storage.setItem(STORAGE_KEY, JSON.stringify({ speed: form.speed, bands: [...form.bands], radius: form.radius }));
            } catch {
                // Storage is full or not allowed: the values just are not kept.
            }
        },
        { flush: 'sync' }
    );
}

// Bands

/** Add a band from text. Returns an error text, or null when it was added. */
export function addBand(text: string): string | null {
    if (form.bands.length >= BANDS_MAX) return `Use at most ${BANDS_MAX} time bands.`;
    const checked = validateBand(text);
    if (!checked.ok) return checked.error;
    form.bands = normalizeBands([...form.bands, checked.value]);
    return null;
}

export function removeBand(hours: number): void {
    form.bands = form.bands.filter((b) => b !== hours);
}

// Markers

let markerLoad = 0;

export function toggleMarkers(): void {
    if (session.markerOpen) {
        session.markerOpen = false;
        return;
    }
    session.markerOpen = true;
    session.markersLoading = true;
    session.markersFailed = false;
    const id = ++markerLoad;
    controller.loadMarkers().then((list) => {
        if (id !== markerLoad) return;
        session.markers = list;
        session.markersLoading = false;
    }, () => {
        if (id !== markerLoad) return;
        session.markers = [];
        session.markersFailed = true;
        session.markersLoading = false;
    });
}

export function chooseMarker(marker: MarkerChoice): void {
    setStartPoint(marker.lng, marker.lat);
    session.markerOpen = false;
    announce(`Start point set to ${marker.callsign}.`);
}

/** Five decimals is about one metre. */
export function setStartPoint(lng: number, lat: number): void {
    form.lat = String(Number(lat.toFixed(5)));
    form.lng = String(Number(lng.toFixed(5)));
}

// Run

export function startRun(): void {
    session.run = 'running';
    session.elapsed = 0;
    session.error = null;
    announce('Calculating travel time. This can take up to a minute.');
}

export function finishRun(result: TravelTimeResult): void {
    session.run = 'done';
    session.result = result;
    session.error = null;
    const n = result.contours.length;
    announce(`Calculation finished. ${n} ${n === 1 ? 'contour' : 'contours'} drawn.`);
}

export function failRun(error: CalcError): void {
    if (error.kind === 'cancelled') {
        cancelRun();
        return;
    }
    session.run = 'error';
    session.error = error;
    announce(describeError(error));
}

export function cancelRun(): void {
    session.run = 'idle';
    session.error = null;
    announce('Calculation cancelled.');
}

/** Clear: the result, any error and the start point. Speed, bands and radius stay. */
export function clearAll(): void {
    session.run = 'idle';
    session.result = null;
    session.error = null;
    form.lat = '';
    form.lng = '';
    announce('Results and start point cleared.');
}

/** Back to the state of a fresh install, without announcing. Call bindStorage(null) first. */
export function resetAll(): void {
    markerLoad++;
    session.run = 'idle';
    session.elapsed = 0;
    session.error = null;
    session.result = null;
    session.picking = false;
    session.markerOpen = false;
    session.markers = null;
    session.markersLoading = false;
    session.markersFailed = false;
    session.minimized = false;
    session.announcement = '';
    form.lat = '';
    form.lng = '';
    form.speed = DEFAULT_SPEED;
    form.bands = [...DEFAULT_BANDS];
    form.radius = DEFAULT_RADIUS;
}

// The engine's dense-area refusal

export type SuggestionKind = 'radius' | 'hours';

export interface SuggestionButton {
    kind: SuggestionKind;
    label: string;
    /** Only for the hours button when a radius suggestion exists too: it sets both. */
    alsoRadiusKm?: number;
}

/**
 * The buttons for a refusal with the code `area_too_dense`. The numbers are the engine's own;
 * they are checked against the input limits again and never changed.
 */
export function suggestionButtons(error: CalcError | null): SuggestionButton[] {
    if (!error || error.kind !== 'rejected' || error.code !== CODE_AREA_TOO_DENSE || !error.suggestions) return [];
    const radius = isRadius(error.suggestions.radiusKm) ? error.suggestions.radiusKm : undefined;
    const hours = isBandHours(error.suggestions.maxHours) ? error.suggestions.maxHours : undefined;
    const out: SuggestionButton[] = [];
    if (radius !== undefined) out.push({ kind: 'radius', label: `Try ${formatKm(radius)} km` });
    if (hours !== undefined) {
        out.push({ kind: 'hours', label: `Set longest band to ${formatHours(hours)}`, ...(radius !== undefined ? { alsoRadiusKm: radius } : {}) });
    }
    return out;
}

/**
 * Put a suggestion into the inputs. This only edits the form: nothing is sent and the user
 * presses Run. The radius button sets the radius; the longest-band button replaces the largest
 * band (and sets the radius too when the engine suggested one).
 */
export function applySuggestion(button: SuggestionButton): void {
    const error = session.error;
    if (!error?.suggestions) return;
    if (button.kind === 'radius') {
        const radius = error.suggestions.radiusKm;
        if (!isRadius(radius)) return;
        form.radius = formatKm(radius);
        announce(`Radius set to ${formatKm(radius)} km. Press Run to calculate again.`);
        return;
    }
    const hours = error.suggestions.maxHours;
    if (!isBandHours(hours)) return;
    const bands = withLongestBand(form.bands, hours) ?? [hours];
    form.bands = bands;
    const radius = error.suggestions.radiusKm;
    if (isRadius(radius)) {
        form.radius = formatKm(radius);
        announce(`Longest band set to ${formatHours(hours)} and radius set to ${formatKm(radius)} km. Press Run to calculate again.`);
    } else {
        announce(`Longest band set to ${formatHours(hours)}. Press Run to calculate again.`);
    }
}
