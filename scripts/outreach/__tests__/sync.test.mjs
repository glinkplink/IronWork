/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import {
  batchWriteUpdates,
  columnIndexToLetter,
  quoteSheetTab,
  validateSheet,
} from '../google-sheets.mjs';
import {
  computeRowUpdates,
  formatSentDateNy,
  patchToSheetUpdates,
  planSyncUpdates,
} from '../sync-logic.mjs';
import { normalizeEmail } from '../manyreach.mjs';

const BASE_ROW = {
  Email: 'Prospect@Example.com',
  Business: 'Acme Welding',
  'Outreach Status': 'Not Contacted',
  'Sent Date': '',
  'Replied?': '',
  'Manyreach Status': '',
};

describe('validateSheet', () => {
  const headers = [
    'Business',
    'Email',
    'Outreach Status',
    'Sent Date',
    'Replied?',
    'Manyreach Status',
  ];

  it('fails on duplicate managed headers before any write', () => {
    const badHeaders = [...headers, 'Email'];
    expect(() => validateSheet(badHeaders, [['a@example.com']])).toThrow(
      'expected exactly one "Email" header'
    );
  });

  it('fails on duplicate normalized emails', () => {
    expect(() =>
      validateSheet(headers, [
        ['Acme', 'a@example.com', 'Not Contacted', '', '', ''],
        ['Beta', 'A@Example.com', 'Not Contacted', '', '', ''],
      ])
    ).toThrow('duplicate email');
  });
});

describe('computeRowUpdates', () => {
  it('matches emails case-insensitively and updates Manyreach Status', () => {
    const { patch } = computeRowUpdates(
      BASE_ROW,
      { sendingStatus: 'NotSet' },
      undefined
    );
    expect(patch.manyreachStatus).toBe('NotSet');
    expect(patch.outreachStatus).toBeUndefined();
  });

  it('sets Emailed only from Not Contacted when a sent message exists', () => {
    const advanced = { ...BASE_ROW, 'Outreach Status': 'Follow-up Scheduled' };
    const { patch: fromNotContacted } = computeRowUpdates(
      BASE_ROW,
      { sendingStatus: 'NotSet' },
      '2026-03-15T17:00:00Z'
    );
    expect(fromNotContacted.outreachStatus).toBe('Emailed');

    const { patch: fromAdvanced } = computeRowUpdates(
      advanced,
      { sendingStatus: 'NotSet' },
      '2026-03-15T17:00:00Z'
    );
    expect(fromAdvanced.outreachStatus).toBeUndefined();
  });

  it('uses earliest sent timestamp for Sent Date in New York', () => {
    const { patch } = computeRowUpdates(
      BASE_ROW,
      { sendingStatus: 'NotSet' },
      '2026-03-15T17:00:00Z'
    );
    expect(patch.sentDate).toBe(formatSentDateNy('2026-03-15T17:00:00Z'));
    expect(patch.sentDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('does not overwrite an existing Sent Date', () => {
    const row = { ...BASE_ROW, 'Sent Date': '01/01/2026' };
    const { patch } = computeRowUpdates(row, { sendingStatus: 'NotSet' }, '2026-03-15T17:00:00Z');
    expect(patch.sentDate).toBeUndefined();
  });

  it('sets Replied? for human reply statuses and never reverts Yes', () => {
    const { patch: interested } = computeRowUpdates(
      BASE_ROW,
      { sendingStatus: 'Interested' },
      undefined
    );
    expect(interested.replied).toBe('Yes');

    const rowYes = { ...BASE_ROW, 'Replied?': 'Yes' };
    const { patch: keepYes } = computeRowUpdates(
      rowYes,
      { sendingStatus: 'NotInterested' },
      undefined
    );
    expect(keepYes.replied).toBeUndefined();
  });

  it('leaves unmatched rows unchanged', () => {
    const { patch } = computeRowUpdates(BASE_ROW, undefined, '2026-01-01T12:00:00Z');
    expect(patch).toEqual({});
  });
});

describe('planSyncUpdates', () => {
  it('indexes prospects and sent messages by normalized email', () => {
    const rows = [
      {
        sheetRowNumber: 8,
        values: BASE_ROW,
      },
    ];
    const prospects = new Map([
      [normalizeEmail('Prospect@Example.com'), { sendingStatus: 'NotSet' }],
    ]);
    const sent = new Map([[normalizeEmail('Prospect@Example.com'), '2026-01-10T15:00:00Z']]);

    const planned = planSyncUpdates(rows, prospects, sent);
    expect(planned).toHaveLength(1);
    expect(planned[0].dryRun.outreachStatus).toBe('Emailed');
    expect(planned[0].dryRun.sentDate).toBeTruthy();
  });
});

describe('patchToSheetUpdates', () => {
  it('targets quoted tab ranges with USER_ENTERED for Sent Date', () => {
    const updates = patchToSheetUpdates(
      {
        manyreachStatus: 'NotSet',
        outreachStatus: 'Emailed',
        sentDate: '03/15/2026',
        replied: 'Yes',
      },
      8
    );

    expect(updates).toEqual([
      { sheetRowNumber: 8, columnHeader: 'Manyreach Status', value: 'NotSet' },
      { sheetRowNumber: 8, columnHeader: 'Outreach Status', value: 'Emailed' },
      {
        sheetRowNumber: 8,
        columnHeader: 'Sent Date',
        value: '03/15/2026',
        userEntered: true,
      },
      { sheetRowNumber: 8, columnHeader: 'Replied?', value: 'Yes' },
    ]);
  });
});

describe('batchWriteUpdates', () => {
  it('quotes tab names with spaces in A1 ranges', async () => {
    const batchUpdate = vi.fn().mockResolvedValue({});
    const get = vi.fn().mockResolvedValue({
      data: {
        values: [
          [
            'Business',
            'Email',
            'Outreach Status',
            'Sent Date',
            'Replied?',
            'Manyreach Status',
          ],
        ],
      },
    });

    const sheets = {
      spreadsheets: {
        values: {
          get,
          batchUpdate,
        },
      },
    };

    await batchWriteUpdates(
      /** @type {import('googleapis').sheets_v4.Sheets} */ (sheets),
      {
        googleSheetId: 'sheet-id',
        googleSheetTab: 'Outreach Tracker',
        googleSheetHeaderRow: 7,
        googleServiceAccountJson: {},
        manyreachApiKey: 'key',
        manyreachCampaignId: '1',
      },
      [
        {
          sheetRowNumber: 8,
          columnHeader: 'Manyreach Status',
          value: 'NotSet',
        },
      ]
    );

    expect(batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `'Outreach Tracker'!F8`,
            values: [['NotSet']],
          },
        ],
      },
    });
  });
});

describe('quoteSheetTab', () => {
  it('escapes apostrophes in tab names', () => {
    expect(quoteSheetTab('Outreach Tracker')).toBe("'Outreach Tracker'");
    expect(quoteSheetTab("Bob's List")).toBe("'Bob''s List'");
  });
});

describe('columnIndexToLetter', () => {
  it('maps column indexes to letters', () => {
    expect(columnIndexToLetter(0)).toBe('A');
    expect(columnIndexToLetter(5)).toBe('F');
    expect(columnIndexToLetter(25)).toBe('Z');
    expect(columnIndexToLetter(26)).toBe('AA');
  });
});
