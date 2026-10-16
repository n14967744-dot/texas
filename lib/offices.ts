// Provisional county coverage. Update here after confirming CTWP territories.
export const OFFICES = [
  { id: 'bryan', name: 'Bryan–College Station', counties: ['Brazos'] },
  { id: 'waco', name: 'Waco', counties: ['McLennan'] },
  { id: 'temple', name: 'Temple', counties: ['Bell'] },
  { id: 'san-antonio', name: 'San Antonio', counties: ['Bexar'] },
  { id: 'marble-falls', name: 'Marble Falls', counties: ['Burnet'] },
  { id: 'san-angelo', name: 'San Angelo', counties: ['Tom Green'] },
  { id: 'corsicana', name: 'Corsicana', counties: ['Navarro'] },
] as const;
export const TERRITORY_COUNTIES = [...new Set(OFFICES.flatMap((office) => [...office.counties]))];
export const COVERAGE_VIEWS = [
  { id: 'all', name: 'All CTWP territories', counties: TERRITORY_COUNTIES },
  { id: 'texas', name: 'All Texas', counties: null },
  ...OFFICES,
] as const;
export type OfficeId = (typeof COVERAGE_VIEWS)[number]['id'];
export const getOffice = (id: string) => COVERAGE_VIEWS.find((o) => o.id === id);
