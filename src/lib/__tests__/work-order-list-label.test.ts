import { describe, it, expect } from 'vitest';
import { formatWorkOrderListJobType } from '../work-order-list-label';

describe('formatWorkOrderListJobType', () => {
  it('capitalizes known job types', () => {
    expect(formatWorkOrderListJobType({ job_type: 'repair', other_classification: null })).toBe(
      'Repair'
    );
    expect(formatWorkOrderListJobType({ job_type: 'fabrication', other_classification: null })).toBe(
      'Fabrication'
    );
  });

  it('uses Specify text for Other when present', () => {
    expect(
      formatWorkOrderListJobType({
        job_type: 'other',
        other_classification: 'body shop work',
      })
    ).toBe('Body shop work');
  });

  it('returns Other when type is other and Specify is empty', () => {
    expect(
      formatWorkOrderListJobType({ job_type: 'other', other_classification: null })
    ).toBe('Other');
    expect(formatWorkOrderListJobType({ job_type: 'other', other_classification: '  ' })).toBe(
      'Other'
    );
  });
});
