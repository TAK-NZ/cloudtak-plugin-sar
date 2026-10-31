import { reactive, watch } from 'vue';
import type { WatchHandle } from 'vue';
import { BANDS_MAX, CODE_AREA_TOO_DENSE, DEFAULT_BANDS, DEFAULT_RADIUS, DEFAULT_SPEED, STORAGE_KEY } from './constants.ts';
import { describeError } from './errors.ts';
import { formatKm } from './format.ts';
import { ecoregionsOf, profileNames, terrainsOf } from './tarr-profiles.ts';
import type { AnalysisResult, CalcError, MissionChoice, Mode, RunMeta } from './types.ts';
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
    mode: 'travel-time' as Mode,
    lat: '',
    lng: '',
    speed: DEFAULT_SPEED,
    bands: [...DEFAULT_BANDS] as number[],
    radius: DEFAULT_RADIUS,
    /** TARR: the subject profile and the optional ecoregion and terrain. Empty text means not chosen. */
    profile: '',
    ecoregion: '',
    terrain: '',
    /** TARR: also draw the plain Koester circle next to each terrain ring. Applies from the next run. */
    plainCircles: true,
});

/** Which collapsible boxes are open. Kept here so the choice survives the pane being rebuilt. */
export const ui = reactive({ sections: {} as Record<string, boolean> });

export const session = reactive({
    run: 'idle' as RunState,
    /** Whole seconds since the run started. */
    elapsed: 0,
    error: null as CalcError | null,
    result: null as AnalysisResult | null,
    /** What was asked for when the result was made. */
    meta: null as RunMeta | null,
    /** Ids of the features this plugin put on the map for the result. */
    featureIds: [] as string[],
    /** Names of the Data Syncs that now hold the features. */
    movedTo: [] as string[],
    /** The relay can route TARR runs. */
    tarrAvailable: false,
    /** The map is waiting for one click that sets the start point. */
    picking: false,
    markerOpen: false,
    markers: null as MarkerChoice[] | null,
    markersLoading: false,
    markersFailed: false,
    /** The share actions: one at a time. `saved` is true once the KMZ is in Files. */
    share: { busy: false, status: '', message: '', error: '', saved: false },
    /** The text of the single aria-live region. */
    announcement: '',
});

/** What the pane can ask the plugin to do. index.ts binds the real functions. */
export interface Controller {
    run(): void;
    cancel(): void;
    clear(): void;
    pick(): void;
    loadMarkers(): Promise<MarkerChoice[]>;
    /** Move the features into the chosen Data Syncs. */
    addToDataSync(missions: MissionChoice[]): Promise<void>;
    /** Build a data package on the server, download it and optionally file it in Data Syncs. */
    createPackage(options: { name: string; missions: MissionChoice[] }): Promise<void>;
    /** Upload the result as a KMZ to the user's Files. */
    saveToFiles(): Promise<void>;
    /** Open the Files menu. */
    openFiles(): void;
}

const noop = (): void => undefined;
const idle = (): Promise<void> => Promise.resolve();
const unbound = (): Controller => ({
    run: noop,
    cancel: noop,
    clear: noop,
    pick: noop,
    loadMarkers: () => Promise.resolve([]),
    addToDataSync: idle,
    createPackage: idle,
    saveToFiles: idle,
    openFiles: noop,
});
export const controller: Controller = unbound();

export function bindController(c: Controller | null): void {
    Object.assign(controller, c ?? unbound());
}

/** Say something in the aria-live region. The same text twice in a row is still announced. */
export function announce(text: string): void {
    session.announcement = text === session.announcement ? `${text}\u00a0` : text;
}

// Persistence of the mode, the settings and the profile choice. The start point is never saved.

interface Stored {
    mode: Mode;
    speed: string;
    bands: number[];
    radius: string;
    profile: string;
    ecoregion: string;
    terrain: string;
    plainCircles: boolean;
}

function readStored(storage: StorageLike): Stored {
    const d: Stored = { mode: 'travel-time', speed: DEFAULT_SPEED, bands: [...DEFAULT_BANDS], radius: DEFAULT_RADIUS, profile: '', ecoregion: '', terrain: '', plainCircles: true };
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
    const mode: Mode = o.mode === 'tarr' && session.tarrAvailable ? 'tarr' : 'travel-time';
    // The profile choice is kept only as far as the table still offers it.
    let profile = '';
    let ecoregion = '';
    let terrain = '';
    if (typeof o.profile === 'string' && profileNames().includes(o.profile)) {
        profile = o.profile;
        if (typeof o.ecoregion === 'string' && ecoregionsOf(profile).includes(o.ecoregion)) {
            ecoregion = o.ecoregion;
            if (typeof o.terrain === 'string' && terrainsOf(profile, ecoregion).includes(o.terrain)) terrain = o.terrain;
        }
    }
    const plainCircles = typeof o.plainCircles === 'boolean' ? o.plainCircles : d.plainCircles;
    return { mode, speed, bands, radius, profile, ecoregion, terrain, plainCircles };
}

let stopSaving: WatchHandle | null = null;

