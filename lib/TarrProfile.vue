<template>
    <div data-test='tarr-profile'>
        <div class='mb-2'>
            <label
                class='form-label mb-1'
                for='sar-profile'
            >Subject profile</label>
            <select
                id='sar-profile'
                class='form-select'
                style='font-size: 16px; min-height: 44px;'
                :value='form.profile'
                aria-describedby='sar-profile-help'
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
            <div
                id='sar-profile-help'
                class='form-hint small text-secondary mt-1'
                v-text='HINT_PROFILE'
            />
        </div>
        <div
            v-if='ecoregions.length'
            class='mb-2'
        >
            <label
                class='form-label mb-1'
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
                class='form-label mb-1'
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
        <p
            v-if='distances'
            class='mb-1'
            data-test='koester-distances'
        >
            Koester distances for this choice: 25%: {{ distances[0] }} km, 50%: {{ distances[1] }} km, 75%: {{ distances[2] }} km
        </p>
        <p
            class='small text-secondary mb-1'
            data-test='koester-source'
        >
            Source: <span v-text='KOESTER_SOURCE' />
        </p>
        <p
            class='small mb-1'
            data-test='tarr-notice-calibration'
            v-text='TARR_NOTICE_CALIBRATION'
        />
        <p
            class='small mb-1'
            data-test='tarr-notice-percent'
            v-text='TARR_NOTICE_PERCENT'
        />
        <p
            class='small text-secondary mb-0'
            v-text='HINT_TARR_RADIUS'
        />
    </div>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { HINT_PROFILE, HINT_TARR_RADIUS, TARR_NOTICE_CALIBRATION, TARR_NOTICE_PERCENT } from './copy.ts';
import { form, setEcoregion, setProfile, setTerrain } from './state.ts';
import { KOESTER_SOURCE, distancesFor, ecoregionsOf, profileNames, terrainsOf } from './tarr-profiles.ts';
const names = profileNames();
const ecoregions = computed(() => (form.profile ? ecoregionsOf(form.profile) : []));
const terrains = computed(() => (form.profile && form.ecoregion ? terrainsOf(form.profile, form.ecoregion) : []));
const distances = computed(() => (form.profile ? distancesFor(form.profile, form.ecoregion || null, form.terrain || null) : null));
</script>
