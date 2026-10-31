import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import BandChips from '../lib/BandChips.vue';
import MarkerPicker from '../lib/MarkerPicker.vue';
import SarPane from '../lib/SarPane.vue';
import SarResult from '../lib/SarResult.vue';
import { bindController, bindStorage, failRun, finishRun, form, resetAll, session, setStartPoint, startRun, ui } from '../lib/state.ts';
import type { Controller } from '../lib/state.ts';
import { parseResult } from '../lib/result.ts';
import type { CalcError, RunMeta, TravelTimeResult } from '../lib/types.ts';
import { feature, okBody } from './fixtures.ts';

vi.mock('../lib/missions.ts', () => ({ listSubscribedMissions: vi.fn(async () => []) }));

const meta: RunMeta = { mode: 'travel-time', ranAt: '2026-03-01T12:00:00Z', ipp: { lat: -40, lng: 172 }, speedKmh: 2.5, bandsHours: [1, 2, 4] };
const finish = (r: TravelTimeResult): void => finishRun(r, meta, []);
const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib');

let wrapper: VueWrapper | undefined;
let spies: { [K in keyof Controller]: ReturnType<typeof vi.fn> };

const result = (over: Record<string, unknown> = {}): TravelTimeResult => parseResult(okBody(over)) as TravelTimeResult;

function mountPanel(): VueWrapper {
    wrapper = mount(SarPane, { attachTo: document.body });
    return wrapper;
}

const dense = (suggestions?: { radiusKm?: number; maxHours?: number }, code: string | null = 'area_too_dense'): CalcError => ({
    kind: 'rejected',
    status: 422,
    message: 'Synthetic message, exactly  as received.',
    ...(code ? { code } : {}),
    ...(suggestions ? { suggestions } : {}),
});

async function settle(): Promise<void> {
    await nextTick();
    await nextTick();
}

beforeEach(() => {
    bindStorage(null);
    resetAll();
    spies = {
        run: vi.fn(), cancel: vi.fn(), clear: vi.fn(), pick: vi.fn(), loadMarkers: vi.fn(async () => []),
        addToDataSync: vi.fn(async () => undefined), createPackage: vi.fn(async () => undefined), saveToFiles: vi.fn(async () => undefined), openFiles: vi.fn(),
    };
    bindController(spies as unknown as Controller);
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    bindController(null);
    resetAll();
    document.body.innerHTML = '';
});

