/*
 * Koester (2008), Lost Person Behavior, via Ferguson (2013), IGT4SAR: distances in km from the start
 * point within which 25%, 50% and 75% of the subjects of a profile were found (United States records).
 * This is the engine's table (TAK-NZ/sar-engine, nz/tarr_profiles.py, itself taken from the reference
 * tool). The engine is authoritative: this copy only feeds the hints in the form. It is not calibrated
 * for New Zealand.
 */
export interface ProfileRow {
    ecoregion: string | null;
    terrain: string | null;
    /** 25%, 50% and 75% distances in km. */
    km: [number, number, number];
}
export interface Profile {
    name: string;
    rows: ProfileRow[];
}
export const KOESTER_SOURCE = 'Koester (2008), Lost Person Behavior, via Ferguson (2013), IGT4SAR';
export const PROFILES: readonly Profile[] = [
    {
        name: 'Abduction',
        rows: [
            { ecoregion: null, terrain: null, km: [0.32, 2.41, 19.31] },
        ],
    },
    {
        name: 'Aircraft',
        rows: [
            { ecoregion: null, terrain: null, km: [0.64, 1.45, 5.95] },
        ],
    },
    {
        name: 'Angler',
        rows: [
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.32, 1.45, 5.47] },
            { ecoregion: 'Temperate', terrain: 'Flat', km: [0.8, 1.61, 5.47] },
            { ecoregion: 'Dry', terrain: null, km: [3.22, 9.66, 10.46] },
            { ecoregion: null, terrain: null, km: [0.8, 1.61, 5.47] },
        ],
    },
    {
        name: 'All Terrain Vehicle',
        rows: [
            { ecoregion: null, terrain: null, km: [1.61, 3.22, 5.63] },
        ],
    },
    {
        name: 'Autistic',
        rows: [
            { ecoregion: 'Urban', terrain: null, km: [0.32, 0.97, 3.86] },
            { ecoregion: null, terrain: null, km: [0.64, 1.61, 3.7] },
        ],
    },
    {
        name: 'Camper',
        rows: [
            { ecoregion: 'Dry', terrain: 'Mountainous', km: [0.64, 1.61, 4.18] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.16, 2.25, 3.06] },
            { ecoregion: null, terrain: null, km: [0.16, 1.13, 3.22] },
        ],
    },
    {
        name: 'Child (1-3)',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [0.64, 1.29, 3.86] },
            { ecoregion: 'Urban', terrain: null, km: [0.16, 0.48, 0.8] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.16, 0.32, 0.97] },
            { ecoregion: null, terrain: null, km: [0.16, 0.32, 0.97] },
        ],
    },
    {
        name: 'Child (4-6)',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [0.64, 1.93, 3.22] },
            { ecoregion: 'Urban', terrain: null, km: [0.1, 0.48, 0.97] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.16, 0.8, 1.45] },
            { ecoregion: null, terrain: null, km: [0.16, 0.64, 1.45] },
        ],
    },
    {
        name: 'Child (7-9)',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [0.48, 1.29, 3.22] },
            { ecoregion: 'Urban', terrain: null, km: [0.16, 0.48, 1.45] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.8, 1.61, 3.22] },
            { ecoregion: null, terrain: null, km: [0.16, 0.8, 2.09] },
        ],
    },
    {
        name: 'Child (10-12)',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [0.8, 2.09, 7.24] },
            { ecoregion: 'Urban', terrain: null, km: [0.32, 1.45, 2.9] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.8, 1.61, 3.22] },
            { ecoregion: null, terrain: null, km: [0.48, 1.61, 4.83] },
        ],
    },
    {
        name: 'Child (13-15)',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [2.41, 3.22, 4.83] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.8, 2.09, 4.83] },
            { ecoregion: null, terrain: null, km: [0.64, 1.29, 3.22] },
        ],
    },
    {
        name: 'Climber',
        rows: [
            { ecoregion: null, terrain: null, km: [0.16, 1.61, 3.22] },
        ],
    },
    {
        name: 'Dementia',
        rows: [
            { ecoregion: 'Dry', terrain: 'Mountainous', km: [0.97, 1.93, 3.06] },
            { ecoregion: 'Dry', terrain: 'Flat', km: [0.48, 1.61, 3.54] },
            { ecoregion: 'Urban', terrain: null, km: [0.32, 1.13, 3.22] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.32, 0.8, 1.93] },
            { ecoregion: null, terrain: null, km: [0.32, 0.97, 2.41] },
        ],
    },
    {
        name: 'Despondent',
        rows: [
            { ecoregion: 'Dry', terrain: 'Mountainous', km: [0.8, 1.61, 3.38] },
            { ecoregion: 'Dry', terrain: 'Flat', km: [0.48, 1.93, 3.7] },
            { ecoregion: 'Urban', terrain: null, km: [0.1, 0.48, 1.45] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.32, 1.13, 3.22] },
            { ecoregion: null, terrain: null, km: [0.32, 0.8, 2.25] },
        ],
    },
    {
        name: 'Gatherer',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [1.61, 2.57, 5.79] },
            { ecoregion: null, terrain: null, km: [1.45, 3.22, 6.44] },
        ],
    },
    {
        name: 'Hiker',
        rows: [
            { ecoregion: 'Dry', terrain: 'Mountainous', km: [1.61, 3.22, 6.44] },
            { ecoregion: 'Dry', terrain: 'Flat', km: [1.29, 2.09, 6.6] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [1.13, 3.06, 5.79] },
            { ecoregion: null, terrain: null, km: [0.64, 1.77, 3.22] },
        ],
    },
    {
        name: 'Horseback Rider',
        rows: [
            { ecoregion: null, terrain: null, km: [0.32, 3.22, 8.05] },
        ],
    },
    {
        name: 'Hunter',
        rows: [
            { ecoregion: 'Dry', terrain: 'Mountainous', km: [2.09, 4.83, 8.05] },
            { ecoregion: 'Dry', terrain: 'Flat', km: [1.61, 3.06, 6.44] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.97, 2.09, 4.83] },
            { ecoregion: null, terrain: null, km: [0.64, 1.61, 3.06] },
        ],
    },
    {
        name: 'Intellectual Disability',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [1.13, 4.02, 8.69] },
            { ecoregion: 'Urban', terrain: null, km: [0.32, 0.8, 3.7] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.64, 1.61, 3.22] },
            { ecoregion: null, terrain: null, km: [0.32, 0.97, 2.09] },
        ],
    },
    {
        name: 'Mental Illness',
        rows: [
            { ecoregion: 'Urban', terrain: null, km: [0.32, 0.64, 1.45] },
            { ecoregion: 'Temperate', terrain: 'Mountainous', km: [0.64, 2.25, 8.21] },
            { ecoregion: null, terrain: null, km: [0.8, 0.97, 2.25] },
        ],
    },
    {
        name: 'Mountain Biker',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [2.74, 6.44, 13.2] },
            { ecoregion: null, terrain: null, km: [3.06, 4.02, 11.27] },
        ],
    },
    {
        name: 'Extreme Sport',
        rows: [
            { ecoregion: null, terrain: null, km: [0.48, 2.57, 5.63] },
        ],
    },
    {
        name: 'Runner',
        rows: [
            { ecoregion: null, terrain: null, km: [1.45, 2.57, 3.38] },
        ],
    },
    {
        name: 'Skier (Alpine)',
        rows: [
            { ecoregion: null, terrain: null, km: [1.13, 2.74, 4.83] },
        ],
    },
    {
        name: 'Skier (Nordic)',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [1.93, 4.35, 6.44] },
            { ecoregion: null, terrain: null, km: [1.61, 3.54, 6.44] },
        ],
    },
    {
        name: 'Snowboarder',
        rows: [
            { ecoregion: null, terrain: null, km: [1.61, 3.22, 6.12] },
        ],
    },
    {
        name: 'Snowmobiler',
        rows: [
            { ecoregion: 'Dry', terrain: null, km: [1.61, 4.83, 14] },
            { ecoregion: 'Temperate', terrain: 'Flat', km: [1.29, 4.67, 41.04] },
            { ecoregion: null, terrain: null, km: [3.22, 6.44, 11.1] },
        ],
    },
    {
        name: 'Substance Abuse',
        rows: [
            { ecoregion: null, terrain: null, km: [0.48, 1.13, 4.18] },
        ],
    },
];

