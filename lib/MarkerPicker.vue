<template>
    <div
        role='group'
        aria-label='Choose a marker'
        class='border rounded p-2'
        data-test='marker-picker'
    >
        <FieldInput
            id='sar-marker-filter'
            v-model='filter'
            class='mb-2'
            label='Filter markers by name'
            type='search'
            inputmode='search'
            data-test='marker-filter'
        />
        <p
            v-if='session.markersLoading'
            class='mb-0'
            data-test='marker-loading'
        >
            Loading markers...
        </p>
        <p
            v-else-if='session.markersFailed'
            class='mb-0'
            data-test='marker-failed'
        >
            Could not read the markers.
        </p>
        <p
            v-else-if='shown.length === 0'
            class='mb-0'
            data-test='marker-empty'
        >
            No markers found.
        </p>
        <ul
            v-else
            class='list-unstyled mb-0 overflow-auto'
            style='max-height: 180px;'
            aria-label='Markers'
        >
            <li
                v-for='marker in shown'
                :key='marker.id'
            >
                <button
                    type='button'
                    class='btn btn-outline-primary w-100 text-start mb-1'
                    style='min-height: 44px;'
                    data-test='marker'
                    @click='chooseMarker(marker)'
                    v-text='marker.callsign'
                />
            </li>
        </ul>
        <p
            v-if='truncated'
            class='small text-secondary mt-1 mb-0'
            data-test='marker-truncated'
        >
            Showing the first {{ LIMIT }} of {{ matches.length }}. Type a name to narrow the list.
        </p>
    </div>
</template>
<script setup lang='ts'>
import { computed, ref } from 'vue';
import FieldInput from './FieldInput.vue';
import { chooseMarker, session } from './state.ts';

const LIMIT = 100;
const filter = ref('');

const matches = computed(() => {
    const q = filter.value.trim().toLowerCase();
    const list = session.markers ?? [];
    return q === '' ? list : list.filter((m) => m.callsign.toLowerCase().includes(q));
});
const shown = computed(() => matches.value.slice(0, LIMIT));
const truncated = computed(() => matches.value.length > LIMIT);
</script>
