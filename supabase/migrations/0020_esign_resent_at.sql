ALTER TABLE jobs ADD COLUMN IF NOT EXISTS esign_resent_at timestamptz;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS esign_resent_at timestamptz;