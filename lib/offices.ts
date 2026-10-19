// Provisional county coverage. Update here after confirming CTWP territories.
// Coordinates are US Census 2024 Gazetteer place centroids for the office city
// (no street addresses are stored in this repo). Bryan–College Station uses Bryan.
export const OFFICES = [
  { id: 'bryan', name: 'Bryan–College Station', counties: ['Brazos'], lat: 30.666016, lng: -96.381049, coordSource: 'Census 2024 place centroid: Bryan city' },
  { id: 'waco', name: 'Waco', counties: ['McLennan'], lat: 31.557994, lng: -97.18975, coordSource: 'Census 2024 place centroid: Waco city' },
  { id: 'temple', name: 'Temple', counties: ['Bell'], lat: 31.104936, lng: -97.388512, coordSource: 'Census 2024 place centroid: Temple city' },
  { id: 'san-antonio', name: 'San Antonio', counties: ['Bexar'], lat: 29.462809, lng: -98.524635, coordSource: 'Census 2024 place centroid: San Antonio city' },
  { id: 'marble-falls', name: 'Marble Falls', counties: ['Burnet'], lat: 30.560168, lng: -98.277286, coordSource: 'Census 2024 place centroid: Marble Falls city' },
  { id: 'san-angelo', name: 'San Angelo', counties: ['Tom Green'], lat: 31.441078, lng: -100.450499, coordSource: 'Census 2024 place centroid: San Angelo city' },
  { id: 'corsicana', name: 'Corsicana', counties: ['Navarro'], lat: 32.082404, lng: -96.4667, coordSource: 'Census 2024 place centroid: Corsicana city' },
] as const;

export type OfficeBranch = (typeof OFFICES)[number];
export const TERRITORY_COUNTIES = [...new Set(OFFICES.flatMap((office) => [...office.counties]))];
export const COVERAGE_VIEWS = [
  { id: 'all', name: 'All CTWP territories', counties: TERRITORY_COUNTIES, lat: null, lng: null, coordSource: null },
  { id: 'texas', name: 'All Texas', counties: null, lat: null, lng: null, coordSource: null },
  ...OFFICES,
] as const;
export type OfficeId = (typeof COVERAGE_VIEWS)[number]['id'];
export const getOffice = (id: string) => COVERAGE_VIEWS.find((o) => o.id === id);
export const getOfficeBranch = (id: string) => OFFICES.find((o) => o.id === id);
