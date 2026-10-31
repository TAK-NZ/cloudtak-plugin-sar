import { describe, expect, it } from 'vitest';
import { buildKml, kmlColor, xmlEscape } from '../lib/kml.ts';
import type { SarFeature } from '../lib/features.ts';

const polygon = (extra: Record<string, unknown> = {}, geometry: SarFeature['geometry'] = {
    type: 'Polygon',
    coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]],
}): SarFeature => ({
    id: 'a',
    type: 'Feature',
    path: '/SAR/',
    properties: { id: 'a', type: 'u-d-f', callsign: 'SAR 2 h', remarks: 'Remarks', stroke: '#ff0000', 'stroke-width': 3, 'stroke-opacity': 1, fill: '#ff0000', 'fill-opacity': 0.15, ...extra },
    geometry,
});
const ipp: SarFeature = {
    id: 'p', type: 'Feature', path: '/SAR/',
    properties: { id: 'p', type: 'u-d-p', callsign: 'SAR IPP', remarks: 'Initial Planning Point.', 'marker-color': '#FFD600', 'marker-opacity': 1 },
    geometry: { type: 'Point', coordinates: [172, -40] },
};
const doc = { name: 'Doc', description: 'Disclaimer' };
const parse = (xml: string): Document => new DOMParser().parseFromString(xml, 'application/xml');

describe('xmlEscape', () => {
    it('escapes & < > " and \'', () => {
        expect(xmlEscape(`a & b < c > d "e" 'f'`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
    });
    it('drops characters XML does not allow', () => {
        expect(xmlEscape('a\u0000b\u0008c\u001fd\te\nf')).toBe('abcd\te\nf');
    });
});

describe('kmlColor', () => {
    it('converts #rrggbb and an opacity to aabbggrr', () => {
        expect(kmlColor('#ff8040', 1)).toBe('ff4080ff');
        expect(kmlColor('#ff8040', 0)).toBe('004080ff');
        expect(kmlColor('#ff0000', 0.15)).toBe('260000ff');
    });
    it('falls back for a bad colour and clamps the opacity', () => {
        expect(kmlColor('red', 1)).toBe('ffff8833');
        expect(kmlColor('#ff0000', 5)).toBe('ff0000ff');
        expect(kmlColor('#ff0000', Number.NaN)).toBe('ff0000ff');
    });
});

describe('buildKml', () => {
    it('is well-formed XML with a Document, Styles and one Placemark per feature', () => {
        const xml = parse(buildKml([polygon(), ipp], doc));
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        expect(xml.documentElement.namespaceURI).toBe('http://www.opengis.net/kml/2.2');
        expect(xml.getElementsByTagName('Placemark')).toHaveLength(2);
        expect(xml.querySelector('Document > name')?.textContent).toBe('Doc');
        expect(xml.querySelector('Document > description')?.textContent).toBe('Disclaimer');
        expect(xml.getElementsByTagName('Style')).toHaveLength(2);
    });

    it('keeps the inner ring of a polygon as innerBoundaryIs', () => {
        const xml = parse(buildKml([polygon()], doc));
        expect(xml.getElementsByTagName('outerBoundaryIs')).toHaveLength(1);
        const inner = xml.getElementsByTagName('innerBoundaryIs');
        expect(inner).toHaveLength(1);
        expect(inner[0].getElementsByTagName('coordinates')[0].textContent).toBe('1,1,0 2,1,0 2,2,0 1,2,0 1,1,0');
        expect(xml.getElementsByTagName('outerBoundaryIs')[0].getElementsByTagName('coordinates')[0].textContent).toBe('0,0,0 4,0,0 4,4,0 0,4,0 0,0,0');
    });

    it('writes a MultiPolygon as MultiGeometry with every hole', () => {
        const ring = (x: number): number[][] => [[x, 0], [x + 2, 0], [x + 2, 2], [x, 2], [x, 0]];
        const hole = (x: number): number[][] => [[x + 0.5, 0.5], [x + 1, 0.5], [x + 1, 1], [x + 0.5, 0.5]];
        const multi = polygon({}, { type: 'MultiPolygon', coordinates: [[ring(0), hole(0)], [ring(5)]] } as SarFeature['geometry']);
        const xml = parse(buildKml([multi], doc));
        expect(xml.getElementsByTagName('MultiGeometry')).toHaveLength(1);
        expect(xml.getElementsByTagName('Polygon')).toHaveLength(2);
        expect(xml.getElementsByTagName('innerBoundaryIs')).toHaveLength(1);
    });

    it('writes the start point as a Point with lng,lat,0', () => {
        const xml = parse(buildKml([ipp], doc));
        expect(xml.querySelector('Placemark > name')?.textContent).toBe('SAR IPP');
        expect(xml.querySelector('Point > coordinates')?.textContent).toBe('172,-40,0');
        expect(xml.querySelector('IconStyle > color')?.textContent).toBe('ff00d6ff');
    });

    it('escapes names, descriptions and the document text', () => {
        const nasty = `<b>"A" & 'B'</b>`;
        const xml = parse(buildKml([polygon({ callsign: nasty, remarks: nasty })], { name: nasty, description: nasty }));
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        expect(xml.querySelector('Placemark > name')?.textContent).toBe(nasty);
        expect(xml.querySelector('Placemark > description')?.textContent).toBe(nasty);
        expect(xml.querySelector('Document > name')?.textContent).toBe(nasty);
        expect(xml.querySelector('Document > description')?.textContent).toBe(nasty);
        expect(xml.getElementsByTagName('b')).toHaveLength(0);
    });

    it('uses one style per colour and fill, and references it from the Placemark', () => {
        const xml = parse(buildKml([polygon(), polygon({ callsign: 'again' }), polygon({ stroke: '#00ff00', fill: '#00ff00' })], doc));
        expect(xml.getElementsByTagName('Style')).toHaveLength(2);
        const urls = [...xml.getElementsByTagName('styleUrl')].map((e) => e.textContent);
        expect(urls[0]).toBe(urls[1]);
        expect(urls[2]).not.toBe(urls[0]);
        const ids = [...xml.getElementsByTagName('Style')].map((e) => `#${e.getAttribute('id')}`);
        expect(ids).toContain(urls[0]);
    });

    it('turns the fill off for a feature without fill', () => {
        const xml = parse(buildKml([polygon({ 'fill-opacity': 0 })], doc));
        expect(xml.querySelector('PolyStyle > fill')?.textContent).toBe('0');
    });
});
