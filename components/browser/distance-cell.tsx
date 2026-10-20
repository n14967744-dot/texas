import { distanceLabel, distanceTitle, hereDistanceLabel } from '@/lib/distance-label';
import { getOfficeBranch } from '@/lib/offices';

export function DistanceCell({
  miles,
  precision,
  nearestOffice,
  hereMiles,
  locationEnabled = false,
  officeName = 'nearest office',
  distanceOfficeId,
}: {
  miles: number | null | undefined;
  precision: string | null | undefined;
  nearestOffice: boolean;
  hereMiles?: number | null;
  locationEnabled?: boolean;
  officeName?: string;
  distanceOfficeId?: string | null;
}) {
  const branchName = distanceOfficeId ? getOfficeBranch(distanceOfficeId)?.name : null;
  const label = locationEnabled ? hereDistanceLabel(hereMiles, miles, precision, branchName || officeName) : distanceLabel(miles, precision);
  const title = `${locationEnabled ? 'Distance from you is straight-line, not driving. ' : ''}${distanceTitle(precision, nearestOffice)}`;
  return <span className="distance-label" title={title}>{label}</span>;
}