describe('SarPane form', () => {
    it('shows the defaults: 2.5 km/h, bands 1, 2, 4 and 8 h, radius 10 km', () => {
        const w = mountPanel();
        expect((w.get('[data-test=speed]').element as HTMLInputElement).value).toBe('2.5');
        expect((w.get('[data-test=radius]').element as HTMLInputElement).value).toBe('10');
        expect(w.findAll('[data-test=band]').map((b) => b.text())).toEqual(['1 h', '2 h', '4 h', '8 h']);
        expect(w.text()).toContain('km/h');
        expect(w.text()).toContain('Larger radii take longer.');
    });

    it('asks for the start point and keeps Run disabled until the form is valid', async () => {
        const w = mountPanel();
        expect(w.get('[data-test=run]').attributes('disabled')).toBeDefined();
        expect(w.get('[data-test=run-hint]').text()).toBe('Set the start point to run.');
        expect(w.find('[data-test=lat-error]').exists()).toBe(false);
        await w.get('[data-test=lat]').setValue('-40');
        await w.get('[data-test=lng]').setValue('172');
        expect(w.get('[data-test=run]').attributes('disabled')).toBeUndefined();
        expect(w.find('[data-test=run-hint]').exists()).toBe(false);
        await w.get('[data-test=run]').trigger('click');
        expect(spies.run).toHaveBeenCalledTimes(1);
    });

    it('shows plain-language field errors with the allowed range', async () => {
        const w = mountPanel();
        await w.get('[data-test=lat]').setValue('-50');
        await w.get('[data-test=lng]').setValue('abc');
        await w.get('[data-test=speed]').setValue('11');
        await w.get('[data-test=radius]').setValue('31');
        expect(w.get('[data-test=lat-error]').text()).toBe('Error: Latitude must be between -48 and -33.5.');
        expect(w.get('[data-test=lng-error]').text()).toBe('Error: Longitude must be a decimal number between 165.5 and 179.5.');
        expect(w.get('[data-test=speed-error]').text()).toBe('Error: Speed must be between 0.1 and 10 km/h.');
        expect(w.get('[data-test=radius-error]').text()).toBe('Error: Radius must be between 1 and 30 km.');
        expect(w.get('[data-test=lat]').attributes('aria-invalid')).toBe('true');
        expect(w.get('[data-test=run]').attributes('disabled')).toBeDefined();
        await w.get('[data-test=radius]').setValue('');
        expect(w.find('[data-test=radius-error]').exists()).toBe(false);
    });

    it('lets a start point from the map or a marker fill the fields', async () => {
        const w = mountPanel();
        setStartPoint(172, -40);
        await nextTick();
        expect((w.get('[data-test=lat]').element as HTMLInputElement).value).toBe('-40');
        expect((w.get('[data-test=lng]').element as HTMLInputElement).value).toBe('172');
    });

    it('uses decimal keyboards and 16 px inputs with 44 px targets', () => {
        const w = mountPanel();
        for (const id of ['lat', 'lng', 'speed', 'radius', 'band-input']) {
            const el = w.get(`[data-test=${id}]`);
            expect(el.attributes('inputmode')).toBe('decimal');
            expect(el.attributes('style')).toContain('font-size: 16px');
            expect(el.attributes('style')).toContain('min-height: 44px');
            expect(el.attributes('style')).toContain('min-width: 0');
        }
        for (const b of w.findAll('button')) {
            const style = b.attributes('style') ?? '';
            const height = Number(/(?:min-)?height: (\d+)px/.exec(style)?.[1]);
            expect(height, b.html()).toBeGreaterThanOrEqual(44);
        }
    });

    it('wires the buttons to the controller', async () => {
        const w = mountPanel();
        await w.get('[data-test=pick]').trigger('click');
        expect(spies.pick).toHaveBeenCalledTimes(1);
        form.lat = '-40';
        await nextTick();
        await w.get('[data-test=clear]').trigger('click');
        expect(spies.clear).toHaveBeenCalledTimes(1);
    });

    it('shows the banner while picking, with a Cancel button', async () => {
        const w = mountPanel();
        session.picking = true;
        await nextTick();
        expect(w.get('[data-test=pick-banner]').text()).toContain('Tap the map to set the start point');
        expect(w.get('[data-test=pick]').attributes('aria-pressed')).toBe('true');
        await w.get('[data-test=pick-cancel]').trigger('click');
        expect(spies.pick).toHaveBeenCalledTimes(1);
    });

    it('opens the marker list from "Choose a marker"', async () => {
        const w = mountPanel();
        await w.get('[data-test=choose-marker]').trigger('click');
        expect(session.markerOpen).toBe(true);
        expect(spies.loadMarkers).toHaveBeenCalledTimes(1);
        await flushPromises();
        expect(w.find('[data-test=marker-picker]').exists()).toBe(true);
        expect(w.get('[data-test=choose-marker]').attributes('aria-expanded')).toBe('true');
    });
});