const find = (name: string): Profile | undefined => PROFILES.find((p) => p.name === name);

export const profileNames = (): string[] => PROFILES.map((p) => p.name);

/** Ecoregions with their own row for this profile, in table order. */
export function ecoregionsOf(name: string): string[] {
    const rows = find(name)?.rows ?? [];
    return [...new Set(rows.map((r) => r.ecoregion).filter((e): e is string => e !== null))];
}

/** Terrains with their own row for this profile and ecoregion, in table order. */
export function terrainsOf(name: string, ecoregion: string): string[] {
    const rows = find(name)?.rows ?? [];
    return [...new Set(rows.filter((r) => r.ecoregion === ecoregion).map((r) => r.terrain).filter((t): t is string => t !== null))];
}

/**
 * The row the engine uses: exact (ecoregion, terrain), else (ecoregion, none), else (none, none).
 * Returns null for an unknown profile.
 */
export function distancesFor(name: string, ecoregion: string | null, terrain: string | null): [number, number, number] | null {
    const rows = find(name)?.rows;
    if (!rows) return null;
    const eco = ecoregion === '' ? null : ecoregion;
    const ter = terrain === '' ? null : terrain;
    const row = rows.find((r) => r.ecoregion === eco && r.terrain === ter)
        ?? rows.find((r) => r.ecoregion === eco && r.terrain === null)
        ?? rows.find((r) => r.ecoregion === null && r.terrain === null);
    return row ? [...row.km] : null;
}
