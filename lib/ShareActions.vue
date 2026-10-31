<template>
    <section
        v-if='session.result'
        aria-label='Share the result'
        data-test='share'
    >
        <h3 class='h4'>
            Share the result
        </h3>
        <p
            class='small mb-2'
            data-test='share-hint'
            v-text='SHARE_HINT'
        />
        <div class='d-flex flex-wrap gap-2'>
            <button
                type='button'
                class='btn btn-outline-secondary d-inline-flex align-items-center gap-1'
                style='min-height: 44px; min-width: 44px;'
                :disabled='busy'
                data-test='add-to-sync'
                @click='picker = true'
            >
                <IconCloudPin
                    :size='20'
                    stroke='1.5'
                    aria-hidden='true'
                />
                <span>Add to Data Sync</span>
            </button>
            <button
                type='button'
                class='btn btn-outline-secondary d-inline-flex align-items-center gap-1'
                style='min-height: 44px; min-width: 44px;'
                :disabled='busy'
                data-test='create-package'
                @click='packaging = true'
            >
                <IconPackage
                    :size='20'
                    stroke='1.5'
                    aria-hidden='true'
                />
                <span>Create data package</span>
            </button>
            <button
                type='button'
                class='btn btn-outline-secondary d-inline-flex align-items-center gap-1'
                style='min-height: 44px; min-width: 44px;'
                :disabled='busy'
                data-test='download-files'
                @click='controller.exportFiles()'
            >
                <IconDownload
                    :size='20'
                    stroke='1.5'
                    aria-hidden='true'
                />
                <span>Download KML and GeoJSON</span>
            </button>
        </div>
        <p
            class='small text-secondary mt-2 mb-0'
            v-text='SHARE_HOLES'
        />
        <p
            v-if='busy'
            class='mt-2 mb-0'
            role='status'
            data-test='share-busy'
        >
            <span
                class='spinner-border spinner-border-sm me-1'
                aria-hidden='true'
            />
            Working...
        </p>
        <p
            v-if='session.share.message && !busy'
            class='mt-2 mb-0'
            data-test='share-message'
            v-text='session.share.message'
        />
        <p
            v-if='session.share.error && !busy'
            class='mt-2 mb-0 text-danger'
            data-test='share-error'
        >
            <span class='fw-bold'>Error:</span> <span v-text='session.share.error' />
        </p>
        <DataSyncPicker
            v-if='picker'
            @close='picker = false'
            @confirm='addToSync'
        />
        <PackageModal
            v-if='packaging'
            @close='packaging = false'
            @confirm='makePackage'
        />
    </section>
</template>
<script setup lang='ts'>
import { computed, ref } from 'vue';
import { IconCloudPin, IconDownload, IconPackage } from '@tabler/icons-vue';
import DataSyncPicker from './DataSyncPicker.vue';
import PackageModal from './PackageModal.vue';
import { SHARE_HINT, SHARE_HOLES } from './copy.ts';
import { controller, session } from './state.ts';
import type { MissionChoice } from './types.ts';
const picker = ref(false);
const packaging = ref(false);
const busy = computed(() => session.share.busy);
function addToSync(missions: MissionChoice[]): void {
    picker.value = false;
    void controller.addToDataSync(missions);
}
function makePackage(options: { name: string; missions: MissionChoice[] }): void {
    packaging.value = false;
    void controller.createPackage(options);
}
</script>
