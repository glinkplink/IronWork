import { normalizeEmail } from './manyreach.mjs';

export const HUMAN_REPLY_STATUSES = new Set([
  'Neutral',
  'MaybeLater',
  'Interested',
  'NotInterested',
  'MeetingBooked',
  'MeetingCompleted',
  'Won',
  'CollegueReplied',
]);

const OUTREACH_TIMEZONE = 'America/New_York';

/**
 * @param {string} isoTimestamp
 * @returns {string} MM/DD/YYYY in America/New_York
 */
export function formatSentDateNy(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OUTREACH_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  return `${month}/${day}/${year}`;
}

/**
 * @typedef {{
 *   manyreachStatus?: string;
 *   outreachStatus?: string;
 *   sentDate?: string;
 *   replied?: string;
 * }} RowPatch
 */

/**
 * @param {Record<string, string>} rowValues
 * @param {{ sendingStatus?: string } | undefined} prospect
 * @param {string | undefined} earliestSentAt
 * @returns {{ patch: RowPatch; dryRun: RowPatch }}
 */
export function computeRowUpdates(rowValues, prospect, earliestSentAt) {
  /** @type {RowPatch} */
  const patch = {};
  /** @type {RowPatch} */
  const dryRun = {};

  if (!prospect) {
    return { patch, dryRun };
  }

  const sendingStatus = prospect.sendingStatus ?? '';
  if (sendingStatus && rowValues['Manyreach Status'] !== sendingStatus) {
    patch.manyreachStatus = sendingStatus;
    dryRun.manyreachStatus = sendingStatus;
  }

  if (earliestSentAt) {
    const outreachStatus = rowValues['Outreach Status'] ?? '';
    if (outreachStatus === 'Not Contacted') {
      patch.outreachStatus = 'Emailed';
      dryRun.outreachStatus = 'Emailed';
    }

    const sentDate = rowValues['Sent Date'] ?? '';
    if (!sentDate) {
      const formatted = formatSentDateNy(earliestSentAt);
      patch.sentDate = formatted;
      dryRun.sentDate = formatted;
    }
  }

  if (HUMAN_REPLY_STATUSES.has(sendingStatus)) {
    const replied = rowValues['Replied?'] ?? '';
    if (replied !== 'Yes') {
      patch.replied = 'Yes';
      dryRun.replied = 'Yes';
    }
  }

  return { patch, dryRun };
}

/**
 * @param {RowPatch} patch
 * @param {number} sheetRowNumber
 * @returns {Array<{ sheetRowNumber: number; columnHeader: string; value: string; userEntered?: boolean }>}
 */
export function patchToSheetUpdates(patch, sheetRowNumber) {
  /** @type {Array<{ sheetRowNumber: number; columnHeader: string; value: string; userEntered?: boolean }>} */
  const updates = [];

  if (patch.manyreachStatus !== undefined) {
    updates.push({
      sheetRowNumber,
      columnHeader: 'Manyreach Status',
      value: patch.manyreachStatus,
    });
  }
  if (patch.outreachStatus !== undefined) {
    updates.push({
      sheetRowNumber,
      columnHeader: 'Outreach Status',
      value: patch.outreachStatus,
    });
  }
  if (patch.sentDate !== undefined) {
    updates.push({
      sheetRowNumber,
      columnHeader: 'Sent Date',
      value: patch.sentDate,
      userEntered: true,
    });
  }
  if (patch.replied !== undefined) {
    updates.push({
      sheetRowNumber,
      columnHeader: 'Replied?',
      value: patch.replied,
    });
  }

  return updates;
}

/**
 * @param {Array<{ values: Record<string, string>; sheetRowNumber: number }>} rows
 * @param {Map<string, { sendingStatus?: string }>} prospectsByEmail
 * @param {Map<string, string>} earliestSentByEmail
 */
export function planSyncUpdates(rows, prospectsByEmail, earliestSentByEmail) {
  /** @type {Array<{ business: string; email: string; sheetRowNumber: number; dryRun: RowPatch; updates: ReturnType<typeof patchToSheetUpdates> }>} */
  const planned = [];

  for (const row of rows) {
    const email = row.values.Email?.trim?.() ?? '';
    if (!email) {
      continue;
    }

    const normalized = normalizeEmail(email);
    const prospect = prospectsByEmail.get(normalized);
    const earliestSentAt = earliestSentByEmail.get(normalized);
    const { patch, dryRun } = computeRowUpdates(row.values, prospect, earliestSentAt);
    const updates = patchToSheetUpdates(patch, row.sheetRowNumber);

    if (
      dryRun.manyreachStatus ||
      dryRun.outreachStatus ||
      dryRun.sentDate ||
      dryRun.replied
    ) {
      planned.push({
        business: row.values.Business ?? '',
        email,
        sheetRowNumber: row.sheetRowNumber,
        dryRun,
        updates,
      });
    }
  }

  return planned;
}

export function printDryRunTable(planned) {
  const headers = [
    'Business',
    'Email',
    'Manyreach Status',
    'Would set Outreach Status',
    'Would set Sent Date',
    'Would set Replied?',
  ];
  console.log(headers.join('\t'));

  if (planned.length === 0) {
    console.log('(no changes)');
    return;
  }

  for (const row of planned) {
    console.log(
      [
        row.business,
        row.email,
        row.dryRun.manyreachStatus ?? '',
        row.dryRun.outreachStatus ?? '',
        row.dryRun.sentDate ?? '',
        row.dryRun.replied ?? '',
      ].join('\t')
    );
  }
}
