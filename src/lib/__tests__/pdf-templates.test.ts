/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { buildHeaderTemplate, resolvePdfHeaderSlots } from '@scope-server/lib/pdf-templates.mjs';

describe('PDF header slots', () => {
  it('uses explicit left-only work order header slots', () => {
    const slots = resolvePdfHeaderSlots({
      headerLeft: 'Work Order #0007',
      headerRight: '',
      workOrderNumber: 'legacy WO',
    });

    expect(slots).toEqual({ headerLeft: 'Work Order #0007', headerRight: '' });
  });

  it('uses explicit invoice left and WO right header slots', () => {
    const slots = resolvePdfHeaderSlots({
      headerLeft: 'Invoice #0001',
      headerRight: 'WO #0007',
    });

    expect(slots).toEqual({ headerLeft: 'Invoice #0001', headerRight: 'WO #0007' });
  });

  it('keeps legacy marginHeaderLeft/workOrderNumber fallback behavior', () => {
    const slots = resolvePdfHeaderSlots({
      marginHeaderLeft: 'CO #0002',
      workOrderNumber: 'WO #0007',
    });

    expect(slots).toEqual({ headerLeft: 'CO #0002', headerRight: 'WO #0007' });
  });

  it('keeps legacy workOrderNumber duplicated when no explicit slots exist', () => {
    const slots = resolvePdfHeaderSlots({ workOrderNumber: 'Work Order #0007' });

    expect(slots).toEqual({
      headerLeft: 'Work Order #0007',
      headerRight: 'Work Order #0007',
    });
  });

  it('renders left and right labels in the Puppeteer margin header', () => {
    const html = buildHeaderTemplate('Invoice #0001', 'WO #0007');

    expect(html).toContain('Invoice #0001');
    expect(html).toContain('WO #0007');
    expect(html).toContain('Confidential');
  });
});
