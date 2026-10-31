/*
 * KML export. The model is downloadContoursKml in the reference tool (sar-engine, app/static/app.js):
 * one Document, one Style per colour, one Placemark per polygon. Differences: inner rings are kept,
 * every text is escaped, a MultiPolygon becomes a MultiGeometry, and the start point is a Point.
 */
import type { SarFeature } from './features.ts';
import type { Position } from './types.ts';

/** Characters XML 1.0 does not allow at all. */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Text for an XML element or attribute: control characters dropped, `& < > " '` escaped. */
export function xmlEscape(text: string): string {
    return String(text).replace(INVALID_XML, '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** `#rrggbb` and an opacity from 0 to 1 as KML `aabbggrr`. */
export function kmlColor(hex: string, opacity: number): string {
    const h = HEX.test(hex) ? hex.slice(1) : '3388ff';
    const a = Math.round(Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1)) * 255);
    const byte = (n: number): string => n.toString(16).padStart(2, '0');
    return `${byte(a)}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
}

const coords = (ring: Position[]): string => ring.map((p) => `${p[0]},${p[1]},0`).join(' ');

function polygonXml(rings: Position[][]): string {
    const [outer, ...holes] = rings;
    return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(outer)}</coordinates></LinearRing></outerBoundaryIs>`
        + holes.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${coords(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('')
        + '</Polygon>';
}

function geometryXml(f: SarFeature): string {
    const g = f.geometry;
    if (g.type === 'Point') return `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
    if (g.type === 'Polygon') return polygonXml(g.coordinates);
    return `<MultiGeometry>${g.coordinates.map(polygonXml).join('')}</MultiGeometry>`;
}

const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

interface StyleSpec {
    id: string;
    xml: string;
}

function styleFor(f: SarFeature): StyleSpec {
    const p = f.properties;
    if (f.geometry.type === 'Point') {
        const color = text(p['marker-color'], '#ffd600');
        const id = `point_${color.replace('#', '')}`;
        return { id, xml: `<Style id="${xmlEscape(id)}"><IconStyle><color>${kmlColor(color, num(p['marker-opacity'], 1))}</color></IconStyle></Style>` };
    }
    const stroke = text(p.stroke, '#3388ff');
    const fillOpacity = num(p['fill-opacity'], 0.15);
    const id = `poly_${stroke.replace('#', '')}_${Math.round(fillOpacity * 100)}`;
    return {
        id,
        xml: `<Style id="${xmlEscape(id)}"><LineStyle><color>${kmlColor(stroke, num(p['stroke-opacity'], 1))}</color><width>${num(p['stroke-width'], 3)}</width></LineStyle>`
            + `<PolyStyle><color>${kmlColor(text(p.fill, stroke), fillOpacity)}</color><fill>${fillOpacity > 0 ? 1 : 0}</fill></PolyStyle></Style>`,
    };
}

/** A KML document with one Placemark per feature. `doc.description` carries the disclaimer and attribution. */
export function buildKml(features: readonly SarFeature[], doc: { name: string; description: string }): string {
    const styles = new Map<string, string>();
    const placemarks = features.map((f) => {
        const style = styleFor(f);
        styles.set(style.id, style.xml);
        return `<Placemark><name>${xmlEscape(f.properties.callsign)}</name><description>${xmlEscape(f.properties.remarks)}</description>`
            + `<styleUrl>#${xmlEscape(style.id)}</styleUrl>${geometryXml(f)}</Placemark>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n`
        + `<name>${xmlEscape(doc.name)}</name>\n<description>${xmlEscape(doc.description)}</description>\n`
        + `${[...styles.values()].join('\n')}\n${placemarks.join('\n')}\n</Document>\n</kml>\n`;
}
