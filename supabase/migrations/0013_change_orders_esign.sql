-- DocuSeal e-sign state on change orders
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS esign_submission_id text,
  ADD COLUMN IF NOT EXISTS esign_submitter_id text,
  ADD COLUMN IF NOT EXISTS esign_embed_src text,
  ADD COLUMN IF NOT EXISTS esign_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS esign_submission_state text,
  ADD COLUMN IF NOT EXISTS esign_submitter_state text,
  ADD COLUMN IF NOT EXISTS esign_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS esign_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS esign_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS esign_declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS esign_decline_reason text,
  ADD COLUMN IF NOT EXISTS esign_signed_document_url text;

COMMENT ON COLUMN change_orders.esign_status IS 'not_sent | sent | opened | completed | declined | expired';

-- CHECK constraint for status enum
ALTER TABLE change_orders
  ADD CONSTRAINT change_orders_esign_status_check
  CHECK (esign_status IN ('not_sent', 'sent', 'opened', 'completed', 'declined', 'expired'));

-- Index for polling in-flight COs
CREATE INDEX IF NOT EXISTS idx_change_orders_inflight_esign
  ON change_orders (user_id, created_at DESC)
  WHERE esign_status IN ('sent', 'opened');