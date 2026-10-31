<template>
    <div data-test='bands'>
        <div class='d-block px-2 my-1 user-select-none'>
            Time bands (hours)
        </div>
        <ul
            class='list-unstyled d-flex flex-wrap gap-2 mb-3'
            aria-label='Time bands'
            data-test='band-list'
        >
            <li
                v-for='hours in form.bands'
                :key='hours'
                class='d-inline-flex align-items-center border rounded-pill ps-3'
                style='min-height: 44px;'
                data-test='band'
            >
                <span
                    class='fw-bold me-2'
                    v-text='formatHours(hours)'
                />
                <button
                    type='button'
                    class='btn btn-icon btn-ghost-danger rounded-circle p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0'
                    style='width: 44px; height: 44px;'
                    :aria-label='`Remove ${formatHours(hours)} band`'
                    :disabled='disabled'
                    data-test='band-remove'
                    @click='removeBand(hours)'
                >
                    <IconX
                        :size='20'
                        stroke='2'
                        class='text-danger'
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
        <FieldInput
            id='sar-band-add'
            v-model='text'
            label='Add a band (hours)'
            :disabled='disabled'
            hint='1 to 8 bands, each 0.25 to 24 h.'
            hint-id='sar-band-help'
            :error='addError'
            error-id='sar-band-error'
            error-test='band-add-error'
            data-test='band-input'
            @submit='add'
        >
            <template #append>
                <TablerButton
                    type='button'
                    class='btn-outline-primary flex-shrink-0 d-inline-flex align-items-center'
                    style='min-height: 44px; min-width: 44px;'
                    :disabled='disabled'
                    data-test='band-add'
                    @click='add'
                >
                    <IconPlus
                        :size='20'
                        stroke='1'
                        class='me-1'
                        aria-hidden='true'
                    />
                    Add band
                </TablerButton>
            </template>
        </FieldInput>
    </div>
</template>
<script setup lang='ts'>
import { computed, ref, watch } from 'vue';
import { IconPlus, IconX } from '@tabler/icons-vue';
import { TablerButton } from '@tak-ps/vue-tabler';
import FieldInput from './FieldInput.vue';
import { BANDS_MAX, QUICK_BANDS } from './constants.ts';
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
