<!--
  Choose the Data Syncs to move the features into. Adapted from TAK-NZ/cloudtak-plugin-rubbersheet,
  lib/DataSyncPicker.vue (Apache-2.0). Listed in NOTICE.
-->
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
                <IconCloudPin
                    :size='28'
                    stroke='1'
                    aria-hidden='true'
                />
                <h2
                    class='h3 mx-2 mb-0'
                    data-test='picker-title'
                >
                    Add to Data Sync
                </h2>
            </div>
        </div>
        <div class='modal-body text-body'>
            <p
                class='small mb-2'
                v-text='SHARE_HINT'
            />
            <DataSyncList @update='selected = $event' />
        </div>
        <div class='modal-footer'>
            <TablerButton
                title='Cancel'
                data-test='picker-cancel'
                @click='emit("close")'
            >
                Cancel
            </TablerButton>
            <div class='ms-auto'>
                <TablerButton
                    class='btn-primary'
                    title='Add to the selected Data Syncs'
                    :disabled='selected.length === 0'
                    data-test='picker-confirm'
                    @click='emit("confirm", selected)'
                >
                    Add to Data Sync
                </TablerButton>
            </div>
        </div>
    </TablerModal>
</template>
<script setup lang='ts'>
import { ref } from 'vue';
import { TablerButton, TablerModal } from '@tak-ps/vue-tabler';
import { IconCloudPin } from '@tabler/icons-vue';
import DataSyncList from './DataSyncList.vue';
import { SHARE_HINT } from './copy.ts';
import type { MissionChoice } from './types.ts';
const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'confirm', missions: MissionChoice[]): void;
}>();
const selected = ref<MissionChoice[]>([]);
</script>
