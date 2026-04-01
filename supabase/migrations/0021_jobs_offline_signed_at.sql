-- Add offline_signed_at column for manual paper signature tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS offline_signed_at timestamptz NULL;