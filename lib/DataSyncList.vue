<!--
  The list of Data Syncs with checkbox rows. Adapted from TAK-NZ/cloudtak-plugin-rubbersheet,
  lib/DataSyncPicker.vue (Apache-2.0). Listed in NOTICE.
-->
<template>
    <div>
        <div
            v-if='loading'
            role='status'
            data-test='sync-loading'
        >
            <TablerLoading
                inline
                desc='Loading Data Syncs...'
            />
        </div>
        <TablerInlineAlert
            v-else-if='error'
            severity='danger'
            title='Error'
            :description='`Could not load Data Syncs. ${error}`'
            data-test='sync-error'
        />
        <p
            v-else-if='!missions.length'
            class='mb-0'
            data-test='sync-empty'
            v-text='NO_DATA_SYNCS'
        />
        <div
            v-else
            class='taknz-sar-sync-list overflow-auto'
            role='group'
            aria-label='Data Syncs'
        >
            <div
                v-for='mission in missions'
                :key='mission.guid'
                class='taknz-sar-sync-row cursor-pointer cloudtak-hover py-2 rounded d-flex align-items-center'
                role='checkbox'
                tabindex='0'
                :aria-checked='isSelected(mission) ? "true" : "false"'
                data-test='sync'
                @click='toggle(mission)'
                @keydown.enter.prevent='toggle(mission)'
                @keydown.space.prevent='toggle(mission)'
            >
                <IconCheck
                    v-if='isSelected(mission)'
                    :size='32'
                    stroke='1'
                    class='ms-3 flex-shrink-0'
                    aria-hidden='true'
                />
                <IconCloudPin
                    v-else
                    :size='32'
                    stroke='1'
                    class='ms-3 flex-shrink-0'
                    aria-hidden='true'
                />
                <span
                    class='mx-2 text-break'
                    v-text='mission.name'
                />
            </div>
        </div>
    </div>
</template>
<script setup lang='ts'>
import { onMounted, ref } from 'vue';
import { IconCheck, IconCloudPin } from '@tabler/icons-vue';
import { TablerInlineAlert, TablerLoading } from '@tak-ps/vue-tabler';
import { NO_DATA_SYNCS } from './copy.ts';
import { listSubscribedMissions } from './missions.ts';
import type { MissionChoice } from './types.ts';
const emit = defineEmits<{ (e: 'update', missions: MissionChoice[]): void }>();
const loading = ref(true);
const error = ref('');
const missions = ref<MissionChoice[]>([]);
const selected = ref<string[]>([]);
onMounted(async () => {
    try {
        missions.value = await listSubscribedMissions();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
});
const isSelected = (mission: MissionChoice): boolean => selected.value.includes(mission.guid);
function toggle(mission: MissionChoice): void {
    selected.value = isSelected(mission)
        ? selected.value.filter((guid) => guid !== mission.guid)
        : [...selected.value, mission.guid];
    emit('update', missions.value.filter(isSelected));
}
</script>
<style scoped>
.taknz-sar-sync-list {
    max-height: 40vh;
}
.taknz-sar-sync-row {
    min-height: 44px;
}
</style>
