export type LatLon = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance à vol d'oiseau (haversine), en mètres. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

export function formatCoords({ latitude, longitude }: LatLon): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** Anneau de polygone GeoJSON ([lon, lat]) approchant un cercle de `radiusMeters` autour de `center`. */
export function circlePolygon(center: LatLon, radiusMeters: number, steps = 48): number[][][] {
  const latRadius = radiusMeters / 111_320;
  const lonRadius = radiusMeters / (111_320 * Math.cos(toRadians(center.latitude)));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([center.longitude + lonRadius * Math.cos(angle), center.latitude + latRadius * Math.sin(angle)]);
  }
  return [ring];
}
