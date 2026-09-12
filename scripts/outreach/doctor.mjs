#!/usr/bin/env node
import { loadConfig } from './config.mjs';
import { createSheetsClient, probeSpreadsheetReadable, readSheet } from './google-sheets.mjs';
import { getCampaign, probeAuth } from './manyreach.mjs';

function pass(message) {
  console.log(`PASS: ${message}`);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
}

async function main() {
  let failed = false;
  const markFail = (message) => {
    fail(message);
    failed = true;
  };

  let config;
  try {
    config = loadConfig();
    pass('Required environment variables present');
  } catch (error) {
    markFail(/** @type {Error} */ (error).message);
    console.log(failed ? 'FAIL' : 'PASS');
    process.exit(1);
  }

  const sheets = createSheetsClient(config);
  try {
    await probeSpreadsheetReadable(sheets, config);
    pass('Google Sheets auth and spreadsheet readable');
  } catch (error) {
    markFail(`Google Sheets: ${/** @type {Error} */ (error).message}`);
  }

  try {
    await readSheet(sheets, config);
    pass('Sheet structure validation (headers + duplicate emails)');
  } catch (error) {
    markFail(`Sheet validation: ${/** @type {Error} */ (error).message}`);
  }

  try {
    await probeAuth(config.manyreachApiKey);
    pass('Manyreach auth (GET /tags)');
  } catch (error) {
    markFail(`Manyreach auth: ${/** @type {Error} */ (error).message}`);
  }

  try {
    const campaign = /** @type {{ name?: string; status?: string; prospectCount?: number }} */ (
      await getCampaign(config.manyreachApiKey, config.manyreachCampaignId)
    );
    console.log(
      `Campaign: name="${campaign.name ?? ''}" status="${campaign.status ?? ''}" prospectCount=${campaign.prospectCount ?? 'n/a'}`
    );
    pass('Campaign exists');
  } catch (error) {
    markFail(`Campaign: ${/** @type {Error} */ (error).message}`);
  }

  console.log(failed ? 'FAIL' : 'PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
