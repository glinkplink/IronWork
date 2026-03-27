import type { WorkOrderListJob } from '../types/db';

/** Label for Work Orders list: capitalized type; Other uses Specify text when present. */
export function formatWorkOrderListJobType(
  job: Pick<WorkOrderListJob, 'job_type' | 'other_classification'>
): string {
  const raw = (job.job_type || '').trim().toLowerCase();
  if (raw === 'other') {
    const spec = (job.other_classification ?? '').trim();
    if (spec) {
      return spec.charAt(0).toUpperCase() + spec.slice(1);
    }
    return 'Other';
  }
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
