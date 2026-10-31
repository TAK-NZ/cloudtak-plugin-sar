<template>
    <div
        class='taknz-sar-pane d-flex flex-column gap-2 pb-3'
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
        <Section
            id='start'
            label='Start point'
            :icon='IconMapPin'
            :disabled='running'
            data-test='ipp'
        >
            <div class='d-flex flex-wrap gap-2'>
                <TablerButton
                    type='button'
                    class='flex-fill d-inline-flex align-items-center justify-content-center'
                    :class='session.picking ? "btn-primary" : "btn-outline-primary"'
                    style='min-height: 44px; min-width: 44px;'
                    :aria-pressed='session.picking ? "true" : "false"'
                    data-test='pick'
                    @click='controller.pick()'
                >
                    <IconCrosshair
                        :size='20'
                        stroke='1'
                        class='me-2'
                        aria-hidden='true'
                    />
                    Pick on map
                </TablerButton>
                <TablerButton
                    type='button'
                    class='flex-fill d-inline-flex align-items-center justify-content-center'
                    :class='session.markerOpen ? "btn-primary" : "btn-outline-primary"'
                    style='min-height: 44px; min-width: 44px;'
                    :aria-expanded='session.markerOpen ? "true" : "false"'
                    data-test='choose-marker'
                    @click='toggleMarkers()'
                >
                    <IconMapPin
                        :size='20'
                        stroke='1'
                        class='me-2'
                        aria-hidden='true'
                    />
                    Choose a marker
                </TablerButton>
            </div>
            <div
                v-if='session.picking'
                class='d-flex flex-column gap-2'
                data-test='pick-banner'
            >
                <TablerInlineAlert
                    severity='info'
                    title='Tap the map to set the start point'
                />
                <TablerButton
                    type='button'
                    class='btn-outline-secondary w-100'
                    style='min-height: 44px; min-width: 44px;'
                    data-test='pick-cancel'
                    @click='controller.pick()'
                >
                    Cancel
                </TablerButton>
            </div>
            <MarkerPicker v-if='session.markerOpen' />
            <div class='row g-2'>
                <div class='col-6'>
                    <FieldInput
                        id='sar-lat'
                        v-model='form.lat'
                        label='Latitude'
                        :error='latError'
                        error-test='lat-error'
                        data-test='lat'
                    />
                </div>
                <div class='col-6'>
                    <FieldInput
                        id='sar-lng'
                        v-model='form.lng'
                        label='Longitude'
                        :error='lngError'
                        error-test='lng-error'
                        data-test='lng'
                    />
                </div>
            </div>
        </Section>
        <Section
            v-if='form.mode === "travel-time"'
            id='travel'
            label='Travel settings'
            :icon='IconAdjustments'
            :disabled='running'
            data-test='settings'
        >
            <FieldInput
                id='sar-speed'
                v-model='form.speed'
                label='Speed (km/h)'
                :hint='HINT_SPEED'
                hint-test='speed-hint'
                :error='speedError'
                error-test='speed-error'
                data-test='speed'
            />
            <SpeedPresets :disabled='running' />
            <BandChips :disabled='running' />
            <div
                v-if='bandsError'
                class='small text-danger px-2'
                data-test='bands-error'
            >
                <span class='fw-bold'>Error:</span> <span v-text='bandsError' />
            </div>
            <FieldInput
                id='sar-radius'
                v-model='form.radius'
                label='Radius (km, optional)'
                :hint='HINT_RADIUS'
                :error='radiusError'
                error-test='radius-error'
                data-test='radius'
            />
        </Section>
        <Section
            v-else
            id='subject'
            label='Subject'
            :icon='IconUserSearch'
            :disabled='running'
            data-test='settings'
        >
            <TarrProfile />
        </Section>
        <div class='d-flex flex-column gap-2 px-2 mt-2'>
            <TablerButton
                v-if='!running'
                type='button'
                class='btn-primary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                :disabled='!check.ok'
                :aria-describedby='runHint ? "sar-run-hint" : undefined'
                data-test='run'
                @click='controller.run()'
            >
                <IconPlayerPlay
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Run
            </TablerButton>
            <TablerButton
                v-else
                type='button'
                class='btn-outline-secondary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                data-test='cancel'
                @click='controller.cancel()'
            >
                <IconPlayerStop
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Cancel
            </TablerButton>
            <TablerButton
                type='button'
                class='btn-outline-secondary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                :disabled='running || !canClear'
                data-test='clear'
                @click='controller.clear()'
            >
                <IconEraser
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Clear
            </TablerButton>
            <div
                v-if='runHint && !running'
                id='sar-run-hint'
                class='small text-secondary'
                data-test='run-hint'
                v-text='runHint'
            />
        </div>
        <div
            v-if='running'
            class='px-2'
            data-test='progress'
        >
            <TablerLoading
                :desc='`Working... ${formatElapsed(session.elapsed)}`'
            />
            <p class='small text-secondary text-center mb-0'>
                This can take up to a minute, especially the first time.
            </p>
        </div>
        <div
            v-if='session.error && !running'
            ref='errorBox'
            tabindex='-1'
            class='px-2'
            data-test='error'
        >
            <TablerInlineAlert
                severity='danger'
                title='Error'
                :description='errorText'
                data-test='error-alert'
            />
            <div class='d-flex flex-wrap gap-2 mt-2'>
                <TablerButton
                    v-for='button in suggestions'
                    :key='button.kind'
                    type='button'
                    class='btn-primary'
                    style='min-height: 44px; min-width: 44px;'
                    :aria-describedby='button.alsoRadiusKm !== undefined ? "sar-suggest-both" : undefined'
                    :data-test='`suggest-${button.kind}`'
                    @click='applySuggestion(button)'
                >
                    {{ button.label }}
                </TablerButton>
                <TablerButton
                    v-if='retryable'
                    type='button'
                    class='btn-outline-primary d-inline-flex align-items-center'
                    style='min-height: 44px; min-width: 44px;'
                    data-test='retry'
                    @click='controller.run()'
                >
                    <IconRefresh
                        :size='20'
                        stroke='1'
                        class='me-2'
                        aria-hidden='true'
                    />
                    Retry
                </TablerButton>
            </div>
            <span
                v-for='button in suggestions.filter((b) => b.alsoRadiusKm !== undefined)'
                id='sar-suggest-both'
                :key='button.kind'
                class='visually-hidden'
            >Also sets the radius to {{ formatKm(button.alsoRadiusKm as number) }} km.</span>
        </div>
        <SarResult />
        <ShareActions />
    </div>
</template>
<script setup lang='ts'>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { IconAdjustments, IconCrosshair, IconEraser, IconMapPin, IconPlayerPlay, IconPlayerStop, IconRefresh, IconUserSearch } from '@tabler/icons-vue';
import { TablerButton, TablerInlineAlert, TablerLoading } from '@tak-ps/vue-tabler';
import BandChips from './BandChips.vue';
import Explainers from './Explainers.vue';
import FieldInput from './FieldInput.vue';
import MarkerPicker from './MarkerPicker.vue';
import ModeSelector from './ModeSelector.vue';
import Section from './Section.vue';
import SarResult from './SarResult.vue';
import ShareActions from './ShareActions.vue';
import SpeedPresets from './SpeedPresets.vue';
import TarrProfile from './TarrProfile.vue';
import { HINT_RADIUS, HINT_SPEED, RUN_HINT_PROFILE, RUN_HINT_SPEED, RUN_HINT_START } from './copy.ts';
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
