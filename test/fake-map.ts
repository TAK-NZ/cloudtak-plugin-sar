import type { FitOptions, GeoJsonData, GeoJsonSourceSpec, LayerSpec, MapLike, StyleLayerLike, StyleLike } from '../lib/layers.ts';

export interface FakeLayer extends StyleLayerLike {
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
}

export interface FakeSource {
    id: string;
    spec: GeoJsonSourceSpec | Record<string, unknown>;
    data: GeoJsonData | undefined;
    setData(data: GeoJsonData): void;
}

type Listener = () => void;

/**
 * Reproduces the MapLibre rules that matter here: addLayer and moveLayer insert directly
 * below `before` (append when undefined), unknown ids throw, a source in use cannot be
 * removed. It is evented, and a "style reload" drops everything that is not a base layer.
 */
export class FakeMap implements MapLike {
    layers: FakeLayer[];
    sources = new Map<string, FakeSource>();
    listeners = new Map<string, Set<Listener>>();
    fitCalls: { bounds: [[number, number], [number, number]]; options: FitOptions }[] = [];
    /** `getCanvas().style.cursor` reads and writes this. */
    cursor = '';
    counters = { addSource: 0, addLayer: 0, removeLayer: 0, removeSource: 0, moveLayer: 0 };

    constructor(initial?: FakeLayer[]) {
        this.layers = (initial ?? FakeMap.initialLayers()).map((l) => ({ ...l }));
        for (const l of this.layers) {
            if (l.source && !this.sources.has(l.source)) this.makeSource(l.source, {});
        }
    }

    static initialLayers(): FakeLayer[] {
        return [
            { id: 'background', type: 'background' },
            { id: 'basemap', type: 'raster', source: 'basemap' },
            { id: 'mf-polygons', type: 'fill', source: '-1' },
            { id: 'mf-lines', type: 'line', source: '-1' },
            { id: 'labels', type: 'symbol', source: 'labels-src' },
        ];
    }

    private makeSource(id: string, spec: FakeSource['spec']): void {
        const src: FakeSource = {
            id,
            spec,
            data: (spec as GeoJsonSourceSpec).data,
            setData: (data) => {
                src.data = data;
            },
        };
        this.sources.set(id, src);
    }

    getStyle(): StyleLike {
        return { layers: this.layers.map((l) => ({ id: l.id, type: l.type, source: l.source })) };
    }

    getLayer(id: string): FakeLayer | undefined {
        return this.layers.find((l) => l.id === id);
    }

    getSource(id: string): FakeSource | undefined {
        return this.sources.get(id);
    }

    addSource(id: string, spec: GeoJsonSourceSpec): void {
        if (this.sources.has(id)) throw new Error(`Source ${id} already exists`);
        this.counters.addSource++;
        this.makeSource(id, spec);
    }

    private insert(layer: FakeLayer, before?: string): void {
        if (before === undefined) {
            this.layers.push(layer);
            return;
        }
        const idx = this.layers.findIndex((l) => l.id === before);
        if (idx < 0) throw new Error(`Layer ${before} does not exist`);
        this.layers.splice(idx, 0, layer);
    }

    addLayer(spec: LayerSpec, before?: string): void {
        if (this.getLayer(spec.id)) throw new Error(`Layer ${spec.id} already exists`);
        if (!this.sources.has(spec.source)) throw new Error(`Source ${spec.source} not found`);
        this.counters.addLayer++;
        this.insert({ id: spec.id, type: spec.type, source: spec.source, paint: { ...spec.paint }, layout: { ...spec.layout } }, before);
    }

    /** A layer of another owner (not counted). */
    addForeign(layer: FakeLayer, before?: string): void {
        if (layer.source && !this.sources.has(layer.source)) this.makeSource(layer.source, {});
        this.insert({ ...layer }, before);
    }

    removeLayer(id: string): void {
        const idx = this.layers.findIndex((l) => l.id === id);
        if (idx < 0) throw new Error(`Layer ${id} does not exist`);
        this.counters.removeLayer++;
        this.layers.splice(idx, 1);
    }

    removeSource(id: string): void {
        if (!this.sources.has(id)) throw new Error(`Source ${id} does not exist`);
        if (this.layers.some((l) => l.source === id)) throw new Error(`Source ${id} is in use`);
        this.counters.removeSource++;
        this.sources.delete(id);
    }

    moveLayer(id: string, before?: string): void {
        const idx = this.layers.findIndex((l) => l.id === id);
        if (idx < 0) throw new Error(`Layer ${id} does not exist`);
        if (before !== undefined && !this.getLayer(before)) throw new Error(`Layer ${before} does not exist`);
        this.counters.moveLayer++;
        const [layer] = this.layers.splice(idx, 1);
        this.insert(layer, before);
    }

    fitBounds(bounds: [[number, number], [number, number]], options: FitOptions): void {
        this.fitCalls.push({ bounds, options });
    }

    on(type: string, listener: Listener): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)?.add(listener);
    }

    off(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
    }

    emit(type: string): void {
        for (const l of [...(this.listeners.get(type) ?? [])]) l();
    }

    listenerCount(): number {
        let n = 0;
        for (const set of this.listeners.values()) n += set.size;
        return n;
    }

    getCanvas(): { style: { cursor: string } } {
        return { style: this };
    }
    /** `getContainer()` returns this element, so a test can set CSS variables on it. */
    container = document.createElement('div');
    getContainer(): HTMLElement {
        return this.container;
    }

    /** What a style reload does to layers added with addLayer: everything not in `keep` goes. */
    reloadStyle(prefix: string): void {
        this.layers = this.layers.filter((l) => !l.id.startsWith(prefix));
        for (const id of [...this.sources.keys()]) {
            if (id.startsWith(prefix)) this.sources.delete(id);
        }
        this.emit('style.load');
    }
}
