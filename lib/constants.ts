export const MENU_KEY = 'sar';
export const ROUTE_NAME = 'home-menu-plugin-sar';
export const ROUTE_PATH = 'plugin-sar';
export const STORAGE_KEY = 'taknz-sar:v1';

export const ID_PREFIX = 'taknz-sar-';
/** The start point preview shown before a result exists. */
export const SOURCE_IPP = `${ID_PREFIX}ipp`;
export const LAYER_IPP = `${ID_PREFIX}ipp`;

export const STATUS_PATH = '/api/sar/status';
export const TRAVEL_TIME_PATH = '/api/sar/travel-time';
export const TARR_PATH = '/api/sar/tarr';
/** CloudTAK's data package route (PUT) and file download route (GET). */
export const PACKAGE_PATH = '/api/marti/package';
export const FILES_PATH = '/api/marti/api/files';
/** The Imports route (PUT a file, GET its status) and the Files menu route. */
export const IMPORT_PATH = '/api/import';
export const FILES_ROUTE = '/menu/files';
/** How often and how long to ask whether Files has finished reading an uploaded KMZ. */
export const IMPORT_POLL_MS = 2000;
export const IMPORT_MAX_WAIT_MS = 120000;
export const STATUS_TIMEOUT_MS = 8000;
/** The relay waits up to 70 s for the engine; give it a little more. */
export const CALCULATE_TIMEOUT_MS = 80000;
export const API_VERSIONS_SUPPORTED: readonly number[] = [1];

/** Input limits. They are the same in the relay and the engine. */
export const LAT_MIN = -48;
export const LAT_MAX = -33.5;
export const LNG_MIN = 165.5;
export const LNG_MAX = 179.5;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;
export const HOURS_MIN = 0.25;
export const HOURS_MAX = 24;
export const BANDS_MIN = 1;
export const BANDS_MAX = 8;
export const RADIUS_MIN = 1;
export const RADIUS_MAX = 30;

export const MODE_TRAVEL_TIME = 'travel-time';
export const MODE_TARR = 'tarr';

/** Walking speed presets in km/h (0.5, 1.0, 2.0 and 3.1 mph). Km/h only, there is no mph toggle. */
export const SPEED_PRESETS: readonly { kmh: number; label: string }[] = [
    { kmh: 0.8, label: 'Impaired' },
    { kmh: 1.6, label: 'Slow' },
    { kmh: 3.2, label: 'Moderate' },
    { kmh: 5.0, label: 'Fit hiker' },
];
/** Bands offered as one-click additions when not already chosen. The defaults stay 1, 2, 4 and 8 h. */
export const QUICK_BANDS: readonly number[] = [6, 10, 12];

/** Where the created features are filed in the CloudTAK feature tree. */
export const FEATURE_PATH = '/SAR/';
/** The created features expire after this long. */
export const STALE_MS = 24 * 3600 * 1000;
export const IPP_CALLSIGN = 'SAR IPP';
export const IPP_MARKER_COLOR = '#FFD600';
export const RING_FILL_OPACITY = 0.15;

export const DEFAULT_SPEED = '2.5';
export const DEFAULT_BANDS: readonly number[] = [1, 2, 4, 8];
export const DEFAULT_RADIUS = '10';

/** The 422 code of the engine's dense-area refusal. */
export const CODE_AREA_TOO_DENSE = 'area_too_dense';

/**
 * The colours of the Travel Time bands, smallest band first. The engine sends a cyan, green and yellow ramp
 * that disappears on a map with a lot of green, blue and grey, so the plugin uses warm, saturated colours
 * instead, starting with the red, orange and yellow of the TARR rings. A ninth band starts the list again.
 */
export const BAND_COLORS: readonly string[] = [
    '#d32f2f', // red
    '#f57c00', // orange
    '#fbc02d', // yellow
    '#8e24aa', // purple
    '#e91e63', // pink
    '#6d4c41', // brown
    '#ffffff', // white
    '#212121', // black
];

/** Used when a TARR ring has no usable colour. */
export const FALLBACK_COLOR = '#3388ff';
