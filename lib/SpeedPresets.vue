<template>
    <div
        role='group'
        aria-label='Speed presets'
        class='row g-2 mb-2'
        data-test='speed-presets'
    >
        <div
            v-for='preset in SPEED_PRESETS'
            :key='preset.kmh'
            class='col-6'
        >
            <button
                type='button'
                class='btn w-100 d-flex flex-column align-items-center justify-content-center py-2'
                :class='isActive(preset.kmh) ? "btn-primary" : "btn-outline-secondary"'
                style='min-height: 56px;'
                :aria-pressed='isActive(preset.kmh) ? "true" : "false"'
                :disabled='disabled'
                data-test='speed-preset'
                @click='setSpeed(preset.kmh)'
            >
                <span
                    class='fw-bold'
                    v-text='preset.label'
                />{{ ' ' }}
                <span class='small'>{{ preset.kmh.toFixed(1) }} km/h</span>
            </button>
        </div>
    </div>
</template>
<script setup lang='ts'>
import { SPEED_PRESETS } from './constants.ts';
import { form, setSpeed } from './state.ts';
import { parseNumber } from './validation.ts';
defineProps<{ disabled?: boolean }>();
const isActive = (kmh: number): boolean => parseNumber(form.speed) === kmh;
</script>
