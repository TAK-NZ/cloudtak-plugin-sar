import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SarPane from '../lib/SarPane.vue';
import ShareActions from '../lib/ShareActions.vue';
import { bindController, bindStorage, finishRun, resetAll, session } from '../lib/state.ts';
import type { Controller } from '../lib/state.ts';
import { parseResult } from '../lib/result.ts';
import type { RunMeta, TravelTimeResult } from '../lib/types.ts';
import { okBody } from './fixtures.ts';

const missions = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../lib/missions.ts', () => ({ listSubscribedMissions: missions.list }));

let wrapper: VueWrapper | undefined;
let spies: { [K in keyof Controller]: ReturnType<typeof vi.fn> };
const meta: RunMeta = { mode: 'travel-time', ranAt: '2026-03-01T12:00:00Z', ipp: { lat: -40, lng: 172 }, speedKmh: 2.5, bandsHours: [1, 2, 4] };
const result = parseResult(okBody()) as TravelTimeResult;
const SYNCS = [{ guid: 'g1', name: 'Alpha <b>1</b>' }, { guid: 'g2', name: 'Bravo' }];

async function mountShare(): Promise<VueWrapper> {
    wrapper = mount(ShareActions, { attachTo: document.body });
    finishRun(result, meta, ['a', 'b']);
    await nextTick();
    return wrapper;
}
/** Modals render inside the wrapper (TablerModal does not teleport); fall back to the document. */
const find = (id: string): HTMLElement | null => document.body.querySelector(`[data-test=${id}]`);
const all = (id: string): HTMLElement[] => [...document.body.querySelectorAll<HTMLElement>(`[data-test=${id}]`)];

