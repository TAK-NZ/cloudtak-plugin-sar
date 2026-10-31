import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { STORAGE_KEY } from '../lib/constants.ts';
import type { CalcError } from '../lib/types.ts';
import {
    addBand, announce, applySuggestion, bindController, bindStorage, cancelRun, chooseMarker, clearAll, controller, failRun,
    finishRun, form, removeBand, resetAll, session, setStartPoint, startRun, suggestionButtons, toggleMarkers,
} from '../lib/state.ts';
import type { StorageLike } from '../lib/state.ts';
import { parseResult } from '../lib/result.ts';
import { okBody } from './fixtures.ts';
import type { TravelTimeResult } from '../lib/types.ts';

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
    const data = { ...initial };
    return {
        data,
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => {
            data[k] = v;
        },
    };
}

const dense = (suggestions?: { radiusKm?: number; maxHours?: number }): CalcError => ({
    kind: 'rejected',
    status: 422,
    message: 'Synthetic dense-area message.',
    code: 'area_too_dense',
    ...(suggestions ? { suggestions } : {}),
});

beforeEach(() => {
    bindStorage(null);
    bindController(null);
    resetAll();
});

afterEach(() => {
    bindStorage(null);
    bindController(null);
    resetAll();
});

describe('defaults and persistence', () => {
    it('starts with 2.5 km/h, bands 1, 2, 4, 8 h, radius 10 km and no start point', () => {
        expect(form).toMatchObject({ lat: '', lng: '', speed: '2.5', radius: '10' });
        expect([...form.bands]).toEqual([1, 2, 4, 8]);
    });

    it('saves speed, bands and radius under taknz-sar:v1 and never the start point', () => {
        const store = memory();
        bindStorage(store);
        form.speed = '3';
        form.radius = '12';
        removeBand(8);
        setStartPoint(172, -40);
        expect(JSON.parse(store.data[STORAGE_KEY])).toEqual({ speed: '3', bands: [1, 2, 4], radius: '12' });
        expect(store.data[STORAGE_KEY]).not.toContain('172');
        expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    });

    it('loads saved values and falls back to the defaults for unusable ones', () => {
        bindStorage(memory({ [STORAGE_KEY]: JSON.stringify({ speed: '4', bands: [2, 1], radius: '' }) }));
        expect(form.speed).toBe('4');
        expect([...form.bands]).toEqual([1, 2]);
        expect(form.radius).toBe('');
        bindStorage(memory({ [STORAGE_KEY]: JSON.stringify({ speed: '99', bands: [0, 3], radius: 'x' }) }));
        expect(form.speed).toBe('2.5');
        expect([...form.bands]).toEqual([1, 2, 4, 8]);
        expect(form.radius).toBe('10');
        bindStorage(memory({ [STORAGE_KEY]: '{not json' }));
        expect(form.speed).toBe('2.5');
        bindStorage(memory({ [STORAGE_KEY]: '[1]' }));
        expect(form.radius).toBe('10');
    });

    it('stops saving after bindStorage(null)', () => {
        const store = memory();
        bindStorage(store);
        bindStorage(null);
        form.speed = '5';
        expect(store.data[STORAGE_KEY]).toBeUndefined();
    });

    it('survives a storage that throws', () => {
        bindStorage({ getItem: () => 'null', setItem: () => {
            throw new Error('full');
        } });
        expect(() => {
            form.speed = '3';
        }).not.toThrow();
    });
});

describe('bands', () => {
    it('adds a band, keeps the list sorted and collapses duplicates', () => {
        expect(addBand('3')).toBeNull();
        expect([...form.bands]).toEqual([1, 2, 3, 4, 8]);
        expect(addBand('3')).toBeNull();
        expect([...form.bands]).toEqual([1, 2, 3, 4, 8]);
        expect(addBand('0.25')).toBeNull();
        expect([...form.bands]).toEqual([0.25, 1, 2, 3, 4, 8]);
    });

    it('allows at most 8 bands', () => {
        for (const h of ['3', '5', '6', '7']) expect(addBand(h)).toBeNull();
        expect(form.bands).toHaveLength(8);
        expect(addBand('9')).toBe('Use at most 8 time bands.');
        expect(form.bands).toHaveLength(8);
    });

    it('rejects values outside 0.25 to 24 h and text that is not a number', () => {
        expect(addBand('0.24')).toContain('between 0.25 and 24 h');
        expect(addBand('24.01')).toContain('between 0.25 and 24 h');
        expect(addBand('1,5')).toContain('decimal');
        expect(addBand('')).toContain('Enter a time band');
        expect([...form.bands]).toEqual([1, 2, 4, 8]);
        expect(addBand('24')).toBeNull();
    });

    it('removes a band', () => {
        removeBand(2);
        expect([...form.bands]).toEqual([1, 4, 8]);
    });
});

