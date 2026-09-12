import { google } from 'googleapis';

/** Headers the sync reads or writes — each must appear exactly once. */
export const MANAGED_HEADERS = [
  'Email',
  'Manyreach Status',
  'Outreach Status',
  'Sent Date',
  'Replied?',
];

/**
 * @param {string} tabName
 * @returns {string}
 */
export function quoteSheetTab(tabName) {
  return `'${tabName.replace(/'/g, "''")}'`;
}

/**
 * @param {number} index 0-based column index
 * @returns {string}
 */
export function columnIndexToLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * @param {import('./config.mjs').OutreachConfig} config
 */
export function createSheetsClient(config) {
  const auth = new google.auth.GoogleAuth({
    credentials: config.googleServiceAccountJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * @param {string[]} headerRow
 * @param {string[][]} dataRows
 */
export function validateSheet(headerRow, dataRows) {
  /** @type {Map<string, number>} */
  const headerCounts = new Map();
  for (const header of headerRow) {
    const trimmed = header?.trim?.() ?? '';
    if (!trimmed) {
      continue;
    }
    headerCounts.set(trimmed, (headerCounts.get(trimmed) ?? 0) + 1);
  }

  for (const managed of MANAGED_HEADERS) {
    const count = headerCounts.get(managed) ?? 0;
    if (count !== 1) {
      throw new Error(
        `Sheet validation failed: expected exactly one "${managed}" header, found ${count}`
      );
    }
  }

  /** @type {Set<string>} */
  const seenEmails = new Set();
  const emailIndex = headerRow.findIndex((h) => h?.trim?.() === 'Email');
  if (emailIndex === -1) {
    throw new Error('Sheet validation failed: Email header not found');
  }

  for (let i = 0; i < dataRows.length; i += 1) {
    const rawEmail = dataRows[i]?.[emailIndex]?.trim?.() ?? '';
    if (!rawEmail) {
      continue;
    }
    const normalized = rawEmail.toLowerCase();
    if (seenEmails.has(normalized)) {
      throw new Error(`Sheet validation failed: duplicate email "${rawEmail}" (row ${i + 1} of data)`);
    }
    seenEmails.add(normalized);
  }
}

/**
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {import('./config.mjs').OutreachConfig} config
 */
export async function readSheetHeaders(sheets, config) {
  const tab = quoteSheetTab(config.googleSheetTab);
  const headerRowNumber = config.googleSheetHeaderRow;
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${tab}!${headerRowNumber}:${headerRowNumber}`,
  });
  return headerResponse.data.values?.[0] ?? [];
}

/**
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {import('./config.mjs').OutreachConfig} config
 */
export async function readSheet(sheets, config) {
  const tab = quoteSheetTab(config.googleSheetTab);
  const headerRowNumber = config.googleSheetHeaderRow;
  const firstDataRow = headerRowNumber + 1;

  const headers = await readSheetHeaders(sheets, config);

  const dataRange = `${tab}!A${firstDataRow}:ZZ`;
  const dataResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: dataRange,
  });
  const dataRows = dataResponse.data.values ?? [];

  validateSheet(headers, dataRows);

  /** @type {Record<string, number>} */
  const columnByHeader = {};
  for (let i = 0; i < headers.length; i += 1) {
    const name = headers[i]?.trim?.();
    if (name) {
      columnByHeader[name] = i;
    }
  }

  /** @type {Array<{ sheetRowNumber: number; values: Record<string, string> }>} */
  const rows = [];
  for (let i = 0; i < dataRows.length; i += 1) {
    const rowValues = dataRows[i] ?? [];
    /** @type {Record<string, string>} */
    const values = {};
    for (const header of Object.keys(columnByHeader)) {
      values[header] = rowValues[columnByHeader[header]]?.trim?.() ?? '';
    }
    rows.push({
      sheetRowNumber: firstDataRow + i,
      values,
    });
  }

  return {
    headers,
    columnByHeader,
    rows,
  };
}

/**
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {import('./config.mjs').OutreachConfig} config
 * @param {Array<{ sheetRowNumber: number; columnHeader: string; value: string; userEntered?: boolean }>} updates
 */
export async function batchWriteUpdates(sheets, config, updates) {
  if (updates.length === 0) {
    return;
  }

  const tab = quoteSheetTab(config.googleSheetTab);
  const headers = await readSheetHeaders(sheets, config);

  /** @type {Record<string, import('googleapis').sheets_v4.Schema$ValueRange[]>} */
  const grouped = {};

  for (const update of updates) {
    const colIndex = headers.findIndex((h) => h?.trim?.() === update.columnHeader);
    if (colIndex === -1) {
      throw new Error(`Cannot write: header "${update.columnHeader}" not found`);
    }
    const colLetter = columnIndexToLetter(colIndex);
    const range = `${tab}!${colLetter}${update.sheetRowNumber}`;
    const key = update.userEntered ? 'userEntered' : 'raw';
    grouped[key] ??= [];
    grouped[key].push({
      range,
      values: [[update.value]],
    });
  }

  for (const [inputOption, data] of Object.entries(grouped)) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.googleSheetId,
      requestBody: {
        valueInputOption: inputOption === 'userEntered' ? 'USER_ENTERED' : 'RAW',
        data,
      },
    });
  }
}

/**
 * @param {import('googleapis').sheets_v4.Sheets} sheets
 * @param {import('./config.mjs').OutreachConfig} config
 */
export async function probeSpreadsheetReadable(sheets, config) {
  await sheets.spreadsheets.get({
    spreadsheetId: config.googleSheetId,
    fields: 'properties.title',
  });
  await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${quoteSheetTab(config.googleSheetTab)}!A1`,
  });
}
