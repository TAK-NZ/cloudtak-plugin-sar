// This is the only module of the plugin that imports CloudTAK app internals, apart from lib/missions.ts
// (the Data Sync list), lib/DataSyncPicker.vue (a host component) and index.ts (the menu template).
// The plugin is built into the CloudTAK bundle (AGPL combined work) and these files are the app's own
// source of the server URL, the session token, downloads and the mobile flag.
import { downloadBlob, getRuntimeToken, serverUrl } from '../../../src/std.ts';
import { useAppStore } from '../../../src/stores/app.ts';
import type { Host } from './types.ts';

export const host: Host = {
    origin: () => String(serverUrl).replace(/\/+$/, ''),
    token: () => getRuntimeToken(),
    fetch: (input, init) => fetch(input, init),
};

/** The host shows menu routes as a near-full-screen modal on mobile, which covers the map. */
export function isMobile(): boolean {
    try {
        return useAppStore().isMobileDetected === true;
    } catch {
        return false;
    }
}

/** Save a blob as a file through the browser's download. */
export function saveBlob(blob: Blob, name: string): void {
    downloadBlob(blob, new Response(null), name);
}
