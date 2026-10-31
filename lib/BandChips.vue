<template>
    <div data-test='bands'>
        <label
            class='form-label mb-1'
            for='sar-band-add'
        >Time bands (hours)</label>
        <ul
            class='list-unstyled d-flex flex-wrap gap-2 mb-2'
            aria-label='Time bands'
            data-test='band-list'
        >
            <li
                v-for='hours in form.bands'
                :key='hours'
                class='d-inline-flex align-items-center border rounded ps-2'
                style='min-height: 44px;'
                data-test='band'
            >
                <span v-text='formatHours(hours)' />
                <button
                    type='button'
                    class='btn btn-icon p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0'
                    style='width: 44px; height: 44px;'
                    :aria-label='`Remove ${formatHours(hours)} band`'
                    :disabled='disabled'
                    data-test='band-remove'
                    @click='removeBand(hours)'
                >
                    <IconX
                        :size='18'
                        stroke='1.5'
                        aria-hidden='true'
                    />
                </button>
            </li>
        </ul>
        <div
            v-if='quick.length'
            class='d-flex flex-wrap gap-2 mb-2'
            role='group'
            aria-label='Quick add'
            data-test='quick-bands'
        >
            <button
                v-for='hours in quick'
                :key='hours'
                type='button'
                class='btn btn-sm btn-outline-secondary'
                style='min-height: 44px; min-width: 44px;'
                :disabled='disabled || form.bands.length >= BANDS_MAX'
                data-test='band-quick'
                @click='addQuick(hours)'
            >
                Add {{ formatHours(hours) }}
            </button>
        </div>
        <div class='d-flex gap-2'>
            <input
                id='sar-band-add'
                v-model='text'
                type='text'
                inputmode='decimal'
                autocomplete='off'
                class='form-control'
                style='font-size: 16px; min-height: 44px; min-width: 0;'
                :disabled='disabled'
                :aria-invalid='addError ? "true" : undefined'
                :aria-describedby='addError ? "sar-band-error" : "sar-band-help"'
                data-test='band-input'
                @keydown.enter.prevent='add'
            >
            <button
                type='button'
                class='btn btn-outline-secondary flex-shrink-0'
                style='min-height: 44px; min-width: 44px;'
                :disabled='disabled'
                data-test='band-add'
                @click='add'
            >
                Add band
            </button>
        </div>
        <div
            id='sar-band-help'
            class='form-hint small text-secondary mt-1'
        >
            1 to 8 bands, each 0.25 to 24 h. <span v-text='HINT_BANDS' />
        </div>
        <div
            v-if='addError'
            id='sar-band-error'
            class='small mt-1 text-danger'
            data-test='band-add-error'
        >
            <span class='fw-bold'>Error:</span> <span v-text='addError' />
        </div>
    </div>
</template>
<script setup lang='ts'>
import { computed, ref, watch } from 'vue';
import { IconX } from '@tabler/icons-vue';
import { BANDS_MAX, QUICK_BANDS } from './constants.ts';
import { HINT_BANDS } from './copy.ts';
import { formatHours } from './format.ts';
import { addBand, addQuickBand, form, removeBand } from './state.ts';

defineProps<{ disabled?: boolean }>();

const text = ref('');
const addError = ref('');
const quick = computed(() => QUICK_BANDS.filter((h) => !form.bands.includes(h)));
function addQuick(hours: number): void {
    addError.value = addQuickBand(hours) ?? '';
}

watch(text, () => {
    addError.value = '';
});

function add(): void {
    if (text.value.trim() === '') {
        addError.value = 'Enter a time band between 0.25 and 24 h.';
        return;
    }
    const error = addBand(text.value);
    addError.value = error ?? '';
    if (!error) text.value = '';
}
</script>
