<template>
    <div
        role='group'
        aria-label='Speed presets'
        class='d-flex flex-wrap gap-2 mb-2'
        data-test='speed-presets'
    >
        <button
            v-for='preset in SPEED_PRESETS'
            :key='preset.kmh'
            type='button'
            class='btn btn-sm'
            :class='isActive(preset.kmh) ? "btn-primary" : "btn-outline-secondary"'
            style='min-height: 44px; min-width: 44px;'
            :aria-pressed='isActive(preset.kmh) ? "true" : "false"'
            :disabled='disabled'
            data-test='speed-preset'
            @click='setSpeed(preset.kmh)'
        >
            <span class='d-block'>{{ preset.kmh.toFixed(1) }} km/h</span>{{ ' ' }}
            <span
                class='d-block small'
                v-text='preset.label'
            />
        </button>
    </div>
</template>
<script setup lang='ts'>
import { SPEED_PRESETS } from './constants.ts';
import { form, setSpeed } from './state.ts';
import { parseNumber } from './validation.ts';
defineProps<{ disabled?: boolean }>();
const isActive = (kmh: number): boolean => parseNumber(form.speed) === kmh;
</script>
