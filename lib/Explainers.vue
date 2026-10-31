<template>
    <InfoBox
        id='how'
        label='How it works'
        data-test='explainers'
    >
        <section
            v-for='section in explainer.sections'
            :key='section.heading'
            class='mb-2'
        >
            <h4
                class='h5 mb-1'
                v-text='section.heading'
            />
            <p
                class='mb-0'
                v-text='section.text'
            />
        </section>
    </InfoBox>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import InfoBox from './InfoBox.vue';
import { WHATS_TARR, WHATS_TRAVEL_TIME } from './copy.ts';
import { form } from './state.ts';
// One box for the mode that is selected.
const explainer = computed(() => (form.mode === 'tarr' ? WHATS_TARR : WHATS_TRAVEL_TIME));
</script>
