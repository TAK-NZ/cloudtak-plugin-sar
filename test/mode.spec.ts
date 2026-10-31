import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import BandChips from '../lib/BandChips.vue';
import SarPane from '../lib/SarPane.vue';
import SarResult from '../lib/SarResult.vue';
import { bindController, bindStorage, finishRun, form, resetAll, session } from '../lib/state.ts';
import type { Controller } from '../lib/state.ts';
import { WHATS_TARR, WHATS_TRAVEL_TIME } from '../lib/copy.ts';
import { parseResult } from '../lib/result.ts';
import type { RunMeta, TarrResult } from '../lib/types.ts';
import { ring, tarrBody } from './fixtures.ts';

vi.mock('../lib/missions.ts', () => ({ listSubscribedMissions: vi.fn(async () => []) }));

let wrapper: VueWrapper | undefined;
let spies: { [K in keyof Controller]: ReturnType<typeof vi.fn> };
const tarrMeta: RunMeta = { mode: 'tarr', ranAt: '2026-03-01T12:00:00Z', ipp: { lat: -40, lng: 172 }, profile: 'Hiker' };
const tarrResult = (over: Record<string, unknown> = {}): TarrResult => parseResult(tarrBody(over), 'tarr') as TarrResult;
const mountPane = (): VueWrapper => {
    wrapper = mount(SarPane, { attachTo: document.body });
    return wrapper;
};
const sel = (w: VueWrapper, id: string): HTMLSelectElement => w.get(`[data-test=${id}]`).element as HTMLSelectElement;

