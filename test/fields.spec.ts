import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { IconMapPin } from '@tabler/icons-vue';
import FieldInput from '../lib/FieldInput.vue';
import Section from '../lib/Section.vue';
import { resetAll, ui } from '../lib/state.ts';
let wrapper: VueWrapper | undefined;
beforeEach(() => {
    resetAll();
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});
describe('FieldInput', () => {
    const mountField = (props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}): VueWrapper => {
        wrapper = mount(FieldInput, { props: { id: 'f', label: 'Speed (km/h)', modelValue: '2.5', ...props }, attrs });
        return wrapper;
    };
    it('points the label at the input and keeps inputmode, size and the data-test on the input', () => {
        const w = mountField({}, { 'data-test': 'speed', class: 'mb-3' });
        expect(w.get('label[for=f]').text()).toBe('Speed (km/h)');
        const input = w.get('input#f');
        expect(input.attributes('data-test')).toBe('speed');
        expect(input.attributes('inputmode')).toBe('decimal');
        expect(input.attributes('autocomplete')).toBe('off');
        expect(input.attributes('style')).toContain('font-size: 16px');
        expect(input.classes()).not.toContain('mb-3');
        expect(w.classes()).toContain('mb-3');
    });
    it('emits the typed text, and submit on Enter', async () => {
        const w = mountField();
        await w.get('input').setValue('3');
        expect(w.emitted('update:modelValue')).toEqual([['3']]);
        await w.get('input').trigger('keydown.enter');
        expect(w.emitted('submit')).toHaveLength(1);
    });
    it('describes the input by its hint, and by its error when there is one', async () => {
        const w = mountField({ hint: 'On flat ground.', hintTest: 'h' });
        expect(w.get('#f-help').text()).toBe('On flat ground.');
        expect(w.get('input').attributes('aria-describedby')).toBe('f-help');
        expect(w.get('input').attributes('aria-invalid')).toBeUndefined();
        await w.setProps({ error: 'Enter a number.', errorTest: 'e' });
        expect(w.get('input').attributes('aria-describedby')).toBe('f-help f-error');
        expect(w.get('input').attributes('aria-invalid')).toBe('true');
        expect(w.get('input').classes()).toContain('is-invalid');
        expect(w.get('[data-test=e]').text()).toBe('Error: Enter a number.');
        expect(w.find('.sar-field-error-end').exists()).toBe(true);
    });
    it('can be disabled', () => {
        expect((mountField({ disabled: true }).get('input').element as HTMLInputElement).disabled).toBe(true);
    });
});
describe('Section', () => {
    const mountSection = (props: Record<string, unknown> = {}): VueWrapper => {
        wrapper = mount(Section, {
            props: { id: 's', label: 'Start point', icon: IconMapPin, ...props },
            attrs: { 'data-test': 'body' },
            slots: { default: () => h('input', { 'data-test': 'inner' }) },
        });
        return wrapper;
    };
    it('is open by default, as a fieldset with a hidden legend', () => {
        const w = mountSection();
        expect(w.get('.slidedown__header').text()).toBe('Start point');
        const body = w.get('[data-test=body]');
        expect(body.element.tagName).toBe('FIELDSET');
        expect(body.get('legend').classes()).toContain('visually-hidden');
        expect(body.attributes('inert')).toBeUndefined();
    });
    it('makes the body inert when closed, and remembers the choice', async () => {
        const w = mountSection();
        await w.get('.slidedown__header').trigger('click');
        expect(ui.sections.s).toBe(false);
        expect(w.get('[data-test=body]').attributes('inert')).toBeDefined();
        expect(w.find('[data-test=inner]').exists()).toBe(true);
        await w.get('.slidedown__header').trigger('click');
        expect(ui.sections.s).toBe(true);
    });
    it('disables a fieldset body as a group', async () => {
        const w = mountSection({ disabled: true });
        await nextTick();
        expect(w.get('[data-test=body]').attributes('disabled')).toBeDefined();
    });
    it('renders read-only content as a labelled region', () => {
        const w = mountSection({ tag: 'div' });
        const body = w.get('[data-test=body]');
        expect(body.element.tagName).toBe('DIV');
        expect(body.attributes('role')).toBe('region');
        expect(body.attributes('aria-label')).toBe('Start point');
        expect(body.find('legend').exists()).toBe(false);
    });
    it('keeps a closed default closed', () => {
        const w = mountSection({ defaultOpen: false });
        expect(w.get('[data-test=body]').attributes('inert')).toBeDefined();
    });
});
