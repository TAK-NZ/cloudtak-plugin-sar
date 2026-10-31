import { ID_PREFIX, LAYER_IPP, SOURCE_IPP } from './constants.ts';
import { ippPoint } from './result.ts';
import type { Bbox } from './types.ts';

export interface StyleLayerLike {
    id: string;
    type?: string;
    source?: string;
}

export interface StyleLike {
    layers: StyleLayerLike[];
}

export interface GeoJsonData {
    type: 'FeatureCollection';
    features: unknown[];
}

export interface GeoJsonSourceSpec {
    type: 'geojson';
    data: GeoJsonData;
}

export interface LayerSpec {
    id: string;
    type: 'fill' | 'line' | 'symbol' | 'circle';
    source: string;
    layout?: Record<string, unknown>;
    paint?: Record<string, unknown>;
}

export interface FitOptions {
    padding: { top: number; right: number; bottom: number; left: number };
    duration: number;
}

/** The subset of the MapLibre map the preview writes to. */
export interface MapLike {
    getStyle(): StyleLike | undefined;
    getLayer(id: string): unknown;
    getSource(id: string): unknown;
    addSource(id: string, spec: GeoJsonSourceSpec): unknown;
    addLayer(spec: LayerSpec, beforeId?: string): unknown;
    removeLayer(id: string): unknown;
    removeSource(id: string): unknown;
    moveLayer(id: string, beforeId?: string): unknown;
    fitBounds(bounds: [[number, number], [number, number]], options: FitOptions): unknown;
    getContainer?(): Element;
    on(type: string, listener: () => void): unknown;
    off(type: string, listener: () => void): unknown;
}

/** Minimum time between two checks on `idle`. */
export const IDLE_THROTTLE_MS = 500;
/** Space around the fitted bounds, in px. The host's side offset is added on the right. */
export const FIT_PADDING = 40;

const ours = (id: string): boolean => id.startsWith(ID_PREFIX);

/**
 * First layer of the Map Features (CoT) overlay, or the first symbol layer.
 * The preview goes directly below it so markers stay on top. undefined = top of the stack.
 */
export function markerAnchor(style: StyleLike): string | undefined {
    return style.layers.find((l) => !ours(l.id) && l.source === '-1')?.id
        ?? style.layers.find((l) => !ours(l.id) && l.type === 'symbol')?.id;
}

const reducedMotion = (): boolean => {
    try {
        return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
        return false;
    }
};

/** The width in px that the host's side pane covers on the right of the map; 0 when unknown. */
function sideOffset(map: MapLike): number {
    try {
        const el = map.getContainer?.();
        if (!el || typeof getComputedStyle !== 'function') return 0;
        const n = Number.parseFloat(getComputedStyle(el).getPropertyValue('--map-side-offset'));
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

/**
 * The start point preview: a dot shown while the start point is valid and no result exists yet.
 * The results themselves are CloudTAK features, not layers of this class.
 * Everything is owned by this class: `clear()` and `dispose()` leave no layer, source or listener.
 * Map listeners (`style.load`, throttled `idle`) exist only while the dot is shown.
 */
export class SarLayers {
    private ipp: [number, number] | null = null;
    private listening = false;
    private disposed = false;
    private lastIdle = Number.NEGATIVE_INFINITY;

    constructor(private readonly map: MapLike) {}

    private readonly onStyleLoad = (): void => {
        this.ensure();
    };

    private readonly onIdle = (): void => {
        const now = Date.now();
        if (now - this.lastIdle < IDLE_THROTTLE_MS) return;
        this.lastIdle = now;
        this.ensure();
    };

    /** Show or hide the start point. */
    setIpp(lngLat: [number, number] | null): void {
        if (this.disposed) return;
        this.ipp = lngLat;
        if (lngLat) {
            this.attach();
            this.ensure();
            this.setData({ type: 'FeatureCollection', features: [ippPoint(lngLat[0], lngLat[1])] });
        } else {
            this.remove();
            this.detach();
        }
    }

    /** Fit the map to the bounds, leaving room for the host's side pane. */
    fit(b: Bbox): void {
        if (this.disposed) return;
        const pad = FIT_PADDING;
        this.map.fitBounds([[b.west, b.south], [b.east, b.north]], {
            padding: { top: pad, right: pad + sideOffset(this.map), bottom: pad, left: pad },
            duration: reducedMotion() ? 0 : 500,
        });
    }

    /** Remove everything this class drew, and its listeners. */
    clear(): void {
        this.ipp = null;
        this.remove();
        this.detach();
    }

    dispose(): void {
        this.clear();
        this.disposed = true;
    }

    /**
     * Add what is missing (after a style reload, or when something removed it) and keep the dot
     * below the marker layers. Cheap when nothing has changed.
     */
    ensure(): void {
        if (this.disposed || !this.ipp) return;
        const style = this.map.getStyle();
        if (!style) return;
        const anchor = markerAnchor(style);
        if (!this.map.getSource(SOURCE_IPP)) {
            this.map.addSource(SOURCE_IPP, { type: 'geojson', data: { type: 'FeatureCollection', features: [ippPoint(this.ipp[0], this.ipp[1])] } });
        }
        if (!this.map.getLayer(LAYER_IPP)) {
            this.map.addLayer({
                id: LAYER_IPP,
                type: 'circle',
                source: SOURCE_IPP,
                paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': '#111111', 'circle-stroke-width': 3 },
            }, anchor);
        } else if (anchor !== undefined) {
            const ids = style.layers.map((l) => l.id);
            const at = ids.indexOf(anchor);
            if (at >= 0 && ids.indexOf(LAYER_IPP) > at) this.map.moveLayer(LAYER_IPP, anchor);
        }
    }

    /** Ids of our layers in the style, bottom to top. For tests. */
    get layerIds(): string[] {
        return (this.map.getStyle()?.layers ?? []).map((l) => l.id).filter(ours);
    }

    /** Whether the map listeners are registered. For tests. */
    get isListening(): boolean {
        return this.listening;
    }

    private setData(data: GeoJsonData): void {
        const source = this.map.getSource(SOURCE_IPP) as { setData?: (d: GeoJsonData) => void } | undefined;
        source?.setData?.(data);
    }

    private remove(): void {
        if (this.map.getLayer(LAYER_IPP)) this.map.removeLayer(LAYER_IPP);
        if (this.map.getSource(SOURCE_IPP)) this.map.removeSource(SOURCE_IPP);
    }

    private attach(): void {
        if (this.listening) return;
        this.listening = true;
        this.map.on('style.load', this.onStyleLoad);
        this.map.on('idle', this.onIdle);
    }

    private detach(): void {
        if (!this.listening) return;
        this.listening = false;
        this.map.off('style.load', this.onStyleLoad);
        this.map.off('idle', this.onIdle);
    }
}
