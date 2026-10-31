import {
    ID_PREFIX, LAYER_FILL, LAYER_IPP, LAYER_LABEL, LAYER_OUTLINE, SOURCE_CONTOURS, SOURCE_IPP, SOURCE_LABELS,
} from './constants.ts';
import { contourFeatures, ippPoint, labelPoints } from './result.ts';
import type { Bbox, TravelTimeResult } from './types.ts';

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
    /** Shown in the map's attribution control while the source is drawn. HTML, so the text is escaped. */
    attribution?: string;
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

/** The subset of the MapLibre map the layers write to. */
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
    on(type: string, listener: () => void): unknown;
    off(type: string, listener: () => void): unknown;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * The engine's attribution lines as one string for the map's attribution control, which renders
 * HTML: every character that could start markup is escaped. Empty when there are no lines.
 */
export function attributionText(result: TravelTimeResult): string {
    return result.attribution.map((line) => line.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])).join(' | ');
}

/** Minimum time between two checks on `idle`. */
export const IDLE_THROTTLE_MS = 500;
/** Space around the fitted bounds. The bottom is larger because the panel covers the lower part of the map. */
export const FIT_PADDING = { top: 40, right: 40, bottom: 320, left: 40 };

const ours = (id: string): boolean => id.startsWith(ID_PREFIX);

/**
 * First layer of the Map Features (CoT) overlay, or the first symbol layer.
 * The contours go directly below it so markers stay on top. undefined = top of the stack.
 */
export function markerAnchor(style: StyleLike): string | undefined {
    return style.layers.find((l) => !ours(l.id) && l.source === '-1')?.id
        ?? style.layers.find((l) => !ours(l.id) && l.type === 'symbol')?.id;
}


/** Bottom to top. */
const LAYER_ORDER = [LAYER_FILL, LAYER_OUTLINE, LAYER_LABEL, LAYER_IPP];

