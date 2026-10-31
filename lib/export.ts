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

const MODE_SHORT = { 'travel-time': 'Travel Time', tarr: 'TARR' } as const;
const MODE_TITLE = { 'travel-time': 'Travel Time', tarr: 'TARR Analysis' } as const;

/** The name of the KMZ in Files: `SAR <mode> <YYYYMMDD-HHMM>Z.kmz`. The time keeps repeated runs apart. */
export function exportFileName(meta: RunMeta): string {
    return `SAR ${MODE_SHORT[meta.mode]} ${formatStamp(meta.ranAt)}.kmz`;
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

/** The disclaimer and the attribution lines as one text, for the KML description. */
export function noticeText(result: AnalysisResult): string {
    const parts: string[] = [];
    if (result.disclaimer) parts.push(result.disclaimer);
    if (result.mode === 'tarr') {
        parts.push('Not calibrated for New Zealand. The ring percentages come from United States search records and are not the chance of finding someone in New Zealand.');
    }
    if (result.attribution.length) parts.push(`Data: ${result.attribution.join('; ')}`);
    return parts.join('\n');
}

/**
 * A KMZ (a zip with one `doc.kml`) built from the features as they are now, including edits made on
 * the map. The document description carries the parameters, the disclaimer and the attribution.
 * Everything is built here; saving it to Files is a separate step.
 */
export function buildKmz(features: readonly SarFeature[], result: AnalysisResult, meta: RunMeta): ExportFile {
    const description = [`Run: ${formatUtc(meta.ranAt)}`, ...parameterLines(result, meta), '', noticeText(result)].join('\n').trim();
    const kml = buildKml(features, { name: `SAR ${MODE_TITLE[meta.mode]} ${formatUtc(meta.ranAt)}`, description });
    const bytes = zipStore([{ name: 'doc.kml', data: new TextEncoder().encode(kml) }]);
    return { filename: exportFileName(meta), bytes, mime: 'application/vnd.google-earth.kmz' };
}