describe('BandChips', () => {
    it('adds bands, keeps them sorted, and removes them with named buttons', async () => {
        wrapper = mount(BandChips);
        await wrapper.get('[data-test=band-input]').setValue('3');
        await wrapper.get('[data-test=band-add]').trigger('click');
        expect(wrapper.findAll('[data-test=band]').map((b) => b.text())).toEqual(['1 h', '2 h', '3 h', '4 h', '8 h']);
        expect((wrapper.get('[data-test=band-input]').element as HTMLInputElement).value).toBe('');
        const names = wrapper.findAll('[data-test=band-remove]').map((b) => b.attributes('aria-label'));
        expect(names).toEqual(['Remove 1 h band', 'Remove 2 h band', 'Remove 3 h band', 'Remove 4 h band', 'Remove 8 h band']);
        await wrapper.findAll('[data-test=band-remove]')[2].trigger('click');
        expect([...form.bands]).toEqual([1, 2, 4, 8]);
    });

    it('adds with Enter', async () => {
        wrapper = mount(BandChips);
        await wrapper.get('[data-test=band-input]').setValue('0.5');
        await wrapper.get('[data-test=band-input]').trigger('keydown.enter');
        expect([...form.bands]).toEqual([0.5, 1, 2, 4, 8]);
    });

    it('allows 1 to 8 bands and says why a ninth is refused', async () => {
        wrapper = mount(BandChips);
        for (const h of ['3', '5', '6', '7']) {
            await wrapper.get('[data-test=band-input]').setValue(h);
            await wrapper.get('[data-test=band-add]').trigger('click');
        }
        expect(wrapper.findAll('[data-test=band]')).toHaveLength(8);
        await wrapper.get('[data-test=band-input]').setValue('9');
        await wrapper.get('[data-test=band-add]').trigger('click');
        expect(wrapper.findAll('[data-test=band]')).toHaveLength(8);
        expect(wrapper.get('[data-test=band-add-error]').text()).toBe('Error: Use at most 8 time bands.');
        for (const b of [...form.bands]) form.bands = form.bands.filter((x) => x !== b);
        await nextTick();
        expect(wrapper.findAll('[data-test=band]')).toHaveLength(0);
    });

    it('explains a bad band', async () => {
        wrapper = mount(BandChips);
        await wrapper.get('[data-test=band-input]').setValue('25');
        await wrapper.get('[data-test=band-add]').trigger('click');
        expect(wrapper.get('[data-test=band-add-error]').text()).toContain('between 0.25 and 24 h');
        await wrapper.get('[data-test=band-input]').setValue('');
        await wrapper.get('[data-test=band-add]').trigger('click');
        expect(wrapper.get('[data-test=band-add-error]').text()).toContain('Enter a time band');
        await wrapper.get('[data-test=band-input]').setValue('1');
        expect(wrapper.find('[data-test=band-add-error]').exists()).toBe(false);
    });

    it('disables the controls while a calculation runs', () => {
        wrapper = mount(BandChips, { props: { disabled: true } });
        expect((wrapper.get('[data-test=band-input]').element as HTMLInputElement).disabled).toBe(true);
        expect((wrapper.get('[data-test=band-add]').element as HTMLButtonElement).disabled).toBe(true);
        for (const b of wrapper.findAll('[data-test=band-remove]')) expect((b.element as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('running state', () => {
    it('disables the inputs, shows the spinner, elapsed seconds, the wait text and Cancel', async () => {
        const w = mountPanel();
        form.lat = '-40';
        form.lng = '172';
        startRun();
        session.elapsed = 7;
        await nextTick();
        expect(w.get('[data-test=progress]').text()).toContain('Working... 7 s');
        expect(w.get('[data-test=progress]').text()).toContain('This can take up to a minute, especially the first time.');
        expect(w.get('[data-test=progress] .spinner-border').attributes('role')).toBe('status');
        expect(w.get('[data-test=ipp]').attributes('disabled')).toBeDefined();
        expect(w.get('[data-test=settings]').attributes('disabled')).toBeDefined();
        expect((w.get('[data-test=band-input]').element as HTMLInputElement).disabled).toBe(true);
        expect(w.find('[data-test=run]').exists()).toBe(false);
        session.elapsed = 65;
        await nextTick();
        expect(w.get('[data-test=progress]').text()).toContain('Working... 1 min 5 s');
        await w.get('[data-test=cancel]').trigger('click');
        expect(spies.cancel).toHaveBeenCalledTimes(1);
    });

    it('returns to the form when the run ends', async () => {
        const w = mountPanel();
        form.lat = '-40';
        form.lng = '172';
        startRun();
        await nextTick();
        finish(result());
        await nextTick();
        expect(w.find('[data-test=progress]').exists()).toBe(false);
        expect(w.find('[data-test=cancel]').exists()).toBe(false);
        expect(w.find('[data-test=run]').exists()).toBe(true);
    });
});

describe('SarResult', () => {
    it('shows the effective radius, the bands with swatch and text, and the data date', async () => {
        ui.sections['result-details'] = true;
        wrapper = mount(SarResult);
        finish(result());
        await nextTick();
        expect(wrapper.get('[data-test=summary]').text()).toContain('Effective radius 12 km.');
        expect(wrapper.get('[data-test=summary]').text()).toContain('Speed 2.5 km/h.');
        const bands = wrapper.findAll('[data-test=result-band]');
        expect(bands.map((b) => b.text())).toEqual(['1 h', '2 h', '4 h']);
        expect(bands[0].get('[data-test=swatch]').attributes('aria-hidden')).toBe('true');
        expect(wrapper.get('[data-test=built]').text()).toBe('Roads and trails data from 1 March 2026');
    });

    it('renders the disclaimer and the attribution verbatim, as text', async () => {
        ui.sections['result-details'] = true;
        wrapper = mount(SarResult);
        const disclaimer = 'A <b>synthetic</b> disclaimer &amp; text.';
        finish(result({ disclaimer, attribution: ['One <i>x</i>', 'Two & three'] }));
        await nextTick();
        expect(wrapper.get('[data-test=disclaimer]').text()).toBe(disclaimer);
        expect(wrapper.get('[data-test=disclaimer]').find('b').exists()).toBe(false);
        expect(wrapper.get('[data-test=attribution]').findAll('li').map((li) => li.text())).toEqual(['One <i>x</i>', 'Two & three']);
    });

    it('prefixes warnings with Warning: and notes with Note:', async () => {
        wrapper = mount(SarResult);
        finish(result());
        await nextTick();
        const alerts = wrapper.findAll('[data-test=warning]');
        expect(alerts.map((w) => `${w.get('.alert-heading').text()}: ${w.get('.alert-description').text()}`)).toEqual(['Warning: Synthetic warning.', 'Note: Synthetic note.']);
        expect(alerts.map((w) => w.get('.alert').classes())).toEqual([expect.arrayContaining(['alert-warning']), expect.arrayContaining(['alert-info'])]);
    });

    it('keeps the attribution and the data date in a closed box, the disclaimer in view', async () => {
        wrapper = mount(SarResult);
        finish(result({ disclaimer: 'Synthetic disclaimer text.' }));
        await nextTick();
        expect(wrapper.get('[data-test=disclaimer]').text()).toBe('Synthetic disclaimer text.');
        expect(wrapper.find('[data-test=attribution]').exists()).toBe(false);
        expect(wrapper.find('[data-test=built]').exists()).toBe(false);
        await wrapper.get('[data-test=box-result-details] .slidedown__header').trigger('click');
        expect(wrapper.find('[data-test=attribution]').exists()).toBe(true);
        expect(wrapper.find('[data-test=built]').exists()).toBe(true);
    });
    it('says so when no contour was drawn, and omits parts the result does not have', async () => {
        ui.sections['result-details'] = true;
        wrapper = mount(SarResult);
        finish(result({ contours: { type: 'FeatureCollection', features: [] }, warnings: [], attribution: [], disclaimer: '', data: {} }));
        await nextTick();
        expect(wrapper.get('[data-test=no-bands]').text()).toBe('No contours were drawn.');
        for (const id of ['warnings', 'disclaimer', 'attribution', 'built']) expect(wrapper.find(`[data-test=${id}]`).exists()).toBe(false);
    });

    it('lists bands in time order whatever the order of the features', async () => {
        wrapper = mount(SarResult);
        finish(result({ contours: { type: 'FeatureCollection', features: [feature(4), feature(0.25, { color: '#00ff00' }), feature(2.5)] } }));
        await nextTick();
        expect(wrapper.findAll('[data-test=result-band]').map((b) => b.text())).toEqual(['0.25 h', '2.5 h', '4 h']);
    });

    it('renders nothing without a result', () => {
        wrapper = mount(SarResult);
        expect(wrapper.find('[data-test=result]').exists()).toBe(false);
    });
});

describe('errors', () => {
    const MESSAGES: [string, CalcError, string][] = [
        ['unavailable', { kind: 'unavailable' }, 'SAR planning is unavailable. Contact your administrator.'],
        ['timeout', { kind: 'timeout' }, 'The calculation took too long. Try a smaller radius.'],
        ['failed', { kind: 'failed' }, 'Analysis failed. Try again, or try a smaller area.'],
        ['network', { kind: 'network' }, 'Could not reach the server. Check your connection and try again.'],
        ['busy', { kind: 'busy', retryAfterS: 20 }, 'Too many requests. Try again in 20 seconds.'],
    ];

    it.each(MESSAGES)('shows the message for %s', async (_name, error, text) => {
        const w = mountPanel();
        failRun(error);
        await settle();
        expect(w.get('[data-test=error-alert] .alert-description').text()).toBe(text);
        expect(w.get('[data-test=error-alert] .alert-heading').text()).toBe('Error');
        expect(w.get('[data-test=error-alert]').attributes('class') ?? '').toContain('col-lg-12');
        expect(w.find('[data-test=error-alert] [role=alert]').exists()).toBe(true);
    });

    it('offers Retry for timeouts, network failures, failures and rate limits only', async () => {
        const w = mountPanel();
        for (const [name, error] of MESSAGES) {
            failRun(error);
            await settle();
            expect(w.find('[data-test=retry]').exists(), name).toBe(name !== 'unavailable');
        }
        failRun(dense());
        await settle();
        expect(w.find('[data-test=retry]').exists()).toBe(false);
    });

    it('Retry runs the calculation again', async () => {
        const w = mountPanel();
        failRun({ kind: 'timeout' });
        await settle();
        await w.get('[data-test=retry]').trigger('click');
        expect(spies.run).toHaveBeenCalledTimes(1);
    });

    it('keeps the generic message for a timeout even when the body had a suggestion', async () => {
        const w = mountPanel();
        failRun({ kind: 'timeout', status: 504, suggestions: { radiusKm: 6 } });
        await settle();
        expect(w.get('[data-test=error-alert] .alert-description').text()).toBe('The calculation took too long. Try a smaller radius.');
        expect(w.find('[data-test=suggest-radius]').exists()).toBe(false);
    });

    it('a 422 without a code (the sea, for example) shows the message verbatim and no button', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6 }, null));
        await settle();
        expect(w.get('[data-test=error-alert] .alert-description').element.textContent).toBe('Synthetic message, exactly  as received.');
        expect(w.findAll('[data-test=error] button')).toHaveLength(0);
    });
});

describe('dense-area refusal (area_too_dense)', () => {
    it('shows the message exactly as received', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6 }));
        await settle();
        expect(w.get('[data-test=error-alert] .alert-description').element.textContent).toBe('Synthetic message, exactly  as received.');
    });

    it('radius only: a button "Try {n} km" that fills the radius', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6.5 }));
        await settle();
        const buttons = w.findAll('[data-test=error] button');
        expect(buttons.map((b) => b.text())).toEqual(['Try 6.5 km']);
        await w.get('[data-test=suggest-radius]').trigger('click');
        expect(form.radius).toBe('6.5');
        expect((w.get('[data-test=radius]').element as HTMLInputElement).value).toBe('6.5');
    });

    it('hours only: a button "Set longest band to {h} h" that edits the longest band chip', async () => {
        const w = mountPanel();
        failRun(dense({ maxHours: 3 }));
        await settle();
        expect(w.findAll('[data-test=error] button').map((b) => b.text())).toEqual(['Set longest band to 3 h']);
        await w.get('[data-test=suggest-hours]').trigger('click');
        expect(w.findAll('[data-test=band]').map((b) => b.text())).toEqual(['1 h', '2 h', '3 h']);
        expect(form.radius).toBe('10');
    });

    it('both: two buttons, and the longest-band button sets both the radius and the band', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6, maxHours: 3 }));
        await settle();
        expect(w.findAll('[data-test=error] button').map((b) => b.text())).toEqual(['Try 6 km', 'Set longest band to 3 h']);
        expect(w.get('#sar-suggest-both').text()).toBe('Also sets the radius to 6 km.');
        expect(w.get('[data-test=suggest-hours]').attributes('aria-describedby')).toBe('sar-suggest-both');
        await w.get('[data-test=suggest-hours]').trigger('click');
        expect(form.radius).toBe('6');
        expect([...form.bands]).toEqual([1, 2, 3]);
    });

    it('neither: no button', async () => {
        const w = mountPanel();
        failRun(dense());
        await settle();
        expect(w.get('[data-test=error-alert] .alert-description').text()).toBe('Synthetic message, exactly  as received.');
        expect(w.findAll('[data-test=error] button')).toHaveLength(0);
    });

    it('ignores malformed and out-of-limit suggestions but still shows the message', async () => {
        const w = mountPanel();
        const badRadius = [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 0.99, 31];
        const badHours = [Number.NaN, Number.NEGATIVE_INFINITY, -1, 0, 0.24, 24.01];
        for (const [i, radiusKm] of badRadius.entries()) {
            const maxHours = badHours[i];
            failRun(dense({ radiusKm, maxHours }));
            await settle();
            expect(w.get('[data-test=error-alert] .alert-description').element.textContent, String(radiusKm)).toBe('Synthetic message, exactly  as received.');
            expect(w.findAll('[data-test=error] button'), String(radiusKm)).toHaveLength(0);
        }
        // A string cannot come through the typed client, but the panel must not trust the type.
        failRun(dense({ radiusKm: 'x' as unknown as number, maxHours: null as unknown as number }));
        await settle();
        expect(w.findAll('[data-test=error] button')).toHaveLength(0);
    });

    it('offers only the usable suggestion when the other is out of limits (never clamped)', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 99, maxHours: 3 }));
        await settle();
        expect(w.findAll('[data-test=error] button').map((b) => b.text())).toEqual(['Set longest band to 3 h']);
        expect(w.find('#sar-suggest-both').exists()).toBe(false);
        await w.get('[data-test=suggest-hours]').trigger('click');
        expect(form.radius).toBe('10');
        failRun(dense({ radiusKm: 6, maxHours: 99 }));
        await settle();
        expect(w.findAll('[data-test=error] button').map((b) => b.text())).toEqual(['Try 6 km']);
    });

    it('the buttons only edit the inputs: nothing is run, and the error stays', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6, maxHours: 3 }));
        await settle();
        await w.get('[data-test=suggest-radius]').trigger('click');
        await w.get('[data-test=suggest-hours]').trigger('click');
        for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
        expect(session.run).toBe('error');
        expect(w.find('[data-test=error]').exists()).toBe(true);
    });

    it('moves focus to the first button', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6, maxHours: 3 }));
        await settle();
        expect(document.activeElement).toBe(w.get('[data-test=suggest-radius]').element);
    });

    it('moves focus to the message container when there is no button', async () => {
        const w = mountPanel();
        failRun(dense());
        await settle();
        expect(document.activeElement).toBe(w.get('[data-test=error]').element);
        expect(w.get('[data-test=error]').attributes('tabindex')).toBe('-1');
        failRun(dense({ radiusKm: 6 }, null));
        await settle();
        expect(document.activeElement).toBe(w.get('[data-test=error]').element);
    });

    it('moves focus on a generic error to its Retry button, and to the message when there is none', async () => {
        const w = mountPanel();
        failRun({ kind: 'timeout' });
        await settle();
        expect(document.activeElement).toBe(w.get('[data-test=retry]').element);
        failRun({ kind: 'unavailable' });
        await settle();
        expect(document.activeElement).toBe(w.get('[data-test=error]').element);
    });

    it('announces the message in the single aria-live region', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6 }));
        await settle();
        const live = w.findAll('[aria-live]');
        expect(live).toHaveLength(1);
        expect(live[0].attributes('aria-live')).toBe('polite');
        expect(live[0].element.textContent).toBe('Synthetic message, exactly  as received.');
    });

    it('announces a generic error and a finished calculation in the same region', async () => {
        const w = mountPanel();
        failRun({ kind: 'timeout' });
        await settle();
        expect(w.get('[data-test=live]').element.textContent).toBe('The calculation took too long. Try a smaller radius.');
        finish(result());
        await settle();
        expect(w.get('[data-test=live]').element.textContent).toBe('Calculation finished. 3 contours and the start point added to the map as features.');
    });

    it('does not rely on colour: the error starts with the text "Error:"', async () => {
        const w = mountPanel();
        failRun(dense({ radiusKm: 6 }));
        await settle();
        expect(w.get('[data-test=error]').text().startsWith('Error')).toBe(true);
        expect(w.find('[data-test=error] [role=alert]').exists()).toBe(true);
    });
});