describe('run state and announcements', () => {
    const result = (): TravelTimeResult => parseResult(okBody()) as TravelTimeResult;

    it('announces start, finish, cancel and errors', () => {
        startRun();
        expect(session.run).toBe('running');
        expect(session.announcement).toContain('Calculating');
        finishRun(result());
        expect(session.run).toBe('done');
        expect(session.announcement).toBe('Calculation finished. 3 contours drawn.');
        startRun();
        cancelRun();
        expect(session.run).toBe('idle');
        expect(session.announcement).toBe('Calculation cancelled.');
        failRun({ kind: 'timeout' });
        expect(session.run).toBe('error');
        expect(session.announcement).toBe('The calculation took too long. Try a smaller radius.');
    });

    it('announces the server message of a refusal exactly as received', () => {
        failRun(dense({ radiusKm: 6 }));
        expect(session.announcement).toBe('Synthetic dense-area message.');
    });

    it('a cancelled error is a cancel, not an error', () => {
        startRun();
        failRun({ kind: 'cancelled' });
        expect(session.run).toBe('idle');
        expect(session.error).toBeNull();
    });

    it('announces the same text twice in a row', () => {
        announce('Same.');
        const first = session.announcement;
        announce('Same.');
        expect(session.announcement).not.toBe(first);
        expect(session.announcement.trim()).toBe('Same.');
    });

    it('clearAll drops the result, the error and the start point but keeps speed, bands and radius', () => {
        setStartPoint(172, -40);
        form.speed = '3';
        finishRun(result());
        clearAll();
        expect(session.result).toBeNull();
        expect(form.lat).toBe('');
        expect(form.lng).toBe('');
        expect(form.speed).toBe('3');
    });

    it('formats a picked point with at most five decimals', () => {
        setStartPoint(172.123456789, -40.5);
        expect(form.lat).toBe('-40.5');
        expect(form.lng).toBe('172.12346');
    });
});

describe('suggestion buttons (area_too_dense)', () => {
    it('radius only: one button "Try {n} km"', () => {
        expect(suggestionButtons(dense({ radiusKm: 6.5 })).map((b) => [b.kind, b.label])).toEqual([['radius', 'Try 6.5 km']]);
    });

    it('hours only: one button "Set longest band to {h} h"', () => {
        expect(suggestionButtons(dense({ maxHours: 3 })).map((b) => [b.kind, b.label])).toEqual([['hours', 'Set longest band to 3 h']]);
        expect(suggestionButtons(dense({ maxHours: 2.5 }))[0].label).toBe('Set longest band to 2.5 h');
    });

    it('both: the radius button and a longest-band button that sets both', () => {
        const buttons = suggestionButtons(dense({ radiusKm: 6, maxHours: 3 }));
        expect(buttons.map((b) => b.label)).toEqual(['Try 6 km', 'Set longest band to 3 h']);
        expect(buttons[1].alsoRadiusKm).toBe(6);
        expect(buttons[0].alsoRadiusKm).toBeUndefined();
    });

    it('neither: no button', () => {
        expect(suggestionButtons(dense())).toEqual([]);
        expect(suggestionButtons(dense({}))).toEqual([]);
        expect(suggestionButtons(null)).toEqual([]);
    });

    it('only a refusal with the code area_too_dense has buttons', () => {
        const noCode: CalcError = { kind: 'rejected', status: 422, message: 'Sea.', suggestions: { radiusKm: 6 } };
        expect(suggestionButtons(noCode)).toEqual([]);
        expect(suggestionButtons({ ...noCode, code: 'other_code' })).toEqual([]);
        expect(suggestionButtons({ kind: 'timeout', suggestions: { radiusKm: 6 } })).toEqual([]);
    });

    // Decision: a number outside the input limits is ignored like a malformed one. It is never
    // clamped, because a clamped number would be a suggestion of our own. The relay client
    // already drops these; the state checks again so a hand-made error cannot slip through.
    it('ignores values outside the input limits and never clamps them', () => {
        expect(suggestionButtons(dense({ radiusKm: 31 }))).toEqual([]);
        expect(suggestionButtons(dense({ radiusKm: 0.5 }))).toEqual([]);
        expect(suggestionButtons(dense({ maxHours: 25 }))).toEqual([]);
        expect(suggestionButtons(dense({ maxHours: 0.1 }))).toEqual([]);
        expect(suggestionButtons(dense({ radiusKm: Number.NaN, maxHours: Number.POSITIVE_INFINITY }))).toEqual([]);
    });

    it('offers only the usable suggestion when the other one is out of limits', () => {
        expect(suggestionButtons(dense({ radiusKm: 40, maxHours: 3 })).map((b) => [b.kind, b.alsoRadiusKm])).toEqual([['hours', undefined]]);
        expect(suggestionButtons(dense({ radiusKm: 6, maxHours: 99 })).map((b) => b.kind)).toEqual(['radius']);
    });
});