function layerSpecs(): LayerSpec[] {
    return [
        {
            id: LAYER_FILL,
            type: 'fill',
            source: SOURCE_CONTOURS,
            // A higher sort key draws later (on top), so the longest band, which has the lowest key, is underneath.
            layout: { 'fill-sort-key': ['-', 0, ['get', 'hours']] },
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
        },
        {
            id: LAYER_OUTLINE,
            type: 'line',
            source: SOURCE_CONTOURS,
            layout: { 'line-join': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 },
        },
        {
            id: LAYER_LABEL,
            type: 'symbol',
            source: SOURCE_LABELS,
            layout: {
                'text-field': ['get', 'text'],
                'text-font': ['Open Sans Bold'],
                'text-size': 14,
                'text-allow-overlap': true,
            },
            paint: { 'text-color': '#111111', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
        },
        {
            id: LAYER_IPP,
            type: 'circle',
            source: SOURCE_IPP,
            paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': '#111111', 'circle-stroke-width': 3 },
        },
    ];
}

const reducedMotion = (): boolean => {
    try {
        return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
        return false;
    }
};

/**
 * The contours of one result and the start point, as MapLibre sources and layers.
 * Everything is owned by this class: `clear()` and `dispose()` leave no layer, source or listener.
 * Map listeners (`style.load`, throttled `idle`) exist only while something is shown.
 */
export class SarLayers {
    private result: TravelTimeResult | null = null;
    private attributionUsed = '';
    private ipp: [number, number] | null = null;
    private listening = false;
    private disposed = false;
    private lastIdle = Number.NEGATIVE_INFINITY;
    /** Padding used by fitBounds; the host may change it. */
    fitPadding = { ...FIT_PADDING };

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

    /** Draw a result and fit the map to its bounds. */
    show(result: TravelTimeResult): void {
        if (this.disposed) return;
        this.result = result;
        // A source keeps the attribution it was created with: re-create it when the text changes.
        if (attributionText(result) !== this.attributionUsed) {
            this.removeLayerAndSource([LAYER_FILL, LAYER_OUTLINE], SOURCE_CONTOURS);
        }
        this.attach();
        this.ensure();
        this.setData(SOURCE_CONTOURS, { type: 'FeatureCollection', features: contourFeatures(result) });
        this.setData(SOURCE_LABELS, { type: 'FeatureCollection', features: labelPoints(result) });
        if (result.bbox) this.fit(result.bbox);
    }

    /** Show or hide the start point. */
    setIpp(lngLat: [number, number] | null): void {
        if (this.disposed) return;
        this.ipp = lngLat;
        if (lngLat) {
            this.attach();
            this.ensure();
            this.setData(SOURCE_IPP, { type: 'FeatureCollection', features: [ippPoint(lngLat[0], lngLat[1])] });
        } else {
            this.removeIpp();
            this.detachIfIdle();
        }
    }

    /** Remove everything this class drew, and its listeners. */
    clear(): void {
        this.result = null;
        this.ipp = null;
        this.removeAll();
        this.detach();
    }

    dispose(): void {
        this.clear();
        this.disposed = true;
    }

    /**
     * Add what is missing (after a style reload, or when something removed it) and keep the
     * layers below the marker layers. Cheap when nothing has changed.
     */
    ensure(): void {
        if (this.disposed || (!this.result && !this.ipp)) return;
        const style = this.map.getStyle();
        if (!style) return;
        const anchor = markerAnchor(style);
        if (this.result) {
            this.ensureSource(SOURCE_CONTOURS, { type: 'FeatureCollection', features: contourFeatures(this.result) }, attributionText(this.result));
            this.ensureSource(SOURCE_LABELS, { type: 'FeatureCollection', features: labelPoints(this.result) });
            for (const spec of layerSpecs()) {
                if (spec.id !== LAYER_IPP) this.ensureLayer(spec, anchor);
            }
        }
        if (this.ipp) {
            this.ensureSource(SOURCE_IPP, { type: 'FeatureCollection', features: [ippPoint(this.ipp[0], this.ipp[1])] });
            this.ensureLayer(layerSpecs().find((l) => l.id === LAYER_IPP) as LayerSpec, anchor);
        }
        this.keepBelow(anchor);
    }

    /** Ids of our layers in the style, bottom to top. For tests. */
    get layerIds(): string[] {
        return (this.map.getStyle()?.layers ?? []).map((l) => l.id).filter(ours);
    }

    /** Whether the map listeners are registered. For tests. */
    get isListening(): boolean {
        return this.listening;
    }

    private ensureSource(id: string, data: GeoJsonData, attribution = ''): void {
        if (this.map.getSource(id)) return;
        this.map.addSource(id, attribution ? { type: 'geojson', data, attribution } : { type: 'geojson', data });
        if (id === SOURCE_CONTOURS) this.attributionUsed = attribution;
    }

    private ensureLayer(spec: LayerSpec, anchor: string | undefined): void {
        if (!this.map.getLayer(spec.id)) this.map.addLayer(spec, this.beforeFor(spec.id, anchor));
    }

    /** The next layer of ours above `id` that exists, else the anchor, so the order stays fill, outline, label, start point. */
    private beforeFor(id: string, anchor: string | undefined): string | undefined {
        for (const above of LAYER_ORDER.slice(LAYER_ORDER.indexOf(id) + 1)) {
            if (this.map.getLayer(above)) return above;
        }
        return anchor;
    }

    /** Move our layers below the anchor when a marker layer was added under them. */
    private keepBelow(anchor: string | undefined): void {
        if (anchor === undefined) return;
        const ids = (this.map.getStyle()?.layers ?? []).map((l) => l.id);
        const at = ids.indexOf(anchor);
        if (at < 0) return;
        for (const id of LAYER_ORDER) {
            const i = ids.indexOf(id);
            if (i > at) this.map.moveLayer(id, anchor);
        }
    }

    private setData(id: string, data: GeoJsonData): void {
        const source = this.map.getSource(id) as { setData?: (d: GeoJsonData) => void } | undefined;
        source?.setData?.(data);
    }

    private fit(b: Bbox): void {
        this.map.fitBounds([[b.west, b.south], [b.east, b.north]], {
            padding: { ...this.fitPadding },
            duration: reducedMotion() ? 0 : 500,
        });
    }

    private removeLayerAndSource(layers: string[], source: string): void {
        for (const id of layers) {
            if (this.map.getLayer(id)) this.map.removeLayer(id);
        }
        if (this.map.getSource(source)) this.map.removeSource(source);
    }

    private removeIpp(): void {
        this.removeLayerAndSource([LAYER_IPP], SOURCE_IPP);
    }

    private removeAll(): void {
        this.removeLayerAndSource([LAYER_FILL, LAYER_OUTLINE], SOURCE_CONTOURS);
        this.removeLayerAndSource([LAYER_LABEL], SOURCE_LABELS);
        this.removeIpp();
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

    private detachIfIdle(): void {
        if (!this.result && !this.ipp) this.detach();
    }
}
