-- Persist "Specify" text when job type is Other (JobForm other_classification).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS other_classification text;