describe('MarkerPicker', () => {
    it('lists the first 100 matches by name and filters', async () => {
        wrapper = mount(MarkerPicker);
        session.markers = Array.from({ length: 120 }, (_v, i) => ({ id: `m${i}`, callsign: `Marker ${String(i).padStart(3, '0')}`, lat: -40, lng: 172 }));
        await nextTick();
        expect(wrapper.findAll('[data-test=marker]')).toHaveLength(100);
        expect(wrapper.get('[data-test=marker-truncated]').text()).toContain('first 100 of 120');
        await wrapper.get('[data-test=marker-filter]').setValue('marker 11');
        expect(wrapper.findAll('[data-test=marker]')).toHaveLength(10);
        expect(wrapper.find('[data-test=marker-truncated]').exists()).toBe(false);
        await wrapper.get('[data-test=marker-filter]').setValue('nothing');
        expect(wrapper.get('[data-test=marker-empty]').text()).toBe('No markers found.');
    });

    it('chooses a marker as the start point', async () => {
        wrapper = mount(MarkerPicker);
        session.markers = [{ id: 'a', callsign: 'Alpha <b>1</b>', lat: -40.5, lng: 172.25 }];
        session.markerOpen = true;
        await nextTick();
        expect(wrapper.get('[data-test=marker]').text()).toBe('Alpha <b>1</b>');
        await wrapper.get('[data-test=marker]').trigger('click');
        expect([form.lat, form.lng]).toEqual(['-40.5', '172.25']);
        expect(session.markerOpen).toBe(false);
    });

    it('shows loading and failure states', async () => {
        wrapper = mount(MarkerPicker);
        session.markersLoading = true;
        await nextTick();
        expect(wrapper.find('[data-test=marker-loading]').exists()).toBe(true);
        session.markersLoading = false;
        session.markersFailed = true;
        await nextTick();
        expect(wrapper.get('[data-test=marker-failed]').text()).toBe('Could not read the markers.');
    });
});

