# Outreach status sync

Read-only Manyreach → Google Sheet sync for the **IronWork Welder Outreach Tracker**. IronWork never writes to Manyreach; it only reads campaign state and updates Sheet fields.

```
Google Sheet  ←  scripts/outreach  ←  Manyreach (GET only)
```

## Manual setup (Manyreach)

Configure in the Manyreach UI before running sync:

- Domain, mailbox, and warmup
- Prospect import and campaign configuration
- Start/pause campaign and deliverability monitoring

IronWork does **not** enroll prospects, send mail, or change campaign settings.

## Environment

Add secrets to `.env.local` (not committed):

```bash
GOOGLE_SHEET_ID=
GOOGLE_SHEET_TAB=Outreach Tracker
GOOGLE_SHEET_HEADER_ROW=7
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
MANYREACH_API_KEY=
MANYREACH_CAMPAIGN_ID=
```

The Google service account must have edit access to the spreadsheet. `config.mjs` loads `.env.local` before `.env` without overriding variables already set in the shell.

## Commands

```bash
npm run outreach:doctor          # validate env, Sheet structure, Manyreach auth, campaign
npm run outreach:sync            # dry-run (default) — prints planned changes, zero Sheet writes
npm run outreach:sync -- --execute   # apply updates after validation
```

`--dry-run` and `--execute` cannot be used together.

On Manyreach HTTP 429, the script prints a clear message and exits; rerun later (no automatic retries).

## Sheet contract

- **Header row:** 7 (configurable via `GOOGLE_SHEET_HEADER_ROW`)
- **Join key:** `Email` (trim + lowercase)
- **Managed column:** `Manyreach Status` (plus reads/writes listed below)

Doctor and sync both validate:

- Exactly one occurrence of each managed header (`Email`, `Manyreach Status`, `Outreach Status`, `Sent Date`, `Replied?`)
- No duplicate normalized non-empty emails

## Fields updated (execute only)

| Field | Rule |
|-------|------|
| `Manyreach Status` | Set to Manyreach `prospect.sendingStatus` when prospect matches Sheet email |
| `Outreach Status` | Set to `Emailed` only when currently `Not Contacted` and a Sent message exists |
| `Sent Date` | Set only when blank, from earliest Sent message `createdAt` (`MM/DD/YYYY`, America/New_York, `USER_ENTERED`) |
| `Replied?` | Set to `Yes` for human reply statuses; never reverts an existing `Yes` |

Human reply statuses: `Neutral`, `MaybeLater`, `Interested`, `NotInterested`, `MeetingBooked`, `MeetingCompleted`, `Won`, `CollegueReplied`.

**Never updated:** `Follow-up Date`, `Pilot?`, `Notes`, business/contact columns, `Outreach Status` values other than `Not Contacted` → `Emailed`.

Rows with no matching Manyreach prospect are left unchanged.

## Dry-run output

Tab-separated table:

`Business | Email | Manyreach Status | Would set Outreach Status | Would set Sent Date | Would set Replied?`

## Validation workflow

1. Complete Manyreach setup and import prospects manually.
2. Use a controlled test address; start the campaign and confirm delivery.
3. `npm run outreach:sync` — confirm dry-run shows expected `Emailed`, `Sent Date`, and `Manyreach Status`.
4. `npm run outreach:sync -- --execute` — verify Sheet updates.
5. Send a controlled reply; sync again and confirm `Replied?` = `Yes`.
6. Run against the full prospect list when satisfied.

See also **ARCHITECTURE.md** (Outreach automation).
