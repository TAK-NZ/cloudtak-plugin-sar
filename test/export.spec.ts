import { describe, expect, it } from 'vitest';
import { buildExportFiles, exportBaseName, noticeText } from '../lib/export.ts';
import { crc32 } from '../lib/zip.ts';
import { buildFeatures } from '../lib/features.ts';
import { parseResult } from '../lib/result.ts';
import type { RunMeta, TarrResult, TravelTimeResult } from '../lib/types.ts';
import { okBody, tarrBody } from './fixtures.ts';
import { unzipEntries } from './unzip.ts';

const travelMeta: RunMeta = { mode: 'travel-time', ranAt: '2026-03-01T12:05:00Z', ipp: { lat: -40, lng: 172 }, speedKmh: 2.5, bandsHours: [1, 2, 4] };
const tarrMeta: RunMeta = { mode: 'tarr', ranAt: '2026-03-01T12:05:00Z', ipp: { lat: -40, lng: 172 }, profile: 'Hiker' };
const travel = parseResult(okBody()) as TravelTimeResult;
const tarr = parseResult(tarrBody(), 'tarr') as TarrResult;

const unzip = unzipEntries;
const text = (d: Uint8Array): string => new TextDecoder().decode(d);

describe('crc32', () => {
    it('matches the standard check value', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });
});

describe('buildExportFiles', () => {
    const features = buildFeatures(travel, travelMeta, (() => { let n = 0; return () => `id-${++n}`; })(), new Date('2026-03-01T12:05:00Z'));
    const file = buildExportFiles(features, travel, travelMeta);
    const entries = unzip(file.bytes);

    it('names the zip after the mode and the run time', () => {
        expect(exportBaseName(travelMeta)).toBe('sar-travel-time-20260301-1205Z');
        expect(exportBaseName(tarrMeta)).toBe('sar-tarr-20260301-1205Z');
        expect(file.filename).toBe('sar-travel-time-20260301-1205Z.zip');
        expect(file.mime).toBe('application/zip');
    });

    it('holds the KML, the GeoJSON and a README, each with a correct CRC', () => {
        expect(entries.map((e) => e.name)).toEqual([
            'sar-travel-time-20260301-1205Z.kml', 'sar-travel-time-20260301-1205Z.geojson', 'README.txt',
        ]);
        for (const e of entries) expect(crc32(e.data), e.name).toBe(e.crc);
    });

    it('writes a KML with every polygon and the IPP', () => {
        const xml = new DOMParser().parseFromString(text(entries[0].data), 'application/xml');
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        expect([...xml.querySelectorAll('Placemark > name')].map((e) => e.textContent)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(xml.querySelector('Point > coordinates')?.textContent).toBe('172,-40,0');
        expect(xml.querySelector('Document > description')?.textContent).toContain('Synthetic disclaimer text.');
        expect(xml.querySelector('Document > description')?.textContent).toContain('Synthetic attribution one');
    });

    it('writes a GeoJSON that equals the features, with the disclaimer and attribution as members', () => {
        const gj = JSON.parse(text(entries[1].data)) as Record<string, unknown>;
        expect(gj.type).toBe('FeatureCollection');
        expect(gj.disclaimer).toBe('Synthetic disclaimer text.');
        expect(gj.attribution).toEqual(['Synthetic attribution one', 'Synthetic attribution two']);
        expect(gj.features).toEqual(features.map((f) => ({ id: f.id, type: 'Feature', properties: f.properties, geometry: f.geometry })));
        expect((gj.features as { properties: { callsign: string } }[]).at(-1)?.properties.callsign).toBe('SAR IPP');
    });

    it('writes a README with the parameters, the disclaimer and the attribution', () => {
        const readme = text(entries[2].data);
        expect(readme).toContain('SAR Travel Time export');
        expect(readme).toContain('Run: 2026-03-01 12:05 UTC');
        expect(readme).toContain('Speed: 2.5 km/h');
        expect(readme).toContain('Time bands: 1, 2, 4 h');
        expect(readme).toContain('Synthetic disclaimer text.');
        expect(readme).toContain('Synthetic attribution two');
        expect(readme).not.toContain('Not calibrated for New Zealand');
    });
});

describe('TARR export', () => {
    const features = buildFeatures(tarr, tarrMeta);
    const entries = unzip(buildExportFiles(features, tarr, tarrMeta).bytes);

    it('puts the not-calibrated statement and the multiplier in the README', () => {
        const readme = text(entries[2].data);
        expect(readme).toContain('SAR TARR Analysis export');
        expect(readme).toContain('Subject profile: Hiker');
        expect(readme).toContain('Multiplier used (25%, 50%, 75%): 1.15, 1.15, 1.15 (Coconino County, Arizona)');
        expect(readme).toContain('Koester distances (25%, 50%, 75%): 0.64, 1.77, 3.22 km');
        expect(readme).toContain('Not calibrated for New Zealand');
        expect(noticeText(tarr)).toContain('not the chance of finding someone in New Zealand');
    });

    it('keeps the hole in the KML and the GeoJSON, and the IPP in both', () => {
        const xml = new DOMParser().parseFromString(text(entries[0].data), 'application/xml');
        expect(xml.getElementsByTagName('innerBoundaryIs')).toHaveLength(1);
        expect(xml.querySelector('Point')).not.toBeNull();
        const gj = JSON.parse(text(entries[1].data)) as { features: { properties: { callsign: string }; geometry: { type: string; coordinates: unknown[] } }[] };
        expect(gj.features).toHaveLength(7);
        expect(gj.features[1].geometry.coordinates).toHaveLength(2);
        expect(gj.features[6].properties.callsign).toBe('SAR IPP');
    });

    it('escapes XML in names and remarks that come from the engine', () => {
        const nasty = parseResult(tarrBody({ disclaimer: 'A & <B> "C"' }), 'tarr') as TarrResult;
        const f = buildFeatures(nasty, tarrMeta);
        const xml = new DOMParser().parseFromString(text(unzip(buildExportFiles(f, nasty, tarrMeta).bytes)[0].data), 'application/xml');
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        expect(xml.querySelector('Document > description')?.textContent).toContain('A & <B> "C"');
    });
});
