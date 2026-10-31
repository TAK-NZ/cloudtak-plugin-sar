<template>
    <div
        class='taknz-sar-pane pb-3'
        data-test='pane'
    >
        <div
            class='visually-hidden'
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-test='live'
            v-text='session.announcement'
        />
        <ModeSelector />
        <Explainers />
        <fieldset
            class='mb-3 min-w-0'
            :disabled='running'
            data-test='ipp'
        >
            <legend class='form-label fs-4 mb-1'>
                Start point
            </legend>
            <p
                class='small text-secondary mb-2'
                data-test='start-hint'
                v-text='HINT_START'
            />
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
            v-if='form.mode === "travel-time"'
            class='mb-3 min-w-0'
            :disabled='running'
            data-test='settings'
        >
            <legend class='form-label fs-4 mb-1'>
                Travel settings
            </legend>
            <div class='mb-2'>
                <label
                    class='form-label mb-1'
                    for='sar-speed'
                >Speed</label>
                <SpeedPresets :disabled='running' />
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
                        :aria-describedby='speedError ? "sar-speed-help sar-speed-error" : "sar-speed-help"'
                        data-test='speed'
                    >
                    <span class='input-group-text'>km/h</span>
                </div>
                <div
                    id='sar-speed-help'
                    class='form-hint small text-secondary mt-1'
                    data-test='speed-hint'
                    v-text='HINT_SPEED'
                />
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
                    v-text='HINT_RADIUS'
                />
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
        <fieldset
            v-else
            class='mb-3 min-w-0'
            :disabled='running'
            data-test='settings'
        >
            <legend class='form-label fs-4 mb-1'>
                Subject
            </legend>
            <TarrProfile />
        </fieldset>
        <div>
            <div class='d-flex flex-wrap align-items-center gap-2'>
                <button
                    v-if='!running'
                    type='button'
                    class='btn btn-primary d-inline-flex align-items-center gap-1'
                    style='min-height: 44px; min-width: 44px;'
                    :disabled='!check.ok'
                    :aria-describedby='runHint ? "sar-run-hint" : undefined'
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
            </div>
            <div
                v-if='runHint && !running'
                id='sar-run-hint'
                class='small text-secondary mt-1'
                data-test='run-hint'
                v-text='runHint'
            />
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
            <ShareActions class='mt-3' />
        </div>
    </div>
</template>
<script setup lang='ts'>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { IconCrosshair, IconMapPin, IconPlayerPlay } from '@tabler/icons-vue';
import BandChips from './BandChips.vue';
import Explainers from './Explainers.vue';
import MarkerPicker from './MarkerPicker.vue';
import ModeSelector from './ModeSelector.vue';
import SarResult from './SarResult.vue';
import ShareActions from './ShareActions.vue';
import SpeedPresets from './SpeedPresets.vue';
import TarrProfile from './TarrProfile.vue';
import { HINT_RADIUS, HINT_SPEED, HINT_START, RUN_HINT_PROFILE, RUN_HINT_SPEED, RUN_HINT_START } from './copy.ts';
import { describeError, isRetryable } from './errors.ts';
import { formatElapsed, formatKm } from './format.ts';
import { applySuggestion, controller, form, session, suggestionButtons, toggleMarkers } from './state.ts';
import { validateRun } from './validation.ts';

const errorBox = ref<HTMLElement | null>(null);

const running = computed(() => session.run === 'running');
const check = computed(() => validateRun(form.mode, form));
const errors = computed(() => (check.value.ok ? {} : check.value.errors));
// An empty start point is not an error yet: the hint next to Run says what is missing.
const needsStart = computed(() => form.lat.trim() === '' && form.lng.trim() === '');
const latError = computed(() => (form.lat.trim() === '' && needsStart.value ? '' : errors.value.lat ?? ''));
const lngError = computed(() => (form.lng.trim() === '' && needsStart.value ? '' : errors.value.lng ?? ''));
const speedError = computed(() => (form.mode === 'travel-time' ? errors.value.speed ?? '' : ''));
const bandsError = computed(() => errors.value.bands ?? '');
const radiusError = computed(() => errors.value.radius ?? '');
const runHint = computed(() => {
    if (needsStart.value) return RUN_HINT_START;
    if (form.mode === 'tarr') return form.profile === '' ? RUN_HINT_PROFILE : '';
    return errors.value.speed ? RUN_HINT_SPEED : '';
});
const canClear = computed(() => session.result !== null || session.error !== null || form.lat !== '' || form.lng !== '');

const errorText = computed(() => (session.error ? describeError(session.error) : ''));
const retryable = computed(() => (session.error ? isRetryable(session.error.kind) : false));
const suggestions = computed(() => suggestionButtons(session.error));

// The pane can open while a pick from the mobile flow is still pending: cancel it.
onMounted(() => {
    if (session.picking) controller.pick();
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
.min-w-0 {
    min-width: 0;
}
</style>
