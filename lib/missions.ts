/*
 * The Data Sync list is adapted from TAK-NZ/cloudtak-plugin-rubbersheet, lib/missions.ts
 * (listSubscribedMissions, Apache-2.0). Listed in NOTICE.
 */
// Host module (the plugin is built inside app/plugins/<name>/, like the Rubber Sheet plugin).
import Subscription from '../../../src/base/subscription.ts';
import type { MissionChoice } from './types.ts';

/**
 * The Data Syncs the host's Share dialog offers: the user is subscribed and has a write role.
 * Subscribed is required because the host refuses to file a feature in a Data Sync it has not loaded.
 */
export async function listSubscribedMissions(): Promise<MissionChoice[]> {
    const list = await Subscription.localList({ role: 'MISSION_SUBSCRIBER', subscribed: true });
    return [...list]
        .map((m) => ({ guid: m.guid, name: m.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
