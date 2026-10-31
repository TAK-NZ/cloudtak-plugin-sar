import { buildKml } from './kml.ts';
import { formatStamp, formatUtc } from './format.ts';
import type { SarFeature } from './features.ts';
import { zipStore } from './zip.ts';
import type { AnalysisResult, RunMeta } from './types.ts';

export interface ExportFile {
    filename: string;
    bytes: Uint8Array;
    mime: string;
}

const MODE_FILE = { 'travel-time': 'travel-time', tarr: 'tarr' } as const;
const MODE_TITLE = { 'travel-time': 'Travel Time', tarr: 'TARR Analysis' } as const;

/** The base name of the export files: `sar-<mode>-<YYYYMMDD-HHMM>Z`. */
export function exportBaseName(meta: RunMeta): string {
    return `sar-${MODE_FILE[meta.mode]}-${formatStamp(meta.ranAt)}`;
}

function parameterLines(result: AnalysisResult, meta: RunMeta): string[] {
    const lines = [`Start point: ${meta.ipp.lat.toFixed(5)}, ${meta.ipp.lng.toFixed(5)}`];
    if (result.mode === 'travel-time') {
        const speed = meta.speedKmh ?? result.parameters.speed_kmh;
        if (speed !== null && speed !== undefined) lines.push(`Speed: ${speed} km/h`);
        const bands = meta.bandsHours ?? result.parameters.intervals_hours;
        if (bands.length) lines.push(`Time bands: ${bands.join(', ')} h`);
        if (result.parameters.radius_km !== null) lines.push(`Effective radius: ${result.parameters.radius_km} km`);
        return lines;
    }
    lines.push(`Subject profile: ${meta.profile ?? result.parameters.profile}`);
    const eco = meta.ecoregion ?? result.parameters.ecoregion;
    const terrain = meta.terrain ?? result.parameters.terrain;
    if (eco) lines.push(`Ecoregion: ${eco}`);
    if (terrain) lines.push(`Terrain: ${terrain}`);
    const k = result.parameters.koesterKm;
    if (k) lines.push(`Koester distances (25%, 50%, 75%): ${k.p25}, ${k.p50}, ${k.p75} km`);
    const m = result.calibration?.multiplier;
    if (m) lines.push(`Multiplier used (25%, 50%, 75%): ${m.p25}, ${m.p50}, ${m.p75}${result.calibration?.region ? ` (${result.calibration.region})` : ''}`);
    const c = result.parameters.calibratedKm;
    if (c) lines.push(`Calibrated distances (25%, 50%, 75%): ${c.p25}, ${c.p50}, ${c.p75} km`);
    return lines;
}

/** The disclaimer and the attribution lines as one text, for the KML description and the README. */
export function noticeText(result: AnalysisResult): string {
    const parts: string[] = [];
    if (result.disclaimer) parts.push(result.disclaimer);
    if (result.mode === 'tarr') {
        parts.push('Not calibrated for New Zealand. The ring percentages come from United States search records and are not the chance of finding someone in New Zealand.');
    }
    if (result.attribution.length) parts.push(`Data: ${result.attribution.join('; ')}`);
    return parts.join('\n');
}

function readme(result: AnalysisResult, meta: RunMeta, base: string): string {
    return [
        `SAR ${MODE_TITLE[meta.mode]} export`,
        '',
        `Run: ${formatUtc(meta.ranAt)}`,
        ...parameterLines(result, meta),
        '',
        'Files',
        `  ${base}.kml      Polygons and the start point (IPP), with inner rings`,
        `  ${base}.geojson  The same features as GeoJSON`,
        '',
        noticeText(result),
        '',
    ].join('\n');
}

/**
 * One zip with the KML, the GeoJSON and a README, built from the features as they are now
 * (including edits made on the map). Everything is built here, nothing is sent anywhere.
 */
export function buildExportFiles(features: readonly SarFeature[], result: AnalysisResult, meta: RunMeta): ExportFile {
    const base = exportBaseName(meta);
    const notice = noticeText(result);
    const kml = buildKml(features, { name: `SAR ${MODE_TITLE[meta.mode]} ${formatUtc(meta.ranAt)}`, description: notice });
    const geojson = JSON.stringify({
        type: 'FeatureCollection',
        name: base,
        disclaimer: result.disclaimer,
        attribution: result.attribution,
        features: features.map((f) => ({ id: f.id, type: 'Feature', properties: f.properties, geometry: f.geometry })),
    }, null, 2);
    const enc = new TextEncoder();
    const bytes = zipStore([
        { name: `${base}.kml`, data: enc.encode(kml) },
        { name: `${base}.geojson`, data: enc.encode(geojson) },
        { name: 'README.txt', data: enc.encode(readme(result, meta, base)) },
    ]);
    return { filename: `${base}.zip`, bytes, mime: 'application/zip' };
}
