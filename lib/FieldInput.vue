<!--
  A text field that looks like the host's TablerInput (same markup and the same styling, which TablerInput
  scopes to itself, so it is repeated below) but keeps what the pane needs and TablerInput cannot take:
  an id the label points at, inputmode, aria-describedby and a data-test on the input element.
-->
<template>
    <div
        :class='attrs.class'
        :style='attrs.style as StyleValue'
    >
        <label
            class='d-block px-2 my-1 user-select-none'
            :for='id'
            v-text='label'
        />
        <div
            class='input-group input-group-flat'
            :class='{ "sar-field-invalid": error }'
        >
            <input
                :id='id'
                v-bind='inputAttrs'
                :type='type'
                :value='modelValue'
                class='form-control'
                :class='{ "is-invalid": error, "sar-field-with-end": error }'
                style='font-size: 16px; min-height: 44px; min-width: 0;'
                :inputmode='inputmode'
                autocomplete='off'
                :disabled='disabled'
                :aria-invalid='error ? "true" : undefined'
                :aria-describedby='describedBy'
                @input='emit("update:modelValue", ($event.target as HTMLInputElement).value)'
                @keydown.enter.prevent='emit("submit")'
            >
            <slot name='append' />
            <span
                v-if='error'
                class='input-group-text sar-field-error-end'
            >
                <IconAlertCircle
                    :size='20'
                    stroke='1.5'
                    aria-hidden='true'
                />
            </span>
        </div>
        <div
            v-if='hint'
            :id='hintIdOrDefault'
            class='form-hint small text-secondary mt-1 px-2'
            :data-test='hintTest'
            v-text='hint'
        />
        <div
            v-if='error'
            :id='errorIdOrDefault'
            class='invalid-feedback d-block px-2'
            :data-test='errorTest'
        >
            <span class='fw-bold'>Error:</span> <span v-text='error' />
        </div>
    </div>
</template>
<script setup lang='ts'>
import { computed, useAttrs } from 'vue';
import type { StyleValue } from 'vue';
import { IconAlertCircle } from '@tabler/icons-vue';

defineOptions({ inheritAttrs: false });

// class and style belong to the whole field; everything else (data-test, aria-*) goes to the input.
const attrs = useAttrs();
const inputAttrs = computed(() => {
    const rest = { ...attrs };
    delete rest.class;
    delete rest.style;
    return rest;
});

const props = withDefaults(defineProps<{
    id: string;
    label: string;
    modelValue: string;
    type?: string;
    inputmode?: 'decimal' | 'text' | 'search';
    disabled?: boolean;
    /** The error text, without the word "Error:". Empty means valid. */
    error?: string;
    hint?: string;
    hintId?: string;
    hintTest?: string;
    errorId?: string;
    errorTest?: string;
}>(), {
    type: 'text', inputmode: 'decimal', disabled: false, error: '', hint: '', hintId: '', hintTest: undefined, errorId: '', errorTest: undefined,
});
const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'submit'): void;
}>();

const hintIdOrDefault = computed(() => props.hintId || `${props.id}-help`);
const errorIdOrDefault = computed(() => props.errorId || `${props.id}-error`);
const describedBy = computed(() => {
    const ids = [props.hint ? hintIdOrDefault.value : '', props.error ? errorIdOrDefault.value : ''].filter((x) => x !== '');
    return ids.length ? ids.join(' ') : undefined;
});
</script>
<style scoped>
.input-group .form-control,
.input-group .input-group-text {
    border-color: var(--tblr-border-color);
    color: var(--tblr-body-color);
    background-color: var(--tabler-input-bg, var(--tblr-bg-forms, var(--tblr-bg-surface, var(--tblr-body-bg))));
    box-shadow: none;
}
.input-group .form-control::placeholder {
    color: var(--tblr-secondary-color);
    opacity: 1;
}
.input-group .form-control.is-invalid {
    border-color: var(--tblr-form-invalid-border-color, var(--tblr-danger));
}
.input-group .input-group-text:not(:last-child) {
    border-right: 0;
}
.input-group .input-group-text:not(:first-child) {
    border-left: 0;
}
.sar-field-with-end.is-invalid {
    background-image: none;
    padding-right: 3rem;
}
.sar-field-invalid > .form-control.is-invalid {
    border-right: 0;
}
.sar-field-invalid:focus-within {
    border-radius: var(--tblr-border-radius);
    box-shadow: var(--tblr-shadow-input), 0 0 0 0.25rem rgba(var(--tblr-danger-rgb), 0.25);
}
.sar-field-invalid > .form-control.is-invalid:focus {
    border-color: var(--tblr-form-invalid-border-color, var(--tblr-danger)) !important;
    box-shadow: none !important;
    outline: 0;
}
.sar-field-invalid > .input-group-text:last-child {
    border-color: var(--tblr-form-invalid-border-color, var(--tblr-danger)) !important;
    border-left: 0;
}
.sar-field-error-end {
    color: var(--tblr-form-invalid-border-color, var(--tblr-danger)) !important;
    opacity: 1;
}
</style>
