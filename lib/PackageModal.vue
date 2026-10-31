<template>
    <TablerModal size='lg'>
        <div class='modal-status bg-red' />
        <button
            type='button'
            class='btn-close'
            aria-label='Close'
            @click='emit("close")'
        />
        <div class='modal-header text-body'>
            <div class='d-flex align-items-center'>
                <IconPackage
                    :size='28'
                    stroke='1'
                    aria-hidden='true'
                />
                <h2
                    class='h3 mx-2 mb-0'
                    data-test='package-title'
                >
                    Create data package
                </h2>
            </div>
        </div>
        <div class='modal-body text-body'>
            <FieldInput
                id='sar-package-name'
                v-model='name'
                class='mb-3'
                label='Package name'
                inputmode='text'
                maxlength='100'
                hint='The package is private to you and downloads as a zip of CoT files. It can also be filed in Data Syncs below.'
                hint-id='sar-package-help'
                :error='name.trim() === "" ? "Enter a name." : ""'
                data-test='package-name'
            />
            <h3 class='h4 mb-1'>
                Also add to a Data Sync (optional)
            </h3>
            <DataSyncList @update='selected = $event' />
        </div>
        <div class='modal-footer'>
            <TablerButton
                title='Cancel'
                data-test='package-cancel'
                @click='emit("close")'
            >
                Cancel
            </TablerButton>
            <div class='ms-auto'>
                <TablerButton
                    class='btn-primary'
                    title='Create the package and download it'
                    :disabled='name.trim() === ""'
                    data-test='package-confirm'
                    @click='emit("confirm", { name: name.trim(), missions: selected })'
                >
                    Create and download
                </TablerButton>
            </div>
        </div>
    </TablerModal>
</template>
<script setup lang='ts'>
import { ref } from 'vue';
import FieldInput from './FieldInput.vue';
import { TablerButton, TablerModal } from '@tak-ps/vue-tabler';
import { IconPackage } from '@tabler/icons-vue';
import DataSyncList from './DataSyncList.vue';
import { formatUtc } from './format.ts';
import { session } from './state.ts';
import type { MissionChoice } from './types.ts';
const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'confirm', options: { name: string; missions: MissionChoice[] }): void;
}>();
const meta = session.meta;
const title = meta?.mode === 'tarr' ? 'TARR' : 'Travel Time';
const name = ref(`SAR ${title} ${meta ? formatUtc(meta.ranAt).replace(' UTC', '') : ''}`.trim().replace(/:/g, '.'));
const selected = ref<MissionChoice[]>([]);
</script>
