/** Friendly display names for raw TDLR TABS statuses. Raw values stay in the DB/API/filters. */
export const STATUS_LABELS: Record<string, string> = {
  'Project Registered': 'Filed, plans not reviewed',
  'Review Complete': 'Plans approved',
  'Inspection Complete': 'Inspected (state final inspection)',
  'Inspection Completed': 'Inspected (state final inspection)',
  'Project Closed': 'Closed (filing closed)',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Not listed';
  return STATUS_LABELS[status] ?? status;
}

export const STATUS_SOURCE_NOTE = 'State status from the TDLR TABS filing';