beforeEach(() => {
    bindStorage(null);
    resetAll();
    missions.list.mockReset();
    missions.list.mockResolvedValue(SYNCS);
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

describe('share actions', () => {
    it('are hidden until there is a result', async () => {
        wrapper = mount(ShareActions);
        expect(wrapper.find('[data-test=share]').exists()).toBe(false);
        finishRun(result, meta, []);
        await nextTick();
        expect(wrapper.find('[data-test=share]').exists()).toBe(true);
    });

    it('show the three buttons, and keep the hints in a closed box', async () => {
        const w = await mountShare();
        expect(w.get('.slidedown__header').text()).toBe('Save and share');
        expect(w.get('[data-test=share]').attributes('aria-label')).toBe('Save and share');
        expect(w.get('[data-test=save-files]').text()).toBe('Save to Files');
        expect(w.get('[data-test=add-to-sync]').text()).toBe('Add to Data Sync');
        expect(w.get('[data-test=create-package]').text()).toBe('Create data package');
        expect(w.find('[data-test=download-files]').exists()).toBe(false);
        expect(w.find('[data-test=share-hint]').exists()).toBe(false);
        await w.get('[data-test=box-share-about] .slidedown__header').trigger('click');
        expect(w.get('[data-test=share-files-hint]').text()).toContain('stores a KMZ in Files');
        expect(w.get('[data-test=share-hint]').text()).toContain('moves the features into the Data Sync');
        expect(w.text()).toContain('lose the holes');
        for (const b of w.findAll('button')) expect(b.attributes('style') ?? '').toContain('min-height: 44px');
    });

    it('Save to Files calls the controller, and Open Files appears once something was saved', async () => {
        const w = await mountShare();
        expect(w.find('[data-test=open-files]').exists()).toBe(false);
        await w.get('[data-test=save-files]').trigger('click');
        expect(spies.saveToFiles).toHaveBeenCalledTimes(1);
        session.share.saved = true;
        await nextTick();
        await w.get('[data-test=open-files]').trigger('click');
        expect(spies.openFiles).toHaveBeenCalledTimes(1);
    });

    it('disable the buttons while an action is busy, and show a status', async () => {
        const w = await mountShare();
        session.share.busy = true;
        await nextTick();
        for (const id of ['save-files', 'add-to-sync', 'create-package']) expect(w.get(`[data-test=${id}]`).attributes('disabled')).toBeDefined();
        expect(w.get('[data-test=share-busy]').attributes('role')).toBe('status');
        expect(w.get('[data-test=share-busy]').text()).toBe('Working...');
        session.share.status = 'Uploading to Files...';
        await nextTick();
        expect(w.get('[data-test=share-busy]').text()).toBe('Uploading to Files...');
    });

    it('show the outcome as text, and an error with the word Error', async () => {
        const w = await mountShare();
        session.share.message = 'Added 4 features to "<i>x</i>".';
        await nextTick();
        expect(w.get('[data-test=share-message] .alert-heading').text()).toBe('Added 4 features to "<i>x</i>".');
        expect(w.get('[data-test=share-message]').find('i').exists()).toBe(false);
        expect(w.get('[data-test=share-message] .alert').classes()).toContain('alert-success');
        session.share.message = '';
        session.share.error = 'Could not add to "Alpha": not loaded (0 of 1 done)';
        await nextTick();
        expect(w.get('[data-test=share-error] .alert-heading').text()).toBe('Error');
        expect(w.get('[data-test=share-error] .alert-description').text()).toBe('Could not add to "Alpha": not loaded (0 of 1 done)');
        expect(w.get('[data-test=share-error] .alert').classes()).toContain('alert-danger');
    });
});

describe('Add to Data Sync', () => {
    it('lists the Data Syncs as checkbox rows, names as text', async () => {
        const w = await mountShare();
        await w.get('[data-test=add-to-sync]').trigger('click');
        await flushPromises();
        expect(find('picker-title')?.textContent?.trim()).toBe('Add to Data Sync');
        const rows = all('sync');
        expect(rows.map((r) => r.textContent?.trim())).toEqual(['Alpha <b>1</b>', 'Bravo']);
        expect(rows.every((r) => r.getAttribute('role') === 'checkbox' && r.getAttribute('aria-checked') === 'false' && r.getAttribute('tabindex') === '0')).toBe(true);
        expect(rows[0].querySelector('b')).toBeNull();
        expect(document.body.textContent).toContain('moves the features into the Data Sync');
    });

    it('keeps the confirm button disabled until a Data Sync is chosen, then sends the choice', async () => {
        const w = await mountShare();
        await w.get('[data-test=add-to-sync]').trigger('click');
        await flushPromises();
        const confirm = (): HTMLButtonElement => find('picker-confirm') as HTMLButtonElement;
        expect(confirm().disabled).toBe(true);
        all('sync')[1].click();
        await nextTick();
        expect(all('sync')[1].getAttribute('aria-checked')).toBe('true');
        expect(confirm().disabled).toBe(false);
        all('sync')[0].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        await nextTick();
        expect(all('sync')[0].getAttribute('aria-checked')).toBe('true');
        all('sync')[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await nextTick();
        expect(all('sync')[1].getAttribute('aria-checked')).toBe('false');
        confirm().click();
        await flushPromises();
        expect(spies.addToDataSync).toHaveBeenCalledWith([SYNCS[0]]);
        expect(find('picker-title')).toBeNull();
    });

    it('cancel closes without doing anything', async () => {
        const w = await mountShare();
        await w.get('[data-test=add-to-sync]').trigger('click');
        await flushPromises();
        (find('picker-cancel') as HTMLElement).click();
        await nextTick();
        expect(find('picker-title')).toBeNull();
        expect(spies.addToDataSync).not.toHaveBeenCalled();
    });

    it('says so when there is no Data Sync with write access', async () => {
        missions.list.mockResolvedValue([]);
        const w = await mountShare();
        await w.get('[data-test=add-to-sync]').trigger('click');
        await flushPromises();
        expect(find('sync-empty')?.textContent).toBe('No Data Syncs where you can add features. Subscribe to one first.');
        expect((find('picker-confirm') as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows a failure to load the list', async () => {
        missions.list.mockRejectedValue(new Error('db closed'));
        const w = await mountShare();
        await w.get('[data-test=add-to-sync]').trigger('click');
        await flushPromises();
        expect(find('sync-error')?.textContent).toContain('ErrorCould not load Data Syncs. db closed');
    });
});

describe('Create data package', () => {
    it('proposes a name from the mode and run time, and requires one', async () => {
        const w = await mountShare();
        await w.get('[data-test=create-package]').trigger('click');
        await flushPromises();
        const name = find('package-name') as HTMLInputElement;
        expect(name.value).toBe('SAR Travel Time 2026-03-01 12.00');
        expect(document.body.textContent).toContain('private to you');
        name.value = '  ';
        name.dispatchEvent(new Event('input'));
        await nextTick();
        expect((find('package-confirm') as HTMLButtonElement).disabled).toBe(true);
        expect(name.getAttribute('aria-invalid')).toBe('true');
    });

    it('creates the package with the name and no Data Sync by default', async () => {
        const w = await mountShare();
        await w.get('[data-test=create-package]').trigger('click');
        await flushPromises();
        (find('package-confirm') as HTMLButtonElement).click();
        await flushPromises();
        expect(spies.createPackage).toHaveBeenCalledWith({ name: 'SAR Travel Time 2026-03-01 12.00', missions: [] });
        expect(find('package-title')).toBeNull();
    });

    it('can also file the package in chosen Data Syncs', async () => {
        const w = await mountShare();
        await w.get('[data-test=create-package]').trigger('click');
        await flushPromises();
        const name = find('package-name') as HTMLInputElement;
        name.value = 'My package';
        name.dispatchEvent(new Event('input'));
        all('sync')[1].click();
        await nextTick();
        (find('package-confirm') as HTMLButtonElement).click();
        await flushPromises();
        expect(spies.createPackage).toHaveBeenCalledWith({ name: 'My package', missions: [SYNCS[1]] });
    });

    it('cancel closes the modal', async () => {
        const w = await mountShare();
        await w.get('[data-test=create-package]').trigger('click');
        await flushPromises();
        (find('package-cancel') as HTMLElement).click();
        await nextTick();
        expect(find('package-title')).toBeNull();
        expect(spies.createPackage).not.toHaveBeenCalled();
    });
});

describe('SarPane share section', () => {
    it('appears under the result in the pane', async () => {
        wrapper = mount(SarPane, { attachTo: document.body });
        expect(wrapper.find('[data-test=share]').exists()).toBe(false);
        finishRun(result, meta, ['a']);
        await nextTick();
        expect(wrapper.find('[data-test=result]').exists()).toBe(true);
        expect(wrapper.find('[data-test=share]').exists()).toBe(true);
    });

    it('cancels a pick that was left pending when the pane opens', () => {
        session.picking = true;
        wrapper = mount(SarPane, { attachTo: document.body });
        expect(spies.pick).toHaveBeenCalledTimes(1);
    });
});
