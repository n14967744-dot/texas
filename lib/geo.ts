import { OFFICES, getOfficeBranch, type OfficeBranch } from './offices.ts';
import { haversineMiles } from './radius.ts';
import geocodeDoc from './dc-geocodes-data.ts';
import extraGeocodeDoc from './project-geocodes-data.ts';

export type GeoPrecision = 'address' | 'city' | 'county' | 'none';

export type ProjectGeocode = {
  lat: number | null;
  lng: number | null;
  precision: GeoPrecision | string;
  city?: string;
  county?: string;
};

// Data-center geocodes plus curated-list projects (data/project-geocodes.json).
const PROJECT_GEOCODES: Record<string, ProjectGeocode> = {
  ...(extraGeocodeDoc.projects as Record<string, ProjectGeocode>),
  ...(geocodeDoc.projects as Record<string, ProjectGeocode>),
};

export type DistanceHit = {
  projectNumber: string;
  distanceMi: number;
  precision: string;
  officeId: string;
};

export function getProjectGeocode(projectNumber: string): ProjectGeocode | undefined {
  return PROJECT_GEOCODES[projectNumber];
}

/** Distance from a project to one office branch, or null if ungeocoded. */
export function distanceToOffice(projectNumber: string, office: OfficeBranch): DistanceHit | null {
  const geo = PROJECT_GEOCODES[projectNumber];
  if (!geo || geo.lat == null || geo.lng == null) return null;
  return {
    projectNumber,
    distanceMi: haversineMiles(office.lat, office.lng, geo.lat, geo.lng),
    precision: geo.precision,
    officeId: office.id,
  };
}

/**
 * Projects within radiusMiles of the given office (or any office when officeId is null).
 * When officeId is null, distance is to the nearest CTWP office.
 */
export function projectsWithinRadius(options: {
  officeId?: string | null;
  radiusMiles: number;
  projectNumbers?: Iterable<string>;
}): DistanceHit[] {
  const radius = options.radiusMiles;
  const pool = options.projectNumbers
    ? [...options.projectNumbers]
    : Object.keys(PROJECT_GEOCODES);
  const offices: OfficeBranch[] = options.officeId
    ? (() => {
      const one = getOfficeBranch(options.officeId);
      return one ? [one] : [];
    })()
    : [...OFFICES];
  if (!offices.length) return [];

  const hits: DistanceHit[] = [];
  for (const projectNumber of pool) {
    let best: DistanceHit | null = null;
    for (const office of offices) {
      const hit = distanceToOffice(projectNumber, office);
      if (!hit) continue;
      if (hit.distanceMi <= radius && (!best || hit.distanceMi < best.distanceMi)) best = hit;
    }
    if (best) hits.push(best);
  }
  return hits;
}

export { haversineMiles, RADIUS_OPTIONS } from './radius.ts';
export type { RadiusMiles } from './radius.ts';
