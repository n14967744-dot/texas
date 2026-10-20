/** Friendly display names for raw TDLR TABS statuses. Raw values stay in the DB/API/filters. */
export const STATUS_LABELS: Record<string, string> = {
  'Project Registered': 'Filed, plans not reviewed',
  'Review Complete': 'Plans approved',
  'Inspection Complete': 'Inspected',
  'Inspection Completed': 'Inspected',
  'Project Closed': 'Closed',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Not listed';
  return STATUS_LABELS[status.trim()] ?? status;
}

export const STATUS_SOURCE_NOTE = 'State status from the TDLR TABS filing. Inspected signals construction done, not occupancy. Closed is not proof of construction completion or cancellation.';