/** Load the saved values into the form and save every change. `null` stops saving. */
export function bindStorage(storage: StorageLike | null): void {
    stopSaving?.stop();
    stopSaving = null;
    if (!storage) return;
    const saved = readStored(storage);
    form.mode = saved.mode;
    form.speed = saved.speed;
    form.bands = saved.bands;
    form.radius = saved.radius;
    form.profile = saved.profile;
    form.ecoregion = saved.ecoregion;
    form.terrain = saved.terrain;
    form.plainCircles = saved.plainCircles;
    stopSaving = watch(
        () => [form.mode, form.speed, form.radius, form.bands.join(','), form.profile, form.ecoregion, form.terrain, form.plainCircles] as const,
        () => {
            try {
                storage.setItem(STORAGE_KEY, JSON.stringify({
                    mode: form.mode,
                    speed: form.speed,
                    bands: [...form.bands],
                    radius: form.radius,
                    profile: form.profile,
                    ecoregion: form.ecoregion,
                    terrain: form.terrain,
                    plainCircles: form.plainCircles,
                }));
            } catch {
                // Storage is full or not allowed: the values just are not kept.
            }
        },
        { flush: 'sync' }
    );
}

// Mode and TARR choices

/** Switch the analysis mode. Ignored while a calculation runs, and for TARR when the server cannot do it. */
export function setMode(mode: Mode): void {
    if (session.run === 'running' || mode === form.mode) return;
    if (mode === 'tarr' && !session.tarrAvailable) return;
    form.mode = mode;
    announce(mode === 'tarr' ? 'TARR analysis mode.' : 'Travel time mode.');
}

export function setProfile(name: string): void {
    form.profile = name;
    form.ecoregion = '';
    form.terrain = '';
}

export function setEcoregion(name: string): void {
    form.ecoregion = name;
    form.terrain = '';
}

export function setTerrain(name: string): void {
    form.terrain = name;
}

export function setPlainCircles(on: boolean): void {
    form.plainCircles = on;
}

/** Use a speed preset. The field shows the number as text. */
export function setSpeed(kmh: number): void {
    form.speed = String(kmh);
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

/** Add a band from a quick-add button. */
export function addQuickBand(hours: number): string | null {
    return addBand(String(hours));
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

export function startRun(mode: Mode = form.mode): void {
    session.run = 'running';
    session.elapsed = 0;
    session.error = null;
    announce(`${mode === 'tarr' ? 'Calculating TARR rings' : 'Calculating travel time'}. This can take up to a minute.`);
}

/** The result is in and its features are on the map. `featureIds` are the ids of those features. */
export function finishRun(result: AnalysisResult, meta: RunMeta, featureIds: string[]): void {
    session.run = 'done';
    session.result = result;
    session.meta = meta;
    session.featureIds = [...featureIds];
    session.movedTo = [];
    session.share.status = '';
    session.share.message = '';
    session.share.error = '';
    session.share.saved = false;
    session.error = null;
    const n = result.mode === 'tarr' ? result.rings.length : result.contours.length;
    const noun = result.mode === 'tarr' ? (n === 1 ? 'ring' : 'rings') : (n === 1 ? 'contour' : 'contours');
    announce(`Calculation finished. ${n} ${noun} and the start point added to the map as features.`);
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

/** Clear: the result, any error and the start point. Mode, speed, bands, radius and profile stay. */
export function clearAll(): void {
    session.run = 'idle';
    session.result = null;
    session.meta = null;
    session.featureIds = [];
    session.movedTo = [];
    session.share.busy = false;
    session.share.status = '';
    session.share.message = '';
    session.share.error = '';
    session.share.saved = false;
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
    session.meta = null;
    session.featureIds = [];
    session.movedTo = [];
    session.tarrAvailable = false;
    session.share.busy = false;
    session.share.status = '';
    session.share.message = '';
    session.share.error = '';
    session.share.saved = false;
    session.picking = false;
    session.markerOpen = false;
    session.markers = null;
    session.markersLoading = false;
    session.markersFailed = false;
    session.announcement = '';
    form.mode = 'travel-time';
    form.lat = '';
    form.lng = '';
    form.speed = DEFAULT_SPEED;
    form.bands = [...DEFAULT_BANDS];
    form.radius = DEFAULT_RADIUS;
    form.profile = '';
    form.ecoregion = '';
    form.terrain = '';
    form.plainCircles = true;
    ui.sections = {};
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
        out.push({ kind: 'hours', label: `Set longest band to ${hours} h`, ...(radius !== undefined ? { alsoRadiusKm: radius } : {}) });
    }
    return out;
}

/**
 * Put a suggestion into the inputs. This only edits the form: nothing is sent and the user
 * presses Run. The radius button sets the radius; the longest-band button makes the suggested
 * value the longest band (and sets the radius too when the engine suggested one).
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
        announce(`Longest band set to ${hours} h and radius set to ${formatKm(radius)} km. Press Run to calculate again.`);
    } else {
        announce(`Longest band set to ${hours} h. Press Run to calculate again.`);
    }
}
