import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KOESTER_SOURCE, PROFILES, distancesFor, ecoregionsOf, profileNames, terrainsOf } from '../lib/tarr-profiles.ts';

describe('Koester table', () => {
    it('has 28 profiles and 72 rows', () => {
        expect(PROFILES).toHaveLength(28);
        expect(PROFILES.reduce((n, p) => n + p.rows.length, 0)).toBe(72);
        expect(new Set(profileNames()).size).toBe(28);
    });

    it('has increasing distances in every row and a default row for every profile', () => {
        for (const p of PROFILES) {
            expect(p.rows.some((r) => r.ecoregion === null && r.terrain === null), p.name).toBe(true);
            for (const r of p.rows) {
                expect(r.km[0], p.name).toBeLessThan(r.km[1]);
                expect(r.km[1], p.name).toBeLessThan(r.km[2]);
            }
        }
    });

    it('names its source', () => {
        expect(KOESTER_SOURCE).toContain('Koester (2008)');
        expect(KOESTER_SOURCE).toContain('Ferguson (2013)');
    });

    it('has the longest 75% distance at 41.04 km (Snowmobiler, Temperate, Flat)', () => {
        const max = Math.max(...PROFILES.flatMap((p) => p.rows.map((r) => r.km[2])));
        expect(max).toBe(41.04);
        expect(distancesFor('Snowmobiler', 'Temperate', 'Flat')).toEqual([1.29, 4.67, 41.04]);
    });

    it('matches the reference tool when its source is next to this repository', () => {
        // Optional cross-check: the engine checkout is not part of this repository.
        const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'sar-engine', 'app', 'static', 'app.js');
        let text: string;
        try {
            text = readFileSync(path, 'utf8');
        } catch {
            return;
        }
        const line = text.split('\n').find((l) => l.trim().startsWith('var LPB_DATA='));
        const data = JSON.parse((line as string).trim().match(/^var LPB_DATA=(.*);$/)![1]) as Record<string, { eco: string | null; terrain: string | null; distances: number[] }[]>;
        expect(PROFILES.map((p) => p.name)).toEqual(Object.keys(data));
        for (const p of PROFILES) {
            expect(p.rows.map((r) => [r.ecoregion, r.terrain, ...r.km])).toEqual(data[p.name].map((r) => [r.eco, r.terrain, ...r.distances]));
        }
    });
});

describe('lookups', () => {
    it('gives the default row of Hiker as 0.64, 1.77 and 3.22 km', () => {
        expect(distancesFor('Hiker', null, null)).toEqual([0.64, 1.77, 3.22]);
        expect(distancesFor('Hiker', '', '')).toEqual([0.64, 1.77, 3.22]);
    });

    it('uses the exact row, then the ecoregion row, then the default row', () => {
        expect(distancesFor('Hiker', 'Dry', 'Flat')).toEqual([1.29, 2.09, 6.6]);
        expect(distancesFor('Angler', 'Dry', 'Flat')).toEqual([3.22, 9.66, 10.46]);
        expect(distancesFor('Hiker', 'Urban', null)).toEqual([0.64, 1.77, 3.22]);
        expect(distancesFor('Hiker', 'Temperate', 'Flat')).toEqual([0.64, 1.77, 3.22]);
    });

    it('returns null for an unknown profile', () => {
        expect(distancesFor('Wizard', null, null)).toBeNull();
    });

    it('lists the ecoregions and terrains of a profile', () => {
        expect(ecoregionsOf('Hiker')).toEqual(['Dry', 'Temperate']);
        expect(terrainsOf('Hiker', 'Dry')).toEqual(['Mountainous', 'Flat']);
        expect(ecoregionsOf('Abduction')).toEqual([]);
        expect(terrainsOf('Angler', 'Dry')).toEqual([]);
        expect(ecoregionsOf('Wizard')).toEqual([]);
    });
});
