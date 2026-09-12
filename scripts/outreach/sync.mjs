#!/usr/bin/env node
import { loadConfig } from './config.mjs';
import { createSheetsClient, readSheet, batchWriteUpdates } from './google-sheets.mjs';
import {
  fetchAllCampaignProspects,
  fetchEarliestSentByEmail,
} from './manyreach.mjs';
import { planSyncUpdates, printDryRunTable } from './sync-logic.mjs';

function parseArgs(argv) {
  const dryRun = !argv.includes('--execute');
  if (argv.includes('--dry-run') && argv.includes('--execute')) {
    console.error('Cannot use --dry-run and --execute together.');
    process.exit(1);
  }
  return { execute: !dryRun };
}

async function main() {
  const { execute } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const sheets = createSheetsClient(config);

  const sheetData = await readSheet(sheets, config);
  const prospectsByEmail = await fetchAllCampaignProspects(
    config.manyreachApiKey,
    config.manyreachCampaignId
  );
  const earliestSentByEmail = await fetchEarliestSentByEmail(
    config.manyreachApiKey,
    config.manyreachCampaignId
  );

  const planned = planSyncUpdates(sheetData.rows, prospectsByEmail, earliestSentByEmail);

  if (!execute) {
    printDryRunTable(planned);
    return;
  }

  const allUpdates = planned.flatMap((row) => row.updates);
  await batchWriteUpdates(sheets, config, allUpdates);
  console.log(`Updated ${allUpdates.length} cell(s) across ${planned.length} row(s).`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
