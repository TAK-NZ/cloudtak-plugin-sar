export interface PickEvent {
    lngLat?: { lng?: unknown; lat?: unknown };
}

/** The subset of the MapLibre map the picker uses. */
export interface PickMap {
    getCanvas(): { style: { cursor: string } };
    on(type: string, listener: (e: PickEvent) => void): unknown;
    off(type: string, listener: (e: PickEvent) => void): unknown;
}

/**
 * Wait for one click on the map. The cursor is a crosshair meanwhile. Escape cancels.
 * The returned function stops picking without calling either callback and always resets
 * the cursor.
 */
export function startPicking(map: PickMap, onPick: (lng: number, lat: number) => void, onCancel: () => void): () => void {
    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    let stopped = false;
    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        try {
            map.off('click', onClick);
        } catch {
            // The map is gone.
        }
        if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey, true);
        try {
            canvas.style.cursor = '';
        } catch {
            // The map is gone.
        }
    };
    function onClick(e: PickEvent): void {
        const lng = e?.lngLat?.lng;
        const lat = e?.lngLat?.lat;
        if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
        stop();
        onPick(lng, lat);
    }
    // Capture phase and preventDefault: the plugin's own Escape handler (close the panel) then leaves the key alone.
    function onKey(e: KeyboardEvent): void {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        stop();
        onCancel();
    }
    map.on('click', onClick);
    if (typeof document !== 'undefined') document.addEventListener('keydown', onKey, true);
    return stop;
}
