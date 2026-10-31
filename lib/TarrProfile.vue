<template>
    <div data-test='tarr-profile'>
        <div class='mb-2'>
            <label
                class='d-block px-2 my-1 user-select-none'
                for='sar-profile'
            >Subject profile</label>
            <select
                id='sar-profile'
                class='form-select'
                style='font-size: 16px; min-height: 44px;'
                :value='form.profile'
                data-test='profile'
                @change='setProfile(($event.target as HTMLSelectElement).value)'
            >
                <option value=''>
                    Select a profile
                </option>
                <option
                    v-for='name in names'
                    :key='name'
                    :value='name'
                    v-text='name'
                />
            </select>
        </div>
        <div
            v-if='ecoregions.length'
            class='mb-2'
        >
            <label
                class='d-block px-2 my-1 user-select-none'
                for='sar-ecoregion'
            >Ecoregion</label>
            <select
                id='sar-ecoregion'
                class='form-select'
                style='font-size: 16px; min-height: 44px;'
                :value='form.ecoregion'
                data-test='ecoregion'
                @change='setEcoregion(($event.target as HTMLSelectElement).value)'
            >
                <option value=''>
                    Other / default
                </option>
                <option
                    v-for='name in ecoregions'
                    :key='name'
                    :value='name'
                    v-text='name'
                />
            </select>
        </div>
        <div
            v-if='terrains.length'
            class='mb-2'
        >
            <label
                class='d-block px-2 my-1 user-select-none'
                for='sar-terrain'
            >Terrain</label>
            <select
                id='sar-terrain'
                class='form-select'
                style='font-size: 16px; min-height: 44px;'
                :value='form.terrain'
                data-test='terrain'
                @change='setTerrain(($event.target as HTMLSelectElement).value)'
            >
                <option value=''>
                    Other / default
                </option>
                <option
                    v-for='name in terrains'
                    :key='name'
                    :value='name'
                    v-text='name'
                />
            </select>
        </div>
        <div>
            <div class='d-flex align-items-center'>
                <label
                    class='flex-grow-1 d-flex align-items-center px-2 user-select-none'
                    style='min-height: 44px;'
                    for='sar-plain-circles'
                >Also draw plain circles</label>
                <span class='form-switch ms-auto'>
                    <input
                        id='sar-plain-circles'
                        type='checkbox'
                        role='switch'
                        class='form-check-input'
                        :checked='form.plainCircles'
                        aria-describedby='sar-plain-circles-help'
                        data-test='plain-circles'
                        @change='setPlainCircles(($event.target as HTMLInputElement).checked)'
                    >
                </span>
            </div>
            <div
                id='sar-plain-circles-help'
                class='form-hint small text-secondary px-2'
                v-text='HINT_PLAIN_CIRCLES'
            />
        </div>
        <p
            v-if='distances'
            class='mb-1 px-2'
            data-test='koester-distances'
        >
            Koester distances for this choice: 25%: {{ distances[0] }} km, 50%: {{ distances[1] }} km, 75%: {{ distances[2] }} km
        </p>
        <p
            class='small fw-bold mb-2 px-2'
            data-test='tarr-not-calibrated'
            v-text='TARR_NOT_CALIBRATED'
        />
        <InfoBox
            id='tarr-about'
            label='About these numbers'
            :icon='IconInfoCircle'
        >
            <p
                class='mb-1'
                data-test='koester-source'
            >
                Source: <span v-text='KOESTER_SOURCE' />
            </p>
            <p
                class='mb-1'
                data-test='tarr-notice-calibration'
                v-text='TARR_NOTICE_CALIBRATION'
            />
            <p
                class='mb-1'
                data-test='tarr-notice-percent'
                v-text='TARR_NOTICE_PERCENT'
            />
            <p
                class='text-secondary mb-0'
                v-text='HINT_TARR_RADIUS'
            />
        </InfoBox>
    </div>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { IconInfoCircle } from '@tabler/icons-vue';
import InfoBox from './InfoBox.vue';
import { HINT_PLAIN_CIRCLES, HINT_TARR_RADIUS, TARR_NOT_CALIBRATED, TARR_NOTICE_CALIBRATION, TARR_NOTICE_PERCENT } from './copy.ts';
import { form, setEcoregion, setPlainCircles, setProfile, setTerrain } from './state.ts';
import { KOESTER_SOURCE, distancesFor, ecoregionsOf, profileNames, terrainsOf } from './tarr-profiles.ts';
const names = profileNames();
const ecoregions = computed(() => (form.profile ? ecoregionsOf(form.profile) : []));
const terrains = computed(() => (form.profile && form.ecoregion ? terrainsOf(form.profile, form.ecoregion) : []));
const distances = computed(() => (form.profile ? distancesFor(form.profile, form.ecoregion || null, form.terrain || null) : null));
</script>
