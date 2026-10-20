import { distanceLabel, distanceTitle } from '@/lib/distance-label';

export function DistanceCell({
  miles,
  precision,
  nearestOffice,
}: {
  miles: number | null | undefined;
  precision: string | null | undefined;
  nearestOffice: boolean;
}) {
  const label = distanceLabel(miles, precision);
  return <span className="distance-label" title={distanceTitle(precision, nearestOffice)}>{label}</span>;
}
