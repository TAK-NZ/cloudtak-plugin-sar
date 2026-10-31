import { describe, expect, it } from 'vitest';
import { buildKmz, exportFileName, noticeText } from '../lib/export.ts';
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
const text = (d: Uint8Array): string => new TextDecoder().decode(d);
const parse = (kml: string): Document => new DOMParser().parseFromString(kml, 'application/xml');
describe('crc32', () => {
    it('matches the standard check value', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });
});
describe('buildKmz', () => {
    const features = buildFeatures(travel, travelMeta, (() => { let n = 0; return () => `id-${++n}`; })(), new Date('2026-03-01T12:05:00Z'));
    const file = buildKmz(features, travel, travelMeta);
    const entries = unzipEntries(file.bytes);
    it('names the file after the mode and the run time, so repeated runs stay apart', () => {
        expect(exportFileName(travelMeta)).toBe('SAR Travel Time 20260301-1205Z.kmz');
        expect(exportFileName(tarrMeta)).toBe('SAR TARR 20260301-1205Z.kmz');
        expect(file.filename).toBe('SAR Travel Time 20260301-1205Z.kmz');
        expect(file.mime).toBe('application/vnd.google-earth.kmz');
    });
    it('is a zip with one doc.kml and a correct CRC', () => {
        expect(entries.map((e) => e.name)).toEqual(['doc.kml']);
        expect(crc32(entries[0].data)).toBe(entries[0].crc);
    });
    it('writes a KML with every polygon and the IPP', () => {
        const xml = parse(text(entries[0].data));
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        expect([...xml.querySelectorAll('Placemark > name')].map((e) => e.textContent)).toEqual(['SAR 4 h', 'SAR 2 h', 'SAR 1 h', 'SAR IPP']);
        expect(xml.querySelector('Point > coordinates')?.textContent).toBe('172,-40,0');
    });
    it('puts the parameters, the disclaimer and the attribution in the document description', () => {
        const description = parse(text(entries[0].data)).querySelector('Document > description')?.textContent ?? '';
        expect(description).toContain('Run: 2026-03-01 12:05 UTC');
        expect(description).toContain('Speed: 2.5 km/h');
        expect(description).toContain('Time bands: 1, 2, 4 h');
        expect(description).toContain('Synthetic disclaimer text.');
        expect(description).toContain('Synthetic attribution one');
        expect(description).not.toContain('Not calibrated for New Zealand');
    });
});
describe('TARR KMZ', () => {
    const features = buildFeatures(tarr, tarrMeta);
    const entries = unzipEntries(buildKmz(features, tarr, tarrMeta).bytes);
    it('puts the not-calibrated statement and the multiplier in the description', () => {
        const description = parse(text(entries[0].data)).querySelector('Document > description')?.textContent ?? '';
        expect(description).toContain('Subject profile: Hiker');
        expect(description).toContain('Multiplier used (25%, 50%, 75%): 1.15, 1.15, 1.15 (Coconino County, Arizona)');
        expect(description).toContain('Koester distances (25%, 50%, 75%): 0.64, 1.77, 3.22 km');
        expect(description).toContain('Not calibrated for New Zealand');
        expect(noticeText(tarr)).toContain('not the chance of finding someone in New Zealand');
    });
    it('keeps the hole and the IPP', () => {
        const xml = parse(text(entries[0].data));
        expect(xml.getElementsByTagName('innerBoundaryIs')).toHaveLength(1);
        expect(xml.querySelector('Point')).not.toBeNull();
        expect(xml.querySelectorAll('Placemark')).toHaveLength(7);
    });
    it('escapes XML in names and remarks that come from the engine', () => {
        const nasty = parseResult(tarrBody({ disclaimer: 'A & <B> "C"' }), 'tarr') as TarrResult;
        const f = buildFeatures(nasty, tarrMeta);
        const xml = parse(text(unzipEntries(buildKmz(f, nasty, tarrMeta).bytes)[0].data));
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        expect(xml.querySelector('Document > description')?.textContent).toContain('A & <B> "C"');
    });
});
