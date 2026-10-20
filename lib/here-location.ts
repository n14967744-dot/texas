/** GPS is kept separate from shareable browse filters. Never serialize it to browser history. */
export type HereLocation = { lat: number; lng: number };
export class LocationError extends Error {}

export function parseHereLocation(params: URLSearchParams): HereLocation | null {
  if (!params.has('lat') && !params.has('lng')) return null;
  const latRaw = params.get('lat')?.trim();
  const lngRaw = params.get('lng')?.trim();
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (params.getAll('lat').length !== 1 || params.getAll('lng').length !== 1
    || !latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)
    || lat < 25 || lat > 37.5 || lng < -107.5 || lng > -93) {
    throw new LocationError('Provide both lat and lng as finite numbers within Texas (lat 25–37.5, lng -107.5–-93).');
  }
  return { lat, lng };
}

/** API-only query. The input is the ordinary, shareable filter query. */
export function withHereLocation(query: string, location: HereLocation | null): string {
  const params = new URLSearchParams(query);
  params.delete('lat');
  params.delete('lng');
  if (location) {
    params.set('lat', String(location.lat));
    params.set('lng', String(location.lng));
  }
  return params.toString();
}
