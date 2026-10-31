<template>
    <fieldset
        class='mb-3'
        :disabled='running'
        data-test='mode'
    >
        <legend class='form-label fs-4 mb-1'>
            Analysis mode
        </legend>
        <div
            role='radiogroup'
            aria-label='Analysis mode'
            class='d-flex flex-column gap-2'
        >
            <div
                class='form-check border rounded p-2 ps-5 mb-0'
                style='min-height: 44px;'
            >
                <input
                    id='sar-mode-travel-time'
                    type='radio'
                    name='sar-mode'
                    class='form-check-input'
                    value='travel-time'
                    :checked='form.mode === "travel-time"'
                    aria-describedby='sar-mode-travel-time-desc'
                    data-test='mode-travel-time'
                    @change='setMode("travel-time")'
                >
                <label
                    class='form-check-label fw-bold d-block'
                    for='sar-mode-travel-time'
                    v-text='MODE_NAME_TRAVEL_TIME'
                />
                <span
                    id='sar-mode-travel-time-desc'
                    class='small text-secondary d-block'
                    v-text='MODE_DESC_TRAVEL_TIME'
                />
            </div>
            <div
                class='form-check border rounded p-2 ps-5 mb-0'
                style='min-height: 44px;'
            >
                <input
                    id='sar-mode-tarr'
                    type='radio'
                    name='sar-mode'
                    class='form-check-input'
                    value='tarr'
                    :checked='form.mode === "tarr"'
                    :disabled='!session.tarrAvailable'
                    aria-describedby='sar-mode-tarr-desc'
                    data-test='mode-tarr'
                    @change='setMode("tarr")'
                >
                <label
                    class='form-check-label fw-bold d-block'
                    for='sar-mode-tarr'
                    v-text='MODE_NAME_TARR'
                />
                <span
                    id='sar-mode-tarr-desc'
                    class='small text-secondary d-block'
                    data-test='mode-tarr-desc'
                    v-text='session.tarrAvailable ? MODE_DESC_TARR : `${MODE_DESC_TARR} ${TARR_UNAVAILABLE}.`'
                />
            </div>
        </div>
    </fieldset>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { MODE_DESC_TARR, MODE_DESC_TRAVEL_TIME, MODE_NAME_TARR, MODE_NAME_TRAVEL_TIME, TARR_UNAVAILABLE } from './copy.ts';
import { form, session, setMode } from './state.ts';
const running = computed(() => session.run === 'running');
</script>
