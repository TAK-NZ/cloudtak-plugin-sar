<template>
    <div
        class='mb-3'
        data-test='explainers'
    >
        <details
            v-for='item in items'
            :key='item.id'
            class='border rounded p-2 mb-2'
            :data-test='`explainer-${item.id}`'
        >
            <summary
                class='fw-bold'
                style='min-height: 44px; display: flex; align-items: center; cursor: pointer;'
                v-text='item.explainer.title'
            />
            <div
                v-for='section in item.explainer.sections'
                :key='section.heading'
                class='mt-2'
            >
                <h4
                    class='h5 mb-1'
                    v-text='section.heading'
                />
                <p
                    class='mb-0 small'
                    v-text='section.text'
                />
            </div>
        </details>
    </div>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import { WHATS_TARR, WHATS_TRAVEL_TIME } from './copy.ts';
import { form } from './state.ts';
// The explainer of the active mode comes first.
const items = computed(() => {
    const list = [
        { id: 'travel-time', explainer: WHATS_TRAVEL_TIME },
        { id: 'tarr', explainer: WHATS_TARR },
    ];
    return form.mode === 'tarr' ? list.reverse() : list;
});
</script>
