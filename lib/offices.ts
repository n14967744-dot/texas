// Office street addresses and coordinates from the US Census Geocoder
// (Public_AR_Current), exact address matches on 2026-10-20.
// Hidden offices stay in config for reference but are not offered in the project browser.
// County lists remain for the prospects pages, which still filter by territory.

export const COORD_SOURCE = 'US Census Geocoder (Public_AR_Current) exact address match, 2026-10-20';

export const DEFAULT_OFFICE_ID = 'bryan';
export const ALL_TEXAS_ID = 'texas';
export const OFFICE_COOKIE = 'ctwp_office';

export const OFFICES = [
  {
    id: 'bryan',
    name: 'Bryan–College Station',
    address: '410 E. Villa Maria Rd, Bryan, TX 77801',
    lat: 30.642469,
    lng: -96.354857,
    coordSource: COORD_SOURCE,
    visible: true,
    counties: ['Brazos'],
  },
  {
    id: 'waco',
    name: 'Waco',
    address: '3730 Franklin Ave, Waco, TX 76710',
    lat: 31.529589,
    lng: -97.160705,
    coordSource: COORD_SOURCE,
    visible: true,
    counties: ['McLennan'],
  },
  {
    id: 'temple',
    name: 'Temple',
    address: '1505 W. Ave M, Temple, TX 76504',
    lat: 31.088234,
    lng: -97.361337,
    coordSource: COORD_SOURCE,
    visible: false,
    counties: ['Bell'],
  },
  {
    id: 'san-antonio',
    name: 'San Antonio',
    address: '2946 NE Loop 410, San Antonio, TX 78218',
    lat: 29.515565,
    lng: -98.404718,
    coordSource: COORD_SOURCE,
    visible: false,
    counties: ['Bexar'],
  },
  {
    id: 'marble-falls',
    name: 'Marble Falls',
    address: '903 Ave H, Marble Falls, TX 78654',
    lat: 30.576927,
    lng: -98.272479,
    coordSource: COORD_SOURCE,
    visible: false,
    counties: ['Burnet'],
  },
  {
    id: 'san-angelo',
    name: 'San Angelo',
    address: '1821 Industrial Ave, San Angelo, TX 76904',
    lat: 31.428086,
    lng: -100.456753,
    coordSource: COORD_SOURCE,
    visible: false,
    counties: ['Tom Green'],
  },
  {
    id: 'corsicana',
    name: 'Corsicana (Copy Center)',
    address: '117 S. Beaton St, Corsicana, TX 75110',
    lat: 32.093476,
    lng: -96.463436,
    coordSource: COORD_SOURCE,
    visible: false,
    counties: ['Navarro'],
  },
] as const;

export type OfficeBranch = (typeof OFFICES)[number];
export type OfficeBranchId = OfficeBranch['id'];

export const VISIBLE_OFFICES = OFFICES.filter((office) => office.visible);
export type VisibleOfficeId = (typeof VISIBLE_OFFICES)[number]['id'];

export const TERRITORY_COUNTIES = [...new Set(OFFICES.flatMap((office) => [...office.counties]))];

/** Prospects page still browses by county territory, including hidden offices. */
export const COVERAGE_VIEWS = [
  { id: 'all', name: 'All CTWP territories', counties: TERRITORY_COUNTIES, lat: null, lng: null, coordSource: null, address: null, visible: true },
  { id: 'texas', name: 'All Texas', counties: null, lat: null, lng: null, coordSource: null, address: null, visible: true },
  ...OFFICES,
] as const;

export type OfficeId = (typeof COVERAGE_VIEWS)[number]['id'];

export const getOffice = (id: string) => COVERAGE_VIEWS.find((office) => office.id === id);
export const getOfficeBranch = (id: string) => OFFICES.find((office) => office.id === id);

export function isVisibleOffice(id: string): boolean {
  return VISIBLE_OFFICES.some((office) => office.id === id);
}

/** Project browser scopes: a visible office, or All Texas (no radius). */
export function isBrowseOffice(id: string): boolean {
  return id === ALL_TEXAS_ID || isVisibleOffice(id);
}

/**
 * URL office wins. A hidden or unknown office in the URL falls back to Bryan,
 * not to the cookie. With no office param, a valid cookie is used, else Bryan.
 */
export function resolveBrowseOffice(
  explicit: string | null | undefined,
  cookie: string | null | undefined,
  explicitPresent: boolean,
): string {
  if (explicitPresent) {
    if (explicit && isBrowseOffice(explicit)) return explicit;
    return DEFAULT_OFFICE_ID;
  }
  if (cookie && isBrowseOffice(cookie)) return cookie;
  return DEFAULT_OFFICE_ID;
}
