import type { LngLatBounds } from 'maplibre-gl';
import { MAX_DETAIL_ZOOM } from '../map/ign';

/** Une case (région) = l'emprise d'un chunk au zoom 13. Doit rester égal à ChunkMath.REGION_ZOOM. */
export const REGION_ZOOM = 13;
/**
 * Taille d'un chunk quand la base n'en a encore aucun à ce zoom. Mesuré sur le Plan IGN en forêt de Chaux
 * (09/2026) : plus on zoome, moins il y a de détails par image, donc des PNG plus légers.
 */
const DEFAULT_CHUNK_BYTES_BY_ZOOM: Record<number, number> = { 14: 55_000, 15: 35_000, 16: 20_000, 17: 10_000 };
const DEFAULT_CHUNK_BYTES = 70_000;
export const GLOBAL_WARNING_BYTES = 1024 ** 3;

export type RegionRect = { xMin: number; yMin: number; xMax: number; yMax: number };

const tilesAt = (zoom: number) => 2 ** zoom;
const clampIndex = (value: number, zoom: number) => Math.min(tilesAt(zoom) - 1, Math.max(0, value));

export function regionAt(lng: number, lat: number): { x: number; y: number } {
  const n = tilesAt(REGION_ZOOM);
  const rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: clampIndex(x, REGION_ZOOM), y: clampIndex(y, REGION_ZOOM) };
}

export function rectFromRegions(a: { x: number; y: number }, b: { x: number; y: number }): RegionRect {
  return { xMin: Math.min(a.x, b.x), yMin: Math.min(a.y, b.y), xMax: Math.max(a.x, b.x), yMax: Math.max(a.y, b.y) };
}

export const regionCount = (rect: RegionRect) => (rect.xMax - rect.xMin + 1) * (rect.yMax - rect.yMin + 1);

const lonOf = (x: number) => (x / tilesAt(REGION_ZOOM)) * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tilesAt(REGION_ZOOM)))) * 180) / Math.PI;

/** [[ouest, sud], [est, nord]] du rectangle de cases. */
export function rectBounds(rect: RegionRect): [[number, number], [number, number]] {
  return [
    [lonOf(rect.xMin), latOf(rect.yMax + 1)],
    [lonOf(rect.xMax + 1), latOf(rect.yMin)],
  ];
}

/** Anneau GeoJSON du rectangle de cases. */
export function rectRing(rect: RegionRect): number[][][] {
  const [[west, south], [east, north]] = rectBounds(rect);
  return [[[west, north], [east, north], [east, south], [west, south], [west, north]]];
}

export const regionSquare = (x: number, y: number) => rectRing({ xMin: x, yMin: y, xMax: x, yMax: y });

/** Même règle que ChunkMath.rangeAtZoom (Kotlin). */
function rangeAtZoom(min: number, max: number, zoom: number): [number, number] {
  if (zoom <= REGION_ZOOM) return [min >> (REGION_ZOOM - zoom), max >> (REGION_ZOOM - zoom)];
  const factor = 2 ** (zoom - REGION_ZOOM);
  return [min * factor, (max + 1) * factor - 1];
}

function chunksAtZoom(rect: RegionRect, zoom: number): number {
  const [x0, x1] = rangeAtZoom(rect.xMin, rect.xMax, zoom);
  const [y0, y1] = rangeAtZoom(rect.yMin, rect.yMax, zoom);
  return (x1 - x0 + 1) * (y1 - y0 + 1);
}

export function chunkCount(rect: RegionRect): number {
  let total = 0;
  for (let zoom = 0; zoom <= MAX_DETAIL_ZOOM; zoom++) total += chunksAtZoom(rect, zoom);
  return total;
}

/** Octets estimés : moyenne réelle par zoom quand elle existe, sinon la taille mesurée pour ce zoom. */
export function estimateBytes(rect: RegionRect, averages: Record<string, number>): number {
  let total = 0;
  for (let zoom = 0; zoom <= MAX_DETAIL_ZOOM; zoom++) {
    total += chunksAtZoom(rect, zoom) * (averages[String(zoom)] ?? DEFAULT_CHUNK_BYTES_BY_ZOOM[zoom] ?? DEFAULT_CHUNK_BYTES);
  }
  return total;
}

/** Rectangle des cases visibles dans l'emprise de la carte. */
export function regionsInView(bounds: LngLatBounds): RegionRect {
  return rectFromRegions(regionAt(bounds.getWest(), bounds.getNorth()), regionAt(bounds.getEast(), bounds.getSouth()));
}
