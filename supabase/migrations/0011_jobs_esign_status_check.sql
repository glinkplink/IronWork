DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_esign_status_check'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_esign_status_check
      CHECK (
        esign_status IN ('not_sent', 'sent', 'opened', 'completed', 'declined', 'expired')
      );
  END IF;
END $$;