describe('accessibility and safety', () => {
    it('gives every button and input an accessible name', async () => {
        const w = mountPanel();
        form.lat = '-40';
        form.lng = '172';
        session.picking = true;
        session.markerOpen = true;
        session.markers = [{ id: 'a', callsign: 'Alpha', lat: -40, lng: 172 }];
        finish(result());
        await nextTick();
        failRun(dense({ radiusKm: 6, maxHours: 3 }));
        await settle();
        form.mode = 'tarr';
        await settle();
        const html = w.element as HTMLElement;
        for (const button of html.querySelectorAll('button')) {
            const name = button.getAttribute('aria-label') ?? button.textContent?.trim();
            expect(name, button.outerHTML).toBeTruthy();
        }
        for (const input of html.querySelectorAll('input')) {
            const label = input.id ? html.querySelector(`label[for="${input.id}"]`) : null;
            expect(label?.textContent?.trim() || input.getAttribute('aria-label'), input.outerHTML).toBeTruthy();
        }
        expect(html.querySelectorAll('[aria-live]')).toHaveLength(1);
    });

    it('is a single column that the host pane scrolls: no bottom-bar sizing', () => {
        const source = readFileSync(join(libDir, 'SarPane.vue'), 'utf8');
        expect(source).not.toMatch(/position-absolute|@container|max-height: min\(60/);
        expect(source).toContain('min-w-0');
    });

    it('never uses v-html', () => {
        for (const name of readdirSync(libDir).filter((n) => n.endsWith('.vue'))) {
            expect(readFileSync(join(libDir, name), 'utf8'), name).not.toMatch(/v-html|innerHTML/);
        }
    });
});