describe('applying a suggestion only edits the inputs', () => {
    it('radius: fills the radius and nothing else', () => {
        failRun(dense({ radiusKm: 6.5, maxHours: 3 }));
        applySuggestion(suggestionButtons(session.error)[0]);
        expect(form.radius).toBe('6.5');
        expect([...form.bands]).toEqual([1, 2, 4, 8]);
        expect(session.run).toBe('error');
        expect(session.announcement).toContain('Press Run');
    });

    it('hours only: replaces the largest band, then sorts and dedupes', () => {
        failRun(dense({ maxHours: 3 }));
        applySuggestion(suggestionButtons(session.error)[0]);
        expect([...form.bands]).toEqual([1, 2, 3, 4]);
        expect(form.radius).toBe('10');
    });

    it('hours: a value equal to another band collapses into it', () => {
        failRun(dense({ maxHours: 2 }));
        applySuggestion(suggestionButtons(session.error)[0]);
        expect([...form.bands]).toEqual([1, 2, 4]);
    });

    it('hours can also raise the longest band', () => {
        removeBand(8);
        failRun(dense({ maxHours: 6 }));
        applySuggestion(suggestionButtons(session.error)[0]);
        expect([...form.bands]).toEqual([1, 2, 6]);
    });

    it('both: the longest-band button sets the radius and the longest band', () => {
        failRun(dense({ radiusKm: 6, maxHours: 3 }));
        applySuggestion(suggestionButtons(session.error)[1]);
        expect(form.radius).toBe('6');
        expect([...form.bands]).toEqual([1, 2, 3, 4]);
    });

    it('with no bands left the suggested value becomes the only band', () => {
        for (const h of [1, 2, 4, 8]) removeBand(h);
        failRun(dense({ maxHours: 3 }));
        applySuggestion(suggestionButtons(session.error)[0]);
        expect([...form.bands]).toEqual([3]);
    });

    it('does not call run or any other controller function', () => {
        const spies = { run: vi.fn(), cancel: vi.fn(), clear: vi.fn(), pick: vi.fn(), close: vi.fn(), loadMarkers: vi.fn(async () => []) };
        bindController(spies);
        failRun(dense({ radiusKm: 6, maxHours: 3 }));
        for (const button of suggestionButtons(session.error)) applySuggestion(button);
        for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when the error has no usable suggestion', () => {
        failRun(dense({ radiusKm: 99 }));
        applySuggestion({ kind: 'radius', label: 'Try 99 km' });
        expect(form.radius).toBe('10');
    });
});

describe('markers', () => {
    it('loads the list once opened and chooses a marker', async () => {
        bindController({
            ...controller,
            loadMarkers: async () => [{ id: 'a', callsign: 'Alpha', lat: -40, lng: 172 }],
        });
        toggleMarkers();
        expect(session.markerOpen).toBe(true);
        expect(session.markersLoading).toBe(true);
        await nextTick();
        await Promise.resolve();
        expect(session.markers).toHaveLength(1);
        expect(session.markersLoading).toBe(false);
        chooseMarker(session.markers![0]);
        expect([form.lat, form.lng]).toEqual(['-40', '172']);
        expect(session.markerOpen).toBe(false);
    });

    it('reports a failed load', async () => {
        bindController({ ...controller, loadMarkers: () => Promise.reject(new Error('x')) });
        toggleMarkers();
        await Promise.resolve();
        await Promise.resolve();
        expect(session.markersFailed).toBe(true);
        toggleMarkers();
        expect(session.markerOpen).toBe(false);
    });
});
