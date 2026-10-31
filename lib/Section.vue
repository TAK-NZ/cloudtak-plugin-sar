<!--
  A collapsible section like the "Adjust / Image / Export" sections of the Rubber Sheet plugin: the host's
  SlideDownHeader with an icon, open by default. The body is always rendered (it may hold form fields) and
  made inert while closed, so closed fields cannot be reached with the keyboard.
-->
<template>
    <SlideDownHeader
        v-model='open'
        :label='label'
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
        <component
            :is='tag'
            v-bind='$attrs'
            class='sar-section-body d-flex flex-column gap-2 px-2 pt-2'
            :disabled='tag === "fieldset" ? disabled : undefined'
            :role='tag === "fieldset" ? undefined : "region"'
            :aria-label='tag === "fieldset" ? undefined : label'
            :inert='open ? undefined : true'
        >
            <legend
                v-if='tag === "fieldset"'
                class='visually-hidden'
                v-text='label'
            />
            <slot />
        </component>
    </SlideDownHeader>
</template>
<script setup lang='ts'>
import { computed } from 'vue';
import type { Component } from 'vue';
// Host component, the same collapsible header the Rubber Sheet plugin uses.
import SlideDownHeader from '../../../src/components/CloudTAK/util/SlideDownHeader.vue';
import { ui } from './state.ts';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
    /** Keys the open/closed choice in the shared state. */
    id: string;
    label: string;
    icon: Component;
    /** `fieldset` for form fields (can be disabled as a group), `div` for read-only content. */
    tag?: 'fieldset' | 'div';
    disabled?: boolean;
    defaultOpen?: boolean;
}>(), { tag: 'fieldset', disabled: false, defaultOpen: true });

const open = computed({
    get: () => ui.sections[props.id] ?? props.defaultOpen,
    set: (value: boolean) => {
        ui.sections[props.id] = value;
    },
});
</script>
<style scoped>
.sar-section-body {
    min-width: 0;
    margin: 0;
    border: 0;
}
</style>
