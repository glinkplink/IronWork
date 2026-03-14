-- Add default_exclusions and default_assumptions columns to business_profiles
-- These fields store reusable default items that can be pre-populated in Work Agreements

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS default_exclusions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_assumptions text[] NOT NULL DEFAULT '{}';