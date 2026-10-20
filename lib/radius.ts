/** Earth radius in miles (mean). */
const EARTH_MI = 3958.7613;

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const RADIUS_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_RADIUS_MILES = 25;
export const MAX_RADIUS_MILES = 500;
export type RadiusMiles = (typeof RADIUS_OPTIONS)[number];
