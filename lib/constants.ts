export const MENU_KEY = 'sar';
export const ROUTE_NAME = 'home-menu-plugin-sar';
export const ROUTE_PATH = 'plugin-sar';
export const BOTTOM_KEY = 'taknz-sar';
/** Id in the plugin panel events (see lib/panel-coordinator.ts). */
export const PANEL_ID = BOTTOM_KEY;
export const STORAGE_KEY = 'taknz-sar:v1';

export const ID_PREFIX = 'taknz-sar-';
export const SOURCE_CONTOURS = `${ID_PREFIX}contours`;
export const SOURCE_LABELS = `${ID_PREFIX}labels`;
export const SOURCE_IPP = `${ID_PREFIX}ipp`;
export const LAYER_FILL = `${ID_PREFIX}fill`;
export const LAYER_OUTLINE = `${ID_PREFIX}outline`;
export const LAYER_LABEL = `${ID_PREFIX}label`;
export const LAYER_IPP = `${ID_PREFIX}ipp`;

export const STATUS_PATH = '/api/sar/status';
export const TRAVEL_TIME_PATH = '/api/sar/travel-time';
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

export const DEFAULT_SPEED = '2.5';
export const DEFAULT_BANDS: readonly number[] = [1, 2, 4, 8];
export const DEFAULT_RADIUS = '10';

/** The 422 code of the engine's dense-area refusal. */
export const CODE_AREA_TOO_DENSE = 'area_too_dense';

/** Used when a contour has no usable colour. */
export const FALLBACK_COLOR = '#3388ff';
