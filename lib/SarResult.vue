<template>
    <section
        v-if='result'
        aria-label='Result'
        data-test='result'
    >
        <h3 class='h4'>
            Result
        </h3>
        <p
            class='mb-2'
            data-test='summary'
        >
            <span v-if='result.parameters.radius_km !== null'>Effective radius {{ formatKm(result.parameters.radius_km) }} km. </span>
            <span v-if='result.parameters.speed_kmh !== null'>Speed {{ result.parameters.speed_kmh }} km/h.</span>
        </p>
        <ul
            class='list-unstyled mb-2'
            aria-label='Time bands drawn'
            data-test='bands'
        >
            <li
                v-for='(band, i) in bands'
                :key='i'
                class='d-flex align-items-center gap-2 mb-1'
                data-test='result-band'
            >
                <span
                    class='d-inline-block flex-shrink-0 rounded border'
                    style='width: 16px; height: 16px;'
                    :style='{ backgroundColor: band.color }'
                    aria-hidden='true'
                    data-test='swatch'
                />
                <span v-text='band.text' />
            </li>
        </ul>
        <p
            v-if='bands.length === 0'
            class='mb-2'
            data-test='no-bands'
        >
            No contours were drawn.
        </p>
        <ul
            v-if='result.warnings.length'
            class='list-unstyled mb-2'
            aria-label='Warnings'
            data-test='warnings'
        >
            <li
                v-for='(w, i) in result.warnings'
                :key='i'
                class='mb-1'
                data-test='warning'
            >
                <span class='fw-bold'>{{ w.severity === 'warning' ? 'Warning:' : 'Note:' }}</span> <span v-text='w.message' />
            </li>
        </ul>
        <p
            v-if='result.disclaimer'
            class='mb-2'
            data-test='disclaimer'
            v-text='result.disclaimer'
        />
        <ul
            v-if='result.attribution.length'
            class='small text-secondary mb-2'
            aria-label='Data attribution'
            data-test='attribution'
        >
            <li
                v-for='(line, i) in result.attribution'
                :key='i'
                v-text='line'
            />
        </ul>
        <p
            v-if='built'
            class='small text-secondary mb-0'
            data-test='built'
        >
            Roads and trails data from {{ built }}
        </p>
    </section>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { formatBuilt, formatHours, formatKm } from './format.ts';
import { session } from './state.ts';

const result = computed(() => session.result);
// Smallest band first, as the list reads left to right in time.
const bands = computed(() => [...(result.value?.contours ?? [])]
    .sort((a, b) => a.properties.hours - b.properties.hours)
    .map((f) => ({ text: formatHours(f.properties.hours), color: f.properties.color })));
const built = computed(() => formatBuilt(result.value?.osmBuiltAt));
</script>