beforeEach(() => {
    bindStorage(null);
    resetAll();
    session.tarrAvailable = true;
    spies = {
        run: vi.fn(), cancel: vi.fn(), clear: vi.fn(), pick: vi.fn(), loadMarkers: vi.fn(async () => []),
        addToDataSync: vi.fn(async () => undefined), createPackage: vi.fn(async () => undefined), exportFiles: vi.fn(async () => undefined),
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

describe('mode selector', () => {
    it('is a radio group named Analysis mode with Travel Time selected', () => {
        const w = mountPane();
        const group = w.get('[role=radiogroup]');
        expect(group.attributes('aria-label')).toBe('Analysis mode');
        const radios = w.findAll('input[type=radio]');
        expect(radios).toHaveLength(2);
        expect(w.get('label[for=sar-mode-travel-time]').text()).toBe('Travel Time');
        expect(w.get('label[for=sar-mode-tarr]').text()).toBe('TARR Analysis');
        expect((w.get('[data-test=mode-travel-time]').element as HTMLInputElement).checked).toBe(true);
        expect((w.get('[data-test=mode-tarr]').element as HTMLInputElement).checked).toBe(false);
    });

    it('describes each mode', () => {
        const w = mountPane();
        expect(w.get('#sar-mode-travel-time-desc').text()).toContain('No subject profile needed');
        expect(w.get('#sar-mode-tarr-desc').text()).toContain('not calibrated for New Zealand');
        expect(w.get('[data-test=mode-tarr]').attributes('aria-describedby')).toBe('sar-mode-tarr-desc');
    });

    it('switches to TARR and shows the profile form instead of the travel settings', async () => {
        const w = mountPane();
        expect(w.find('[data-test=speed]').exists()).toBe(true);
        expect(w.find('[data-test=profile]').exists()).toBe(false);
        await w.get('[data-test=mode-tarr]').setValue(true);
        expect(form.mode).toBe('tarr');
        expect(w.find('[data-test=speed]').exists()).toBe(false);
        expect(w.find('[data-test=band-input]').exists()).toBe(false);
        expect(w.find('[data-test=radius]').exists()).toBe(false);
        expect(w.find('[data-test=profile]').exists()).toBe(true);
        await w.get('[data-test=mode-travel-time]').setValue(true);
        expect(form.mode).toBe('travel-time');
        expect(w.find('[data-test=speed]').exists()).toBe(true);
    });

    it('disables TARR with a reason when the server cannot do it', () => {
        session.tarrAvailable = false;
        const w = mountPane();
        expect((w.get('[data-test=mode-tarr]').element as HTMLInputElement).disabled).toBe(true);
        expect(w.get('[data-test=mode-tarr-desc]').text()).toContain('Not available on this server');
        expect((w.get('[data-test=mode-travel-time]').element as HTMLInputElement).disabled).toBe(false);
    });

    it('is disabled while a calculation runs', async () => {
        const w = mountPane();
        session.run = 'running';
        await nextTick();
        expect(w.get('[data-test=mode]').attributes('disabled')).toBeDefined();
    });

    it('keeps the start point when the mode changes', async () => {
        const w = mountPane();
        form.lat = '-40';
        form.lng = '172';
        await w.get('[data-test=mode-tarr]').setValue(true);
        expect([form.lat, form.lng]).toEqual(['-40', '172']);
    });
});

describe('explainers', () => {
    it('has both explainers with their text, the active mode first', async () => {
        const w = mountPane();
        const first = w.findAll('details').map((d) => d.attributes('data-test'));
        expect(first).toEqual(['explainer-travel-time', 'explainer-tarr']);
        await w.get('[data-test=mode-tarr]').setValue(true);
        expect(w.findAll('details').map((d) => d.attributes('data-test'))).toEqual(['explainer-tarr', 'explainer-travel-time']);
        expect(w.get('[data-test=explainer-travel-time] summary').text()).toBe("What's Travel Time?");
        expect(w.get('[data-test=explainer-tarr] summary').text()).toBe("What's a TARR?");
        for (const e of [WHATS_TRAVEL_TIME, WHATS_TARR]) {
            for (const section of e.sections) {
                expect(w.text()).toContain(section.heading);
                expect(w.text()).toContain(section.text);
            }
        }
    });

    it('describes New Zealand data, not the US sources of the reference tool', () => {
        const text = JSON.stringify([WHATS_TRAVEL_TIME, WHATS_TARR]);
        expect(text).toContain('LCDB');
        expect(text).toContain('OpenStreetMap');
        expect(text).not.toMatch(/NLCD|NHD|mph/);
    });
});

describe('travel time hints and presets', () => {
    it('shows the speed hint and four presets in km/h with their labels', () => {
        const w = mountPane();
        expect(w.get('[data-test=speed-hint]').text()).toContain('Assumed speed on flat, unobstructed ground');
        const presets = w.findAll('[data-test=speed-preset]');
        expect(presets.map((p) => p.text().replace(/\s+/g, ' '))).toEqual([
            '0.8 km/h Impaired', '1.6 km/h Slow', '3.2 km/h Moderate', '5.0 km/h Fit hiker',
        ]);
        expect(w.text()).not.toContain('mph');
    });

    it('a preset sets the speed field and is shown as pressed', async () => {
        const w = mountPane();
        const presets = w.findAll('[data-test=speed-preset]');
        expect(presets.map((p) => p.attributes('aria-pressed'))).toEqual(['false', 'false', 'false', 'false']);
        await presets[3].trigger('click');
        expect(form.speed).toBe('5');
        expect((w.get('[data-test=speed]').element as HTMLInputElement).value).toBe('5');
        expect(w.findAll('[data-test=speed-preset]').map((p) => p.attributes('aria-pressed'))).toEqual(['false', 'false', 'false', 'true']);
        await w.get('[data-test=speed]').setValue('5.0');
        expect(w.findAll('[data-test=speed-preset]')[3].attributes('aria-pressed')).toBe('true');
        await w.get('[data-test=speed]').setValue('2.5');
        expect(w.findAll('[data-test=speed-preset]').every((p) => p.attributes('aria-pressed') === 'false')).toBe(true);
    });

    it('disables the presets while running', () => {
        wrapper = mount(SarPane, { attachTo: document.body });
        session.run = 'running';
        return nextTick().then(() => {
            expect(wrapper?.get('[data-test=settings]').attributes('disabled')).toBeDefined();
        });
    });

    it('shows the start point hint and the band hint', () => {
        const w = mountPane();
        expect(w.get('[data-test=start-hint]').text()).toContain('Pick a point on the map');
        expect(w.get('#sar-band-help').text()).toContain('outer edge of where the subject could physically be');
    });

    it('keeps run disabled until the start point and the speed are set, and says what is missing', async () => {
        const w = mountPane();
        expect(w.get('[data-test=run-hint]').text()).toBe('Set the start point to run.');
        form.lat = '-40';
        form.lng = '172';
        form.speed = '';
        await nextTick();
        expect(w.get('[data-test=run]').attributes('disabled')).toBeDefined();
        expect(w.get('[data-test=run-hint]').text()).toBe('Set a valid speed to run.');
        await w.get('[data-test=speed-preset]').trigger('click');
        expect(w.get('[data-test=run]').attributes('disabled')).toBeUndefined();
        expect(w.find('[data-test=run-hint]').exists()).toBe(false);
    });
});

describe('quick-add bands', () => {
    it('offers 6, 10 and 12 h, adds one and no longer offers it', async () => {
        wrapper = mount(BandChips);
        expect(wrapper.findAll('[data-test=band-quick]').map((b) => b.text())).toEqual(['Add 6 h', 'Add 10 h', 'Add 12 h']);
        await wrapper.findAll('[data-test=band-quick]')[2].trigger('click');
        expect([...form.bands]).toEqual([1, 2, 4, 8, 12]);
        expect(wrapper.findAll('[data-test=band-quick]').map((b) => b.text())).toEqual(['Add 6 h', 'Add 10 h']);
        expect(wrapper.findAll('[data-test=band]').map((b) => b.text())).toEqual(['1 h', '2 h', '4 h', '8 h', '12 h']);
    });

    it('keeps 24 h as a valid band and the default chips at 1, 2, 4 and 8 h', async () => {
        wrapper = mount(BandChips);
        expect([...form.bands]).toEqual([1, 2, 4, 8]);
        await wrapper.get('[data-test=band-input]').setValue('24');
        await wrapper.get('[data-test=band-add]').trigger('click');
        expect([...form.bands]).toEqual([1, 2, 4, 8, 24]);
    });

    it('disables the quick buttons while running and at eight bands', async () => {
        wrapper = mount(BandChips, { props: { disabled: true } });
        for (const b of wrapper.findAll('[data-test=band-quick]')) expect((b.element as HTMLButtonElement).disabled).toBe(true);
        wrapper.unmount();
        form.bands = [1, 2, 3, 4, 5, 6.5, 7, 8];
        wrapper = mount(BandChips);
        for (const b of wrapper.findAll('[data-test=band-quick]')) expect((b.element as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('TARR form', () => {
    beforeEach(() => {
        form.mode = 'tarr';
    });

    it('has a labelled profile select with a prompt and the 28 profiles', () => {
        const w = mountPane();
        expect(w.get('label[for=sar-profile]').text()).toBe('Subject profile');
        const options = [...sel(w, 'profile').options];
        expect(options[0].text.trim()).toBe('Select a profile');
        expect(options).toHaveLength(29);
        expect(options.map((o) => o.text.trim())).toContain('Hiker');
        expect(w.get('[data-test=profile]').attributes('aria-describedby')).toBe('sar-profile-help');
    });

    it('shows the ecoregion and terrain selects only when the profile offers them', async () => {
        const w = mountPane();
        expect(w.find('[data-test=ecoregion]').exists()).toBe(false);
        await w.get('[data-test=profile]').setValue('Abduction');
        expect(w.find('[data-test=ecoregion]').exists()).toBe(false);
        await w.get('[data-test=profile]').setValue('Hiker');
        expect([...sel(w, 'ecoregion').options].map((o) => o.text.trim())).toEqual(['Other / default', 'Dry', 'Temperate']);
        expect(w.find('[data-test=terrain]').exists()).toBe(false);
        await w.get('[data-test=ecoregion]').setValue('Dry');
        expect([...sel(w, 'terrain').options].map((o) => o.text.trim())).toEqual(['Other / default', 'Mountainous', 'Flat']);
        await w.get('[data-test=ecoregion]').setValue('');
        expect(w.find('[data-test=terrain]').exists()).toBe(false);
    });

    it('resets the dependent selects when the profile changes', async () => {
        const w = mountPane();
        await w.get('[data-test=profile]').setValue('Hiker');
        await w.get('[data-test=ecoregion]').setValue('Dry');
        await w.get('[data-test=terrain]').setValue('Flat');
        expect([form.ecoregion, form.terrain]).toEqual(['Dry', 'Flat']);
        await w.get('[data-test=profile]').setValue('Camper');
        expect([form.profile, form.ecoregion, form.terrain]).toEqual(['Camper', '', '']);
    });

    it('shows the Koester distances for the choice and the source', async () => {
        const w = mountPane();
        expect(w.find('[data-test=koester-distances]').exists()).toBe(false);
        await w.get('[data-test=profile]').setValue('Hiker');
        expect(w.get('[data-test=koester-distances]').text()).toBe('Koester distances for this choice: 25%: 0.64 km, 50%: 1.77 km, 75%: 3.22 km');
        await w.get('[data-test=ecoregion]').setValue('Dry');
        await w.get('[data-test=terrain]').setValue('Flat');
        expect(w.get('[data-test=koester-distances]').text()).toContain('25%: 1.29 km, 50%: 2.09 km, 75%: 6.6 km');
        expect(w.get('[data-test=koester-source]').text()).toContain('Koester (2008)');
    });

    it('states the Arizona multiplier and the not-calibrated notice before the run', () => {
        const w = mountPane();
        expect(w.get('[data-test=tarr-notice-calibration]').text()).toContain('Coconino County, Arizona');
        expect(w.get('[data-test=tarr-notice-calibration]').text()).toContain('not calibrated for New Zealand');
        expect(w.get('[data-test=tarr-notice-percent]').text()).toContain('not the chance of finding someone in New Zealand');
    });

    it('keeps run disabled until the start point and a profile are set', async () => {
        const w = mountPane();
        expect(w.get('[data-test=run-hint]').text()).toBe('Set the start point to run.');
        form.lat = '-40';
        form.lng = '172';
        await nextTick();
        expect(w.get('[data-test=run]').attributes('disabled')).toBeDefined();
        expect(w.get('[data-test=run-hint]').text()).toBe('Choose a subject profile to run.');
        await w.get('[data-test=profile]').setValue('Hiker');
        expect(w.get('[data-test=run]').attributes('disabled')).toBeUndefined();
        await w.get('[data-test=run]').trigger('click');
        expect(spies.run).toHaveBeenCalledTimes(1);
    });

    it('does not need a speed or bands in TARR mode', async () => {
        const w = mountPane();
        form.lat = '-40';
        form.lng = '172';
        form.speed = '';
        form.bands = [];
        await w.get('[data-test=profile]').setValue('Hiker');
        expect(w.get('[data-test=run]').attributes('disabled')).toBeUndefined();
    });
});

describe('TARR result', () => {
    const show = async (over: Record<string, unknown> = {}): Promise<VueWrapper> => {
        wrapper = mount(SarResult);
        finishRun(tarrResult(over), tarrMeta, []);
        await nextTick();
        return wrapper;
    };

    it('lists the rings by distance and source with a swatch, smallest first, terrain before plain', async () => {
        const w = await show();
        expect(w.findAll('[data-test=result-band]').map((b) => b.text())).toEqual([
            'Koester 25%, terrain-adjusted (0.736 km)',
            'Koester 25%, plain circle (0.64 km)',
            'Koester 50%, terrain-adjusted (2.036 km)',
            'Koester 50%, plain circle (1.77 km)',
            'Koester 75%, terrain-adjusted (3.703 km)',
            'Koester 75%, plain circle (3.22 km)',
        ]);
        const swatches = w.findAll('[data-test=swatch]');
        expect(swatches[0].attributes('aria-hidden')).toBe('true');
        expect(swatches[0].attributes('style')).toContain('solid');
        expect(swatches[1].attributes('style')).toContain('dashed');
    });

    it('shows the multiplier used, the region and that it is not calibrated for New Zealand', async () => {
        const w = await show();
        expect(w.get('[data-test=multiplier]').text()).toBe('Multiplier used: x1.15. Fitted to Coconino County, Arizona. Not calibrated for New Zealand.');
        expect(w.get('[data-test=calibration-note]').text()).toBe('Synthetic calibration note.');
        expect(w.get('[data-test=tarr-percent-notice]').text()).toContain('not the chance of finding someone in New Zealand');
    });

    it('shows three multipliers when the bands differ', async () => {
        const w = await show({ calibration: { region: 'Test', multiplier: { p25: 1, p50: 1.1, p75: 1.4 } } });
        expect(w.get('[data-test=multiplier]').text()).toContain('Multiplier used: 25%: x1, 50%: x1.1, 75%: x1.4.');
    });

    it('shows the profile, the Koester and calibrated distances and the radius', async () => {
        const w = await show();
        expect(w.get('[data-test=summary]').text()).toBe('Subject profile Hiker. Analysis radius 5.7 km.');
        expect(w.get('[data-test=koester-km]').text()).toContain('25%: 0.64 km, 50%: 1.77 km, 75%: 3.22 km');
        expect(w.get('[data-test=calibrated-km]').text()).toContain('25%: 0.736 km, 50%: 2.036 km, 75%: 3.703 km');
        const w2 = await show({ parameters: { profile: 'Hiker', ecoregion: 'Dry', terrain: 'Flat' } });
        expect(w2.get('[data-test=summary]').text()).toContain('Hiker (Dry, Flat)');
    });

    it('says what solid and dashed mean', async () => {
        const w = await show();
        expect(w.get('[data-test=tarr-legend]').text()).toContain('Solid rings are terrain-adjusted');
        expect(w.get('[data-test=tarr-legend]').text()).toContain('Dashed circles are the plain Koester distance');
    });

    it('renders the disclaimer and the attribution as text, only in the pane', async () => {
        const w = await show({ disclaimer: 'A <b>x</b> & y', attribution: ['One <i>x</i>'] });
        expect(w.get('[data-test=disclaimer]').text()).toBe('A <b>x</b> & y');
        expect(w.get('[data-test=disclaimer]').find('b').exists()).toBe(false);
        expect(w.get('[data-test=attribution]').text()).toBe('One <i>x</i>');
        expect(w.get('[data-test=built]').text()).toBe('Roads and trails data from 1 March 2026');
        expect(w.findAll('[data-test=warning]').map((x) => x.text())).toEqual(['Warning: Synthetic calibration warning.']);
    });

    it('tolerates a result without calibration and says so when no ring was drawn', async () => {
        const raw = tarrBody({ contours: { type: 'FeatureCollection', features: [] } });
        delete raw.calibration;
        wrapper = mount(SarResult);
        finishRun(parseResult(raw, 'tarr') as TarrResult, tarrMeta, []);
        await nextTick();
        expect(wrapper.get('[data-test=no-bands]').text()).toBe('No rings were drawn.');
        expect(wrapper.get('[data-test=multiplier]').text()).toBe('Not calibrated for New Zealand.');
        expect(wrapper.find('[data-test=calibration-note]').exists()).toBe(false);
    });

    it('draws the rings in the order of the relay: a missing terrain ring leaves the plain circle', async () => {
        const w = await show({ contours: { type: 'FeatureCollection', features: [ring(50, 'plain')] } });
        expect(w.findAll('[data-test=result-band]').map((b) => b.text())).toEqual(['Koester 50%, plain circle (1.77 km)']);
    });
});
