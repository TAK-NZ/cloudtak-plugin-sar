<template>
    <SlideDownHeader
        v-model='open'
        :label='label'
        :data-test='`box-${id}`'
    >
        <template #icon>
            <component
                :is='icon'
                :size='20'
                stroke='1'
                class='me-2'
                aria-hidden='true'
            />
        </template>
        <div
            v-if='open'
            class='small px-2 pt-2 pb-2'
        >
            <slot />
        </div>
    </SlideDownHeader>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import type { Component } from 'vue';
import { IconHelp } from '@tabler/icons-vue';
// Host component, the same collapsible header the Rubber Sheet plugin uses for "How it works".
import SlideDownHeader from '../../../src/components/CloudTAK/util/SlideDownHeader.vue';
import { ui } from './state.ts';

const props = withDefaults(defineProps<{
    /** Keys the open/closed choice in the shared state. */
    id: string;
    label: string;
    icon?: Component;
}>(), { icon: () => IconHelp });

// Closed until the user opens it; the choice survives the pane being rebuilt.
const open = computed({
    get: () => ui.sections[props.id] ?? false,
    set: (value: boolean) => {
        ui.sections[props.id] = value;
    },
});
</script>
