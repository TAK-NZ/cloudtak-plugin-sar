import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPicking } from '../lib/picker.ts';
import { EventedFakeMap } from './helpers.ts';

afterEach(() => {
    document.body.replaceChildren();
});

describe('startPicking', () => {
    it('sets a crosshair, reports one click and resets the cursor', () => {
        const map = new EventedFakeMap();
        const onPick = vi.fn();
        const onCancel = vi.fn();
        startPicking(map, onPick, onCancel);
        expect(map.cursor).toBe('crosshair');
        map.click(172.5, -40.5);
        expect(onPick).toHaveBeenCalledWith(172.5, -40.5);
        expect(map.cursor).toBe('');
        map.click(173, -41);
        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
        expect(map.listenerCount()).toBe(0);
    });

    it('Escape cancels, prevents the default and resets the cursor', () => {
        const map = new EventedFakeMap();
        const onPick = vi.fn();
        const onCancel = vi.fn();
        startPicking(map, onPick, onCancel);
        const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        document.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(map.cursor).toBe('');
        expect(map.listenerCount()).toBe(0);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('other keys do nothing', () => {
        const map = new EventedFakeMap();
        const onCancel = vi.fn();
        startPicking(map, vi.fn(), onCancel);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(onCancel).not.toHaveBeenCalled();
        expect(map.cursor).toBe('crosshair');
    });

    it('the stop function resets the cursor without calling a callback, and can be called twice', () => {
        const map = new EventedFakeMap();
        const onPick = vi.fn();
        const onCancel = vi.fn();
        const stop = startPicking(map, onPick, onCancel);
        stop();
        stop();
        expect(map.cursor).toBe('');
        map.click(172, -40);
        expect(onPick).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('ignores a click without a usable position', () => {
        const map = new EventedFakeMap();
        const onPick = vi.fn();
        startPicking(map, onPick, vi.fn());
        map.emit('click', {});
        map.emit('click', { lngLat: { lng: Number.NaN, lat: 1 } });
        map.emit('click', { lngLat: { lng: '172' as unknown as number, lat: -40 } });
        expect(onPick).not.toHaveBeenCalled();
        expect(map.cursor).toBe('crosshair');
    });
});
