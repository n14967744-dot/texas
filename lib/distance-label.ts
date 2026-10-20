/** Straight-line distance wording shared by the table, cards, and CSV. */
export function distanceLabel(miles: number | null | undefined, precision: string | null | undefined): string {
  if (precision === 'none' || miles == null || !Number.isFinite(Number(miles))) return 'Distance unknown';
  const value = Number(miles);
  if (precision === 'city') return `≈ ${Math.round(value)} mi · city center`;
  if (precision === 'county') return `≈ ${Math.round(value)} mi · county center`;
  return `${value.toFixed(1)} mi straight-line`;
}

/** Compact GPS wording; centroid distances retain the existing approximate marker. */
export function hereDistanceLabel(
  hereMiles: number | null | undefined,
  officeMiles: number | null | undefined,
  precision: string | null | undefined,
  officeName: string,
): string {
  const approx = precision === 'city' || precision === 'county' ? '≈ ' : '';
  const label = (miles: number | null | undefined, origin: string) =>
    precision === 'none' || miles == null || !Number.isFinite(Number(miles))
      ? `Distance from ${origin} unknown`
      : `${approx}${Math.round(Number(miles))} mi from ${origin}`;
  return `${label(hereMiles, 'you')} · ${label(officeMiles, officeName)}`;
}

export function distanceTitle(precision: string | null | undefined, nearestOffice: boolean): string {
  if (precision === 'none' || !precision) return 'No address, city, or county coordinate is on file for this project.';
  const base = nearestOffice
    ? 'Straight-line distance to the nearest visible office (Bryan–College Station or Waco), not driving distance.'
    : 'Straight-line distance from the selected office address, not driving distance.';
  if (precision === 'city') return `${base} This one uses the city center because the street address did not match.`;
  if (precision === 'county') return `${base} This one uses the county center because the street address and city did not match.`;
  return `${base} This one uses a Census address match.`;
}
