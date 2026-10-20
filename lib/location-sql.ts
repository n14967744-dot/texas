import { getOfficeBranch, VISIBLE_OFFICES } from './offices.ts';

/** Mean Earth radius in miles. Spec requires 3958.8 for SQL haversine. */
export const EARTH_RADIUS_MI = 3958.8;

export type SqlBind = (value: string | number) => string;

/**
 * Census name_key is UPPER-case, periods removed, whitespace collapsed.
 * TABS city values are already place names ("Missouri City"), so do not strip a
 * trailing " CITY" — that would turn Missouri City into MISSOURI and miss
 * the gazetteer key MISSOURI CITY. County values sometimes include a suffix.
 */
export function cityNameKey(value: string): string {
  return value.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

export function countyNameKey(value: string): string {
  return cityNameKey(value).replace(/ COUNTY$/, '');
}

export function cityNameKeySql(column: string): string {
  return `regexp_replace(regexp_replace(upper(btrim(coalesce(${column}, ''))), '\\.', '', 'g'), '\\s+', ' ', 'g')`;
}

export function countyNameKeySql(column: string): string {
  return `regexp_replace(${cityNameKeySql(column)}, ' COUNTY$', '')`;
}

export function haversineSql(lat1: string, lng1: string, lat2: string, lng2: string): string {
  return `(${EARTH_RADIUS_MI} * 2 * asin(least(1::float8, sqrt(
    power(sin(radians((${lat2}::float8) - (${lat1}::float8)) / 2), 2)
    + cos(radians(${lat1}::float8)) * cos(radians(${lat2}::float8))
      * power(sin(radians((${lng2}::float8) - (${lng1}::float8)) / 2), 2)
  ))))`;
}

function distanceExpr(officeId: string, bind: SqlBind): string {
  if (officeId === 'texas') {
    const parts = VISIBLE_OFFICES.map((office) => haversineSql('base.eff_lat', 'base.eff_lng', bind(office.lat), bind(office.lng)));
    return `LEAST(${parts.join(', ')})`;
  }
  const office = getOfficeBranch(officeId);
  if (!office?.visible) throw new Error('Unknown office.');
  return haversineSql('base.eff_lat', 'base.eff_lng', bind(office.lat), bind(office.lng));
}

/**
 * Effective coordinate: Census address match, else Texas city centroid, else
 * county centroid. precision is address | city | county | none.
 * Distance is straight-line miles (one office, or the nearest visible office for All Texas).
 */
export function locatedFromSql(officeId: string, bind: SqlBind): string {
  const cityKey = cityNameKeySql('p.location_city');
  const countyKey = countyNameKeySql('p.location_county');
  const effLat = `CASE
      WHEN g.precision = 'address' AND g.lat IS NOT NULL AND g.lng IS NOT NULL THEN g.lat
      WHEN city_c.lat IS NOT NULL AND city_c.lng IS NOT NULL THEN city_c.lat
      WHEN county_c.lat IS NOT NULL AND county_c.lng IS NOT NULL THEN county_c.lat
      ELSE NULL END`;
  const effLng = `CASE
      WHEN g.precision = 'address' AND g.lat IS NOT NULL AND g.lng IS NOT NULL THEN g.lng
      WHEN city_c.lat IS NOT NULL AND city_c.lng IS NOT NULL THEN city_c.lng
      WHEN county_c.lat IS NOT NULL AND county_c.lng IS NOT NULL THEN county_c.lng
      ELSE NULL END`;
  const precision = `CASE
      WHEN g.precision = 'address' AND g.lat IS NOT NULL AND g.lng IS NOT NULL THEN 'address'
      WHEN city_c.lat IS NOT NULL AND city_c.lng IS NOT NULL THEN 'city'
      WHEN county_c.lat IS NOT NULL AND county_c.lng IS NOT NULL THEN 'county'
      ELSE 'none' END`;
  const miles = distanceExpr(officeId, bind);
  return `(
    SELECT base.*,
      CASE WHEN base.eff_lat IS NULL OR base.eff_lng IS NULL THEN NULL ELSE ${miles} END AS distance_mi
    FROM (
      SELECT p.*,
        (${effLat}) AS eff_lat,
        (${effLng}) AS eff_lng,
        (${precision}) AS geo_precision
      FROM public.projects p
      LEFT JOIN leads.project_geocodes g ON g.project_number = p.project_number
      LEFT JOIN leads.tx_place_centroids city_c
        ON city_c.kind = 'city' AND city_c.name_key = ${cityKey}
      LEFT JOIN leads.tx_place_centroids county_c
        ON county_c.kind = 'county' AND county_c.name_key = ${countyKey}
    ) base
  ) located`;
}
