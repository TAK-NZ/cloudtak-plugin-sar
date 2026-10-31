<template>
    <Section
        v-if='session.result'
        id='share'
        label='Save and share'
        :icon='IconShare'
        tag='div'
        data-test='share'
    >
        <div class='d-flex flex-column gap-2'>
            <TablerButton
                type='button'
                class='btn-primary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                :disabled='busy'
                data-test='save-files'
                @click='controller.saveToFiles()'
            >
                <IconDeviceFloppy
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Save to Files
            </TablerButton>
            <TablerButton
                v-if='session.share.saved'
                type='button'
                class='btn-outline-primary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                data-test='open-files'
                @click='controller.openFiles()'
            >
                <IconFiles
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Open Files
            </TablerButton>
            <TablerButton
                type='button'
                class='btn-outline-primary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                :disabled='busy'
                data-test='add-to-sync'
                @click='picker = true'
            >
                <IconCloudPin
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Add to Data Sync
            </TablerButton>
            <TablerButton
                type='button'
                class='btn-outline-primary w-100 d-inline-flex align-items-center justify-content-center'
                style='min-height: 44px; min-width: 44px;'
                :disabled='busy'
                data-test='create-package'
                @click='packaging = true'
            >
                <IconPackage
                    :size='20'
                    stroke='1'
                    class='me-2'
                    aria-hidden='true'
                />
                Create data package
            </TablerButton>
        </div>
        <div
            v-if='busy'
            role='status'
            data-test='share-busy'
        >
            <TablerLoading
                :desc='session.share.status || "Working..."'
                data-test='share-status'
            />
        </div>
        <TablerInlineAlert
            v-if='session.share.message && !busy'
            severity='success'
            :title='session.share.message'
            data-test='share-message'
        />
        <TablerInlineAlert
            v-if='session.share.error && !busy'
            severity='danger'
            title='Error'
            :description='session.share.error'
            data-test='share-error'
        />
        <InfoBox
            id='share-about'
            label='About saving and sharing'
        >
            <p
                class='mb-1'
                data-test='share-files-hint'
                v-text='SHARE_FILES_HINT'
            />
            <p
                class='mb-1'
                data-test='share-hint'
                v-text='SHARE_HINT'
            />
            <p
                class='mb-0'
                v-text='SHARE_HOLES'
            />
        </InfoBox>
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
    </Section>
</template>
<script setup lang='ts'>
import { computed, ref } from 'vue';
import { IconCloudPin, IconDeviceFloppy, IconFiles, IconPackage, IconShare } from '@tabler/icons-vue';
import { TablerButton, TablerInlineAlert, TablerLoading } from '@tak-ps/vue-tabler';
import Section from './Section.vue';
import InfoBox from './InfoBox.vue';
import DataSyncPicker from './DataSyncPicker.vue';
import PackageModal from './PackageModal.vue';
import { SHARE_FILES_HINT, SHARE_HINT, SHARE_HOLES } from './copy.ts';
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
