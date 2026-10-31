/** A minimal reader for a store-only zip: the local headers in order. */
export interface UnzippedEntry {
    name: string;
    data: Uint8Array;
    crc: number;
}

export function unzipEntries(data: Uint8Array): UnzippedEntry[] {
    const out: UnzippedEntry[] = [];
    let offset = 0;
    while (offset + 30 <= data.length) {
        const view = new DataView(data.buffer, data.byteOffset + offset, data.length - offset);
        if (view.getUint32(0, true) !== 0x04034b50) break;
        if (view.getUint16(8, true) !== 0) throw new Error('Not a store-only zip');
        const size = view.getUint32(18, true);
        const nameLength = view.getUint16(26, true);
        const start = offset + 30 + nameLength + view.getUint16(28, true);
        out.push({
            name: new TextDecoder().decode(data.subarray(offset + 30, offset + 30 + nameLength)),
            data: data.slice(start, start + size),
            crc: view.getUint32(14, true),
        });
        offset = start + size;
    }
    return out;
}

/** The bytes of a Blob. jsdom's Blob has no arrayBuffer(), so a FileReader does it. */
export function blobBytes(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}
