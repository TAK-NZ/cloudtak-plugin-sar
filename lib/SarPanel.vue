<template>
    <div
        class='position-relative'
        style='width: min(640px, calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); height: 50px;'
        data-test='sar-bar'
    >
        <div
            class='position-absolute cloudtak-panel px-2 pb-2 d-flex flex-column taknz-sar-panel'
            style='
                left: -9px;
                right: -9px;
                bottom: -1px;
                max-height: min(60vh, calc(100vh - 220px));
                max-height: min(60dvh, calc(100dvh - 220px));
                overflow-y: auto;
                overflow-x: hidden;
            '
            role='region'
            aria-label='Travel time'
            data-test='card'
        >
            <div class='d-flex align-items-center gap-2 pt-2'>
                <h2
                    ref='heading'
                    tabindex='-1'
                    class='h3 m-0 flex-grow-1'
                    data-test='heading'
                >
                    Travel time
                </h2>
                <button
                    type='button'
                    class='btn btn-icon p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0'
                    style='width: 44px; height: 44px;'
                    aria-label='Close travel time panel'
                    title='Close'
                    data-test='close'
                    @click='controller.close()'
                >
                    <IconX
                        :size='24'
                        stroke='1.5'
                        aria-hidden='true'
                    />
                </button>
            </div>
            <div
                class='visually-hidden'
                role='status'
                aria-live='polite'
                aria-atomic='true'
                data-test='live'
                v-text='session.announcement'
            />
            <div class='taknz-sar-grid'>
                <fieldset
                    class='taknz-sar-col'
                    :disabled='running'
                    data-test='ipp'
                >
                    <legend class='form-label fs-4 mb-1'>
                        Start point
                    </legend>
                    <div class='d-flex flex-wrap gap-2 mb-2'>
                        <button
                            type='button'
                            class='btn d-inline-flex align-items-center gap-1'
                            :class='session.picking ? "btn-primary" : "btn-outline-secondary"'
                            style='min-height: 44px; min-width: 44px;'
                            :aria-pressed='session.picking ? "true" : "false"'
                            data-test='pick'
                            @click='controller.pick()'
                        >
                            <IconCrosshair
                                :size='20'
                                stroke='1.5'
                                aria-hidden='true'
                            />
                            <span>Pick on map</span>
                        </button>
                        <button
                            type='button'
                            class='btn d-inline-flex align-items-center gap-1'
                            :class='session.markerOpen ? "btn-primary" : "btn-outline-secondary"'
                            style='min-height: 44px; min-width: 44px;'
                            :aria-expanded='session.markerOpen ? "true" : "false"'
                            data-test='choose-marker'
                            @click='toggleMarkers()'
                        >
                            <IconMapPin
                                :size='20'
                                stroke='1.5'
                                aria-hidden='true'
                            />
                            <span>Choose a marker</span>
                        </button>
                    </div>
                    <div
                        v-if='session.picking'
                        class='d-flex align-items-center gap-2 border rounded p-2 mb-2'
                        data-test='pick-banner'
                    >
                        <span class='flex-grow-1'>Tap the map to set the start point</span>
                        <button
                            type='button'
                            class='btn btn-outline-secondary'
                            style='min-height: 44px; min-width: 44px;'
                            data-test='pick-cancel'
                            @click='controller.pick()'
                        >
                            Cancel
                        </button>
                    </div>
                    <MarkerPicker
                        v-if='session.markerOpen'
                        class='mb-2'
                    />
                    <div class='row g-2'>
                        <div class='col-6'>
                            <label
                                class='form-label mb-1'
                                for='sar-lat'
                            >Latitude</label>
                            <input
                                id='sar-lat'
                                v-model='form.lat'
                                type='text'
                                inputmode='decimal'
                                autocomplete='off'
                                class='form-control'
                                style='font-size: 16px; min-height: 44px; min-width: 0;'
                                :aria-invalid='latError ? "true" : undefined'
                                :aria-describedby='latError ? "sar-lat-error" : undefined'
                                data-test='lat'
                            >
                        </div>
                        <div class='col-6'>
                            <label
                                class='form-label mb-1'
                                for='sar-lng'
                            >Longitude</label>
                            <input
                                id='sar-lng'
                                v-model='form.lng'
                                type='text'
                                inputmode='decimal'
                                autocomplete='off'
                                class='form-control'
                                style='font-size: 16px; min-height: 44px; min-width: 0;'
                                :aria-invalid='lngError ? "true" : undefined'
                                :aria-describedby='lngError ? "sar-lng-error" : undefined'
                                data-test='lng'
                            >
                        </div>
                    </div>
                    <div
                        v-if='latError'
                        id='sar-lat-error'
                        class='small mt-1 text-danger'
                        data-test='lat-error'
                    >
                        <span class='fw-bold'>Error:</span> <span v-text='latError' />
                    </div>
                    <div
                        v-if='lngError'
                        id='sar-lng-error'
                        class='small mt-1 text-danger'
                        data-test='lng-error'
                    >
                        <span class='fw-bold'>Error:</span> <span v-text='lngError' />
                    </div>
                </fieldset>
                <fieldset
                    class='taknz-sar-col'
                    :disabled='running'
                    data-test='settings'
                >
                    <legend class='visually-hidden'>
                        Travel settings
                    </legend>
                    <div class='mb-2'>
                        <label
                            class='form-label mb-1'
                            for='sar-speed'
                        >Speed</label>
                        <div class='input-group'>
                            <input
                                id='sar-speed'
                                v-model='form.speed'
                                type='text'
                                inputmode='decimal'
                                autocomplete='off'
                                class='form-control'
                                style='font-size: 16px; min-height: 44px; min-width: 0;'
                                :aria-invalid='speedError ? "true" : undefined'
                                :aria-describedby='speedError ? "sar-speed-error" : undefined'
                                data-test='speed'
                            >
                            <span class='input-group-text'>km/h</span>
                        </div>
                        <div
                            v-if='speedError'
                            id='sar-speed-error'
                            class='small mt-1 text-danger'
                            data-test='speed-error'
                        >
                            <span class='fw-bold'>Error:</span> <span v-text='speedError' />
                        </div>
                    </div>
                    <BandChips
                        class='mb-2'
                        :disabled='running'
                    />
                    <div
                        v-if='bandsError'
                        class='small mb-2 text-danger'
                        data-test='bands-error'
                    >
                        <span class='fw-bold'>Error:</span> <span v-text='bandsError' />
                    </div>
                    <div>
                        <label
                            class='form-label mb-1'
                            for='sar-radius'
                        >Radius (optional)</label>
                        <div class='input-group'>
                            <input
                                id='sar-radius'
                                v-model='form.radius'
                                type='text'
                                inputmode='decimal'
                                autocomplete='off'
                                class='form-control'
                                style='font-size: 16px; min-height: 44px; min-width: 0;'
                                :aria-invalid='radiusError ? "true" : undefined'
                                :aria-describedby='radiusError ? "sar-radius-help sar-radius-error" : "sar-radius-help"'
                                data-test='radius'
                            >
                            <span class='input-group-text'>km</span>
                        </div>
                        <div
                            id='sar-radius-help'
                            class='form-hint small text-secondary mt-1'
                        >
                            1 to 30 km. Larger radii take longer. In cities, large radii are slow.
                        </div>
                        <div
                            v-if='radiusError'
                            id='sar-radius-error'
                            class='small mt-1 text-danger'
                            data-test='radius-error'
                        >
                            <span class='fw-bold'>Error:</span> <span v-text='radiusError' />
                        </div>
                    </div>
                </fieldset>
                <div class='taknz-sar-wide'>
                    <div class='d-flex flex-wrap align-items-center gap-2'>
                        <button
                            v-if='!running'
                            type='button'
                            class='btn btn-primary d-inline-flex align-items-center gap-1'
                            style='min-height: 44px; min-width: 44px;'
                            :disabled='!check.ok'
                            :aria-describedby='needsStart ? "sar-run-hint" : undefined'
                            data-test='run'
                            @click='controller.run()'
                        >
                            <IconPlayerPlay
                                :size='20'
                                stroke='1.5'
                                aria-hidden='true'
                            />
                            <span>Run</span>
                        </button>
                        <button
                            v-else
                            type='button'
                            class='btn btn-outline-secondary'
                            style='min-height: 44px; min-width: 44px;'
                            data-test='cancel'
                            @click='controller.cancel()'
                        >
                            Cancel
                        </button>
                        <button
                            type='button'
                            class='btn btn-outline-secondary'
                            style='min-height: 44px; min-width: 44px;'
                            :disabled='running || !canClear'
                            data-test='clear'
                            @click='controller.clear()'
                        >
                            Clear
                        </button>
                        <span
                            v-if='needsStart && !running'
                            id='sar-run-hint'
                            class='small text-secondary'
                            data-test='run-hint'
                        >Set the start point to run.</span>
                    </div>
                    <div
                        v-if='running'
                        class='mt-2'
                        data-test='progress'
                    >
                        <div class='d-flex align-items-center gap-2'>
                            <span
                                class='spinner-border spinner-border-sm'
                                aria-hidden='true'
                            />
                            <span data-test='elapsed'>Working... {{ formatElapsed(session.elapsed) }}</span>
                        </div>
                        <p class='small text-secondary mb-0 mt-1'>
                            This can take up to a minute, especially the first time.
                        </p>
                    </div>
                    <div
                        v-if='session.error && !running'
                        ref='errorBox'
                        tabindex='-1'
                        class='border border-danger rounded p-2 mt-2'
                        data-test='error'
                    >
                        <p class='mb-2'>
                            <span
                                class='fw-bold'
                                data-test='error-label'
                            >Error: </span><span
                                data-test='error-message'
                                v-text='errorText'
                            />
                        </p>
                        <div class='d-flex flex-wrap gap-2'>
                            <button
                                v-for='button in suggestions'
                                :key='button.kind'
                                type='button'
                                class='btn btn-primary'
                                style='min-height: 44px; min-width: 44px;'
                                :aria-describedby='button.alsoRadiusKm !== undefined ? "sar-suggest-both" : undefined'
                                :data-test='`suggest-${button.kind}`'
                                @click='applySuggestion(button)'
                                v-text='button.label'
                            />
                            <button
                                v-if='retryable'
                                type='button'
                                class='btn btn-outline-secondary'
                                style='min-height: 44px; min-width: 44px;'
                                data-test='retry'
                                @click='controller.run()'
                            >
                                Retry
                            </button>
                        </div>
                        <span
                            v-for='button in suggestions.filter((b) => b.alsoRadiusKm !== undefined)'
                            id='sar-suggest-both'
                            :key='button.kind'
                            class='visually-hidden'
                        >Also sets the radius to {{ formatKm(button.alsoRadiusKm as number) }} km.</span>
                    </div>
                    <SarResult class='mt-3' />
                </div>
            </div>
        </div>
    </div>
