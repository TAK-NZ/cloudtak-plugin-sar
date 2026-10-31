<template>
    <Section
        v-if='result'
        id='result'
        label='Result'
        :icon='IconListDetails'
        tag='div'
        data-test='result'
    >
        <template v-if='result.mode === "tarr"'>
            <p
                class='mb-0'
                data-test='summary'
            >
                Subject profile <span v-text='subject' />.
                <span v-if='result.parameters.radiusKm !== null'>Analysis radius {{ formatKm(result.parameters.radiusKm) }} km.</span>
            </p>
            <ul
                class='list-unstyled mb-0'
                aria-label='Rings drawn'
                data-test='bands'
            >
                <li
                    v-for='(ring, i) in rings'
                    :key='i'
                    class='d-flex align-items-center gap-2 mb-1'
                    data-test='result-band'
                >
                    <span
                        class='d-inline-block flex-shrink-0 rounded'
                        style='width: 16px; height: 16px;'
                        :style='{ border: `2px ${ring.dashed ? "dashed" : "solid"} ${ring.color}`, backgroundColor: ring.dashed ? "transparent" : ring.color }'
                        aria-hidden='true'
                        data-test='swatch'
                    />
                    <span v-text='ring.text' />
                </li>
            </ul>
            <p
                v-if='rings.length === 0'
                class='mb-0'
                data-test='no-bands'
            >
                No rings were drawn.
            </p>
            <p
                class='fw-bold mb-0'
                data-test='tarr-not-calibrated'
                v-text='TARR_NOT_CALIBRATED'
            />
        </template>
        <template v-else>
            <p
                class='mb-0'
                data-test='summary'
            >
                <span v-if='result.parameters.radius_km !== null'>Effective radius {{ formatKm(result.parameters.radius_km) }} km. </span>
                <span v-if='result.parameters.speed_kmh !== null'>Speed {{ result.parameters.speed_kmh }} km/h.</span>
            </p>
            <ul
                class='list-unstyled mb-0'
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
                        class='d-inline-block flex-shrink-0 rounded'
                        style='width: 16px; height: 16px;'
                        :style='{ border: `2px solid ${band.color}`, backgroundColor: band.color }'
                        aria-hidden='true'
                        data-test='swatch'
                    />
                    <span v-text='band.text' />
                </li>
            </ul>
            <p
                v-if='bands.length === 0'
                class='mb-0'
                data-test='no-bands'
            >
                No contours were drawn.
            </p>
        </template>
        <div
            v-if='result.warnings.length'
            class='d-flex flex-column gap-2'
            role='group'
            aria-label='Warnings'
            data-test='warnings'
        >
            <TablerInlineAlert
                v-for='(w, i) in result.warnings'
                :key='i'
                :severity='w.severity === "warning" ? "warning" : "info"'
                :title='w.severity === "warning" ? "Warning" : "Note"'
                :description='w.message'
                data-test='warning'
            />
        </div>
        <p
            v-if='result.disclaimer'
            class='mb-0'
            data-test='disclaimer'
            v-text='result.disclaimer'
        />
        <InfoBox
            id='result-details'
            label='Details and data sources'
            :icon='IconInfoCircle'
        >
            <template v-if='result.mode === "tarr"'>
                <p
                    v-if='result.parameters.koesterKm'
                    class='mb-1'
                    data-test='koester-km'
                >
                    Koester distances: {{ triple(result.parameters.koesterKm, 'km') }}
                </p>
                <p
                    v-if='result.parameters.calibratedKm'
                    class='mb-1'
                    data-test='calibrated-km'
                >
                    Calibrated distances used: {{ triple(result.parameters.calibratedKm, 'km') }}
                </p>
                <p
                    v-if='multiplier || result.calibration?.region'
                    class='mb-1'
                    data-test='multiplier'
                >
                    <span v-if='multiplier'>Multiplier used: <span v-text='multiplier' />. </span>
                    <span v-if='result.calibration?.region'>Fitted to <span v-text='result.calibration.region' />.</span>
                </p>
                <p
                    v-if='result.calibration?.note'
                    class='mb-1'
                    data-test='calibration-note'
                    v-text='result.calibration.note'
                />
                <p
                    class='mb-1'
                    data-test='tarr-percent-notice'
                    v-text='TARR_NOTICE_PERCENT'
                />
                <p
                    v-if='hasPlain'
                    class='mb-0'
                    data-test='tarr-legend'
                    v-text='TARR_NOTICE_LEGEND'
                />
            </template>
            <ul
                v-if='result.attribution.length'
                class='text-secondary mb-0'
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
                class='text-secondary mb-0'
                data-test='built'
            >
                Roads and trails data from {{ built }}
            </p>
        </InfoBox>
    </Section>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { IconInfoCircle, IconListDetails } from '@tabler/icons-vue';
import { TablerInlineAlert } from '@tak-ps/vue-tabler';
import Section from './Section.vue';
import InfoBox from './InfoBox.vue';
import { TARR_NOT_CALIBRATED, TARR_NOTICE_LEGEND, TARR_NOTICE_PERCENT } from './copy.ts';
import { ringName } from './features.ts';
import { formatBuilt, formatHours, formatKm } from './format.ts';
import { session } from './state.ts';
import type { Triple } from './types.ts';

const result = computed(() => session.result);
// Smallest band first, as the list reads left to right in time.
const bands = computed(() => {
    const r = result.value;
    if (r?.mode !== 'travel-time') return [];
    return [...r.contours]
        .sort((a, b) => a.properties.hours - b.properties.hours)
        .map((f) => ({ text: formatHours(f.properties.hours), color: f.properties.color }));
});
// Smallest percentage first; the terrain ring before its plain circle.
const rings = computed(() => {
    const r = result.value;
    if (r?.mode !== 'tarr') return [];
    return [...r.rings]
        .sort((a, b) => a.percent - b.percent || (a.kind === b.kind ? 0 : a.kind === 'terrain' ? -1 : 1))
        .map((f) => ({ text: ringName(f), color: f.color, dashed: f.kind === 'plain' }));
});
const hasPlain = computed(() => rings.value.some((r) => r.dashed));
const subject = computed(() => {
    const r = result.value;
    if (r?.mode !== 'tarr') return '';
    const where = [r.parameters.ecoregion, r.parameters.terrain].filter((v): v is string => v !== null && v !== '');
    return `${r.parameters.profile}${where.length ? ` (${where.join(', ')})` : ''}`;
});
const triple = (t: Triple, unit: string): string => `25%: ${t.p25} ${unit}, 50%: ${t.p50} ${unit}, 75%: ${t.p75} ${unit}`;
// One value when the three bands share a multiplier, otherwise all three.
const multiplier = computed(() => {
    const r = result.value;
    const m = r?.mode === 'tarr' ? r.calibration?.multiplier : null;
    if (!m) return '';
    return m.p25 === m.p50 && m.p50 === m.p75 ? `x${m.p25}` : `25%: x${m.p25}, 50%: x${m.p50}, 75%: x${m.p75}`;
});
const built = computed(() => formatBuilt(result.value?.osmBuiltAt));
</script>
