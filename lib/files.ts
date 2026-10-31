import { IMPORT_MAX_WAIT_MS, IMPORT_PATH, IMPORT_POLL_MS } from './constants.ts';
import type { ExportFile } from './export.ts';
import { request } from './share.ts';
import type { Host } from './types.ts';

export interface SaveOptions {
    /** Called with a short text while the upload and the wait for Files go on. */
    onStatus?: (text: string) => void;
    /** True when the user left or the plugin was switched off: stop waiting. */
    cancelled?: () => boolean;
    pollMs?: number;
    maxWaitMs?: number;
    sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Put a file in the user's Files the way the Files menu upload does: a multipart PUT to the Imports
 * route, then the server converts it. Resolves with `finished: true` once the import succeeded, and
 * `finished: false` when it was uploaded but the wait ended first (still running, cancelled, or the
 * status could not be read). Rejects when the upload fails or Files cannot read the file.
 */
export async function saveToFiles(host: Host, file: ExportFile, options: SaveOptions = {}): Promise<{ finished: boolean }> {
    const { onStatus, cancelled, pollMs = IMPORT_POLL_MS, maxWaitMs = IMPORT_MAX_WAIT_MS, sleep = wait } = options;
    const form = new FormData();
    form.append('file', new Blob([file.bytes as BlobPart], { type: file.mime }), file.filename);
    onStatus?.('Uploading to Files...');
    const put = await request(host, IMPORT_PATH, { method: 'PUT', body: form, headers: { Accept: 'application/json' } });
    const body = await put.json() as { imports?: { uid?: unknown }[] };
    const uid = body.imports?.[0]?.uid;
    if (typeof uid !== 'string' || uid === '') throw new Error('Files did not accept the upload.');

    const deadline = Date.now() + maxWaitMs;
    onStatus?.('Files is reading the KMZ...');
    for (;;) {
        if (cancelled?.()) return { finished: false };
        let status: { status?: unknown; error?: unknown };
        try {
            const res = await request(host, `${IMPORT_PATH}/${encodeURIComponent(uid)}`, { method: 'GET', headers: { Accept: 'application/json' } });
            status = await res.json() as { status?: unknown; error?: unknown };
        } catch {
            // The file is uploaded; only the progress is unknown.
            return { finished: false };
        }
        if (status.status === 'Success') return { finished: true };
        if (status.status === 'Fail') {
            const detail = typeof status.error === 'string' && status.error.trim() !== '' ? ` ${status.error.trim()}` : '';
            throw new Error(`Files could not read the KMZ.${detail}`);
        }
        if (Date.now() >= deadline) return { finished: false };
        await sleep(pollMs);
    }
}
