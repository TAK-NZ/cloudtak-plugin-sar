import { describe, expect, it, vi } from 'vitest';
import { saveToFiles } from '../lib/files.ts';
import type { ExportFile } from '../lib/export.ts';
import type { Host } from '../lib/types.ts';
import { jsonResponse } from './fixtures.ts';
const file: ExportFile = { filename: 'SAR TARR 20260301-1205Z.kmz', bytes: new Uint8Array([80, 75]), mime: 'application/vnd.google-earth.kmz' };
const uploaded = (): Response => jsonResponse(200, { imports: [{ file: file.filename, uid: 'u 1', ext: '.kmz' }] });
function hostWith(handler: (url: string, init: RequestInit) => Promise<Response>): Host & { fetch: ReturnType<typeof vi.fn> } {
    return { origin: () => 'https://cot.test', token: async () => 'tok', fetch: vi.fn(handler) };
}
const instant = async (): Promise<void> => undefined;
describe('saveToFiles', () => {
    it('PUTs the file as multipart form data and waits for the import to succeed', async () => {
        const answers = [{ status: 'Pending' }, { status: 'Running' }, { status: 'Success' }];
        const host = hostWith(async (url) => (url.endsWith('/api/import') ? uploaded() : jsonResponse(200, answers.shift())));
        const status: string[] = [];
        const result = await saveToFiles(host, file, { sleep: instant, onStatus: (t) => status.push(t) });
        expect(result).toEqual({ finished: true });
        const [url, init] = host.fetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://cot.test/api/import');
        expect(init.method).toBe('PUT');
        const sent = (init.body as FormData).get('file') as File;
        expect(sent.name).toBe(file.filename);
        expect(host.fetch.mock.calls.map((c) => c[0])).toEqual([
            'https://cot.test/api/import', 'https://cot.test/api/import/u%201', 'https://cot.test/api/import/u%201', 'https://cot.test/api/import/u%201',
        ]);
        expect(status).toEqual(['Uploading to Files...', 'Files is reading the KMZ...']);
    });
    it('stops waiting at the limit and says it did not finish', async () => {
        const host = hostWith(async (url) => (url.endsWith('/api/import') ? uploaded() : jsonResponse(200, { status: 'Running' })));
        expect(await saveToFiles(host, file, { sleep: instant, maxWaitMs: 0 })).toEqual({ finished: false });
        expect(host.fetch).toHaveBeenCalledTimes(2);
    });
    it('stops waiting when cancelled', async () => {
        let cancelled = false;
        const host = hostWith(async (url) => {
            if (url.endsWith('/api/import')) return uploaded();
            cancelled = true;
            return jsonResponse(200, { status: 'Running' });
        });
        expect(await saveToFiles(host, file, { sleep: instant, cancelled: () => cancelled })).toEqual({ finished: false });
        expect(host.fetch).toHaveBeenCalledTimes(2);
    });
    it('throws the import error, and a plain message when there is none', async () => {
        const failing = (error: unknown) => hostWith(async (url) => (url.endsWith('/api/import') ? uploaded() : jsonResponse(200, { status: 'Fail', error })));
        await expect(saveToFiles(failing('No features'), file, { sleep: instant })).rejects.toThrow('Files could not read the KMZ. No features');
        await expect(saveToFiles(failing(null), file, { sleep: instant })).rejects.toThrow(/^Files could not read the KMZ\.$/);
    });
    it('throws when the upload gives no id', async () => {
        const host = hostWith(async () => jsonResponse(200, { imports: [] }));
        await expect(saveToFiles(host, file, { sleep: instant })).rejects.toThrow('Files did not accept the upload.');
    });
    it('throws the server message of a refused upload', async () => {
        const host = hostWith(async () => jsonResponse(400, { message: 'Unsupported Content-Type' }));
        await expect(saveToFiles(host, file)).rejects.toThrow('Unsupported Content-Type');
    });
});
