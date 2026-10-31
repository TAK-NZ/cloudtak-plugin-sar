import type { PluginAPI } from '@tak-ps/cloudtak';
import { FILES_PATH, PACKAGE_PATH } from './constants.ts';
import { copyForMission } from './features.ts';
import type { SarFeature } from './features.ts';
import type { Host, MissionChoice } from './types.ts';

/** The part of the plugin API this module uses (PluginAPI['feature']). */
export type FeatureApi = Pick<PluginAPI['feature'], 'add' | 'remove'>;

/** The input type of `feature.add`. */
type AddInput = Parameters<FeatureApi['add']>[0];
const asInput = (features: readonly SarFeature[]): AddInput => features as unknown as AddInput;

/** A file name without path separators, reserved characters or control characters. */
export function safeFileName(name: string): string {
    return [...name].map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? '_' : c)).join('').trim() || 'sar';
}

const reason = (err: unknown): string => (err instanceof Error && err.message !== '' ? err.message : 'unknown error');

/**
 * Put the features of a result on the map. The previous ones (a run replaces the last result) are
 * removed first; a failure to remove is logged and does not stop the run. Returns the new ids.
 * When the add fails, whatever may have been added is removed again and the error is thrown.
 */
export async function placeFeatures(feature: FeatureApi, previousIds: readonly string[], features: readonly SarFeature[]): Promise<string[]> {
    if (previousIds.length) {
        try {
            await feature.remove([...previousIds]);
        } catch (err) {
            console.warn('[sar] Could not remove the previous features', err);
        }
    }
    const ids = features.map((f) => f.id);
    try {
        await feature.add(asInput(features));
    } catch (err) {
        try {
            await feature.remove(ids);
        } catch {
            // Nothing more to undo.
        }
        throw err;
    }
    return ids;
}

/**
 * File copies of the features in each chosen Data Sync, one Data Sync at a time. Every copy gets
 * fresh ids. Stops at the first failure and says how far it got. Resolves with the names done.
 */
export async function addToDataSync(
    feature: FeatureApi,
    features: readonly SarFeature[],
    missions: readonly MissionChoice[],
    newId?: () => string,
): Promise<string[]> {
    const done: string[] = [];
    for (const mission of missions) {
        try {
            await feature.add(asInput(copyForMission(features, newId)), { mission: mission.guid });
        } catch (err) {
            throw new Error(`Could not add to "${mission.name}": ${reason(err)} (${done.length} of ${missions.length} done)`, { cause: err });
        }
        done.push(mission.name);
    }
    return done;
}

export async function request(host: Host, path: string, init: RequestInit): Promise<Response> {
    let token: string | undefined;
    try {
        token = (await host.token()) || undefined;
    } catch {
        token = undefined;
    }
    if (!token) throw new Error('You are not signed in');
    const res = await host.fetch(host.origin() + path, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
    });
    if (!res.ok) {
        let message = `The server answered ${res.status}`;
        try {
            const body = await res.json() as { message?: unknown };
            if (typeof body.message === 'string' && body.message !== '') message = body.message;
        } catch {
            // Not JSON: the status is all there is.
        }
        throw new Error(message);
    }
    return res;
}

/**
 * Build a data package on the server from the features (CloudTAK's own route: the server turns each
 * feature into CoT and zips it), then fetch the zip. The package is private; with `missionGuids` it
 * is also filed in those Data Syncs. The server writes polygons without inner rings.
 */
export async function createDataPackage(
    host: Host,
    features: readonly SarFeature[],
    options: { name: string; missionGuids: readonly string[] },
): Promise<{ blob: Blob; filename: string }> {
    const put = await request(host, PACKAGE_PATH, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            type: 'FeatureCollection',
            name: options.name,
            public: false,
            groups: [],
            keywords: ['sar'],
            destinations: options.missionGuids.map((mission) => ({ mission })),
            assets: [],
            basemaps: [],
            features: features.map((f) => ({ id: f.properties.id ?? f.id, type: 'Feature', properties: f.properties, geometry: f.geometry })),
        }),
    });
    const content = await put.json() as { Hash?: unknown };
    if (typeof content.Hash !== 'string' || content.Hash === '') throw new Error('The server did not return the package');
    const filename = `${safeFileName(options.name)}.zip`;
    const file = await request(host, `${FILES_PATH}/${encodeURIComponent(content.Hash)}?name=${encodeURIComponent(filename)}`, { method: 'GET' });
    return { blob: await file.blob(), filename };
}
