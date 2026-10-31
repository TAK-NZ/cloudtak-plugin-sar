/*
 * Text shown in the pane. It lives here so that the components and the tests use the same strings.
 * The explainers follow the two explainers of the reference tool (sar.weleber.net), rewritten for
 * New Zealand data. Wording rules: see test/wording.spec.ts.
 */

export const MODE_NAME_TRAVEL_TIME = 'Travel Time';
export const MODE_NAME_TARR = 'TARR Analysis';

export const MODE_DESC_TRAVEL_TIME = 'Model where a subject could reach over time at a given travel speed. No subject profile needed.';
export const MODE_DESC_TARR = 'Terrain-Aware Range Rings from a Lost Person Behavior subject profile. Rings are not calibrated for New Zealand.';
export const TARR_UNAVAILABLE = 'Not available on this server';

export interface ExplainerSection {
    heading: string;
    text: string;
}

export interface Explainer {
    title: string;
    sections: ExplainerSection[];
}

export const WHATS_TRAVEL_TIME: Explainer = {
    title: "What's Travel Time?",
    sections: [
        {
            heading: 'The simple answer',
            text: 'If someone walks at 2 km/h for 4 hours, they could be up to 8 km away. That traces a perfect circle around the start point and assumes the same speed in every direction. On open flat ground that is roughly right. On real terrain it almost never is.',
        },
        {
            heading: 'Why terrain changes it',
            text: 'Every cell the subject crosses costs time. Steep slopes, thick bush, scrub and wetland slow the walk, and trails and roads speed it up. The model adds up that cost in every direction at once.',
        },
        {
            heading: 'The result',
            text: 'Each time band is drawn as the outer edge of where the subject could physically be after that long. The edge bulges along trails and roads and pulls in against steep ground and water. It shows reach. It does not say where a person is.',
        },
        {
            heading: 'What goes into the calculation',
            text: 'Base speed: your flat-ground walking speed. Slope: uphill and steep downhill are both slower. Land cover: LCDB classes, where bush and wetland are harder than open ground. Trails, roads and power-line corridors: OpenStreetMap. Water: land cover and OpenStreetMap waterways act as barriers.',
        },
    ],
};

export const WHATS_TARR: Explainer = {
    title: "What's a TARR?",
    sections: [
        {
            heading: 'The traditional range ring',
            text: 'A range ring is a circle around the start point at a distance from Lost Person Behavior research. If the 25% distance for a profile is 2.5 km, every point on the ring is 2.5 km from the start point in a straight line. That assumes the subject travels equally easily in every direction.',
        },
        {
            heading: 'The string analogy',
            text: 'Picture a string of that length laid from the start point over the ground. Over a hill, through thick bush or around water, the string bends, so its end falls closer to the start point. Along a trail or a flat valley the string runs straighter and its end lands farther out.',
        },
        {
            heading: 'The result',
            text: 'A Terrain-Aware Range Ring (TARR) does the string calculation in every direction at once. It follows lines of equal travel cost instead of equal straight-line distance. The plain Koester circle is drawn dashed next to each ring, so you can see how far the terrain moved it.',
        },
        {
            heading: 'What this plugin does differently',
            text: 'The ring distances come from Koester (2008) United States search records. They are scaled by multipliers fitted to Coconino County, Arizona. Neither the distances nor the multipliers are calibrated for New Zealand, and the ring percentages are not the chance of finding someone in New Zealand.',
        },
    ],
};

export const HINT_SPEED = 'Assumed speed on flat, unobstructed ground. The model adjusts for slope, land cover and trails.';
export const HINT_PRESETS = 'Presets: Impaired, Slow, Moderate and Fit hiker.';
export const HINT_BANDS = 'Each band draws the outer edge of where the subject could physically be after that time.';
export const HINT_START = 'Pick a point on the map, choose a marker, or enter latitude and longitude.';
export const HINT_RADIUS = '1 to 30 km. Larger radii take longer. In cities, large radii are slow.';
export const HINT_PROFILE = 'The profile sets the 25%, 50% and 75% distances from the Koester tables.';
export const HINT_TARR_RADIUS = 'The analysis area is the calibrated 75% distance plus 2 km, at most 30 km.';

export const TARR_NOTICE_CALIBRATION = 'Ring distances are scaled by multipliers fitted to Coconino County, Arizona. They are not calibrated for New Zealand.';
export const TARR_NOTICE_PERCENT = 'The ring percentages come from United States search records. They are not the chance of finding someone in New Zealand.';
export const TARR_NOTICE_LEGEND = 'Solid rings are terrain-adjusted. Dashed circles are the plain Koester distance, without terrain or multiplier.';

export const SHARE_HINT = 'Add to Data Sync moves the features into the Data Sync, as the CloudTAK Share dialog does.';
export const SHARE_HOLES = 'Rings with holes lose the holes when they go through the server. The downloaded KML and GeoJSON keep them.';
export const NO_DATA_SYNCS = 'No Data Syncs where you can add features. Subscribe to one first.';

export const RUN_HINT_START = 'Set the start point to run.';
export const RUN_HINT_SPEED = 'Set a valid speed to run.';
export const RUN_HINT_PROFILE = 'Choose a subject profile to run.';