</template>
<script setup lang='ts'>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { IconCrosshair, IconMapPin, IconPlayerPlay, IconX } from '@tabler/icons-vue';
import BandChips from './BandChips.vue';
import MarkerPicker from './MarkerPicker.vue';
import SarResult from './SarResult.vue';
import { describeError, isRetryable } from './errors.ts';
import { formatElapsed, formatKm } from './format.ts';
import { applySuggestion, controller, form, session, suggestionButtons, toggleMarkers } from './state.ts';
import { validateForm } from './validation.ts';

const heading = ref<HTMLElement | null>(null);
const errorBox = ref<HTMLElement | null>(null);

const running = computed(() => session.run === 'running');
const check = computed(() => validateForm({ lat: form.lat, lng: form.lng, speed: form.speed, bands: form.bands, radius: form.radius }));
const errors = computed(() => (check.value.ok ? {} : check.value.errors));
// An empty start point is not an error yet: the hint next to Run says what is missing.
const needsStart = computed(() => form.lat.trim() === '' && form.lng.trim() === '');
const latError = computed(() => (form.lat.trim() === '' && needsStart.value ? '' : errors.value.lat ?? ''));
const lngError = computed(() => (form.lng.trim() === '' && needsStart.value ? '' : errors.value.lng ?? ''));
const speedError = computed(() => errors.value.speed ?? '');
const bandsError = computed(() => errors.value.bands ?? '');
const radiusError = computed(() => errors.value.radius ?? '');
const canClear = computed(() => session.result !== null || session.error !== null || form.lat !== '' || form.lng !== '');

const errorText = computed(() => (session.error ? describeError(session.error) : ''));
const retryable = computed(() => (session.error ? isRetryable(session.error.kind) : false));
const suggestions = computed(() => suggestionButtons(session.error));

onMounted(() => {
    heading.value?.focus();
});

watch(() => session.focusSeq, () => {
    void nextTick().then(() => heading.value?.focus());
});

// A new error: move focus to its first button, or to the message when there is none.
watch(() => session.error, async (error) => {
    if (!error) return;
    await nextTick();
    const box = errorBox.value;
    if (!box) return;
    const button = box.querySelector<HTMLElement>('button');
    (button ?? box).focus();
});
</script>
<style scoped>
.taknz-sar-panel {
    container-type: inline-size;
    container-name: taknz-sar;
}
.taknz-sar-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
}
.taknz-sar-col {
    min-width: 0;
    margin: 0;
}
.taknz-sar-wide {
    min-width: 0;
}
@container taknz-sar (min-width: 600px) {
    .taknz-sar-grid {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .taknz-sar-wide {
        grid-column: 1 / -1;
    }
}
</style>
