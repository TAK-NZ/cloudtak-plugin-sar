<template>
    <fieldset
        class='mb-3 px-2'
        :disabled='running'
        data-test='mode'
    >
        <legend class='form-label mb-1'>
            Analysis mode
        </legend>
        <TablerPillGroup
            :model-value='form.mode'
            :options='options'
            :rounded='false'
            size='default'
            padding=''
            name='sar-mode'
            :disabled='running'
            data-test='mode-pills'
            @update:model-value='setMode($event as Mode)'
        />
        <p
            id='sar-mode-desc'
            class='small text-secondary mb-0 mt-2'
            data-test='mode-desc'
            v-text='description'
        />
    </fieldset>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { TablerPillGroup } from '@tak-ps/vue-tabler';
import { MODE_DESC_TARR, MODE_DESC_TRAVEL_TIME, MODE_NAME_TARR, MODE_NAME_TRAVEL_TIME, TARR_UNAVAILABLE } from './copy.ts';
import { form, session, setMode } from './state.ts';
import type { Mode } from './types.ts';
const running = computed(() => session.run === 'running');
// TARR stays in the list when the server cannot do it, greyed out, with the reason in the text below.
const options = computed(() => [
    { value: 'travel-time', label: MODE_NAME_TRAVEL_TIME },
    { value: 'tarr', label: MODE_NAME_TARR, disabled: !session.tarrAvailable },
]);
const description = computed(() => {
    if (form.mode === 'tarr') return MODE_DESC_TARR;
    return session.tarrAvailable ? MODE_DESC_TRAVEL_TIME : `${MODE_DESC_TRAVEL_TIME} TARR: ${TARR_UNAVAILABLE.toLowerCase()}.`;
});
</script>
