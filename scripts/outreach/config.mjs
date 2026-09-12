import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// Load .env.local first, then .env — dotenv does not override existing process.env.
dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

/** @typedef {{
 *   googleSheetId: string;
 *   googleSheetTab: string;
 *   googleSheetHeaderRow: number;
 *   googleServiceAccountJson: object;
 *   manyreachApiKey: string;
 *   manyreachCampaignId: string;
 * }} OutreachConfig */

export const REQUIRED_ENV_VARS = [
  'GOOGLE_SHEET_ID',
  'GOOGLE_SHEET_TAB',
  'GOOGLE_SHEET_HEADER_ROW',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'MANYREACH_API_KEY',
  'MANYREACH_CAMPAIGN_ID',
];

/** @returns {OutreachConfig} */
export function loadConfig() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  let googleServiceAccountJson;
  try {
    googleServiceAccountJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON');
  }

  const headerRow = Number.parseInt(process.env.GOOGLE_SHEET_HEADER_ROW, 10);
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    throw new Error('GOOGLE_SHEET_HEADER_ROW must be a positive integer');
  }

  return {
    googleSheetId: process.env.GOOGLE_SHEET_ID.trim(),
    googleSheetTab: process.env.GOOGLE_SHEET_TAB.trim(),
    googleSheetHeaderRow: headerRow,
    googleServiceAccountJson,
    manyreachApiKey: process.env.MANYREACH_API_KEY.trim(),
    manyreachCampaignId: process.env.MANYREACH_CAMPAIGN_ID.trim(),
  };
}
