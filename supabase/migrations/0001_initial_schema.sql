-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Business Profiles Table
CREATE TABLE business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  business_name text NOT NULL,
  owner_name text,
  phone text,
  email text,
  address text,
  google_business_profile_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Clients Table
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Jobs Table
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  job_location text NOT NULL,
  job_type text NOT NULL,
  asset_or_item_description text NOT NULL,
  requested_work text NOT NULL,
  materials_provided_by text NOT NULL,
  installation_included boolean DEFAULT false,
  grinding_included boolean DEFAULT false,
  paint_or_coating_included boolean DEFAULT false,
  removal_or_disassembly_included boolean DEFAULT false,
  hidden_damage_possible boolean DEFAULT false,
  price_type text NOT NULL,
  price numeric(10,2) NOT NULL,
  deposit_required boolean DEFAULT false,
  payment_terms text,
  target_completion_date date,
  exclusions text[],
  assumptions text[],
  change_order_required boolean DEFAULT false,
  workmanship_warranty_days integer,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Change Orders Table
CREATE TABLE change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  price_delta numeric(10,2),
  time_delta integer,
  approved boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Completion Signoffs Table
CREATE TABLE completion_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE NOT NULL UNIQUE,
  client_name text NOT NULL,
  signed_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_change_orders_user_id ON change_orders(user_id);
CREATE INDEX idx_change_orders_job_id ON change_orders(job_id);
CREATE INDEX idx_completion_signoffs_user_id ON completion_signoffs(user_id);
CREATE INDEX idx_completion_signoffs_job_id ON completion_signoffs(job_id);

-- ============================================================================
-- TRIGGERS (updated_at)
-- ============================================================================

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON business_profiles
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON completion_signoffs
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Business Profiles RLS
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON business_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "insert_own" ON business_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own" ON business_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "delete_own" ON business_profiles FOR DELETE
  USING (user_id = auth.uid());

-- Clients RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON clients FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "insert_own" ON clients FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own" ON clients FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "delete_own" ON clients FOR DELETE
  USING (user_id = auth.uid());

-- Jobs RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "insert_own" ON jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own" ON jobs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "delete_own" ON jobs FOR DELETE
  USING (user_id = auth.uid());

-- Change Orders RLS
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON change_orders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "insert_own" ON change_orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own" ON change_orders FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "delete_own" ON change_orders FOR DELETE
  USING (user_id = auth.uid());

-- Completion Signoffs RLS
ALTER TABLE completion_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON completion_signoffs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "insert_own" ON completion_signoffs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own" ON completion_signoffs FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "delete_own" ON completion_signoffs FOR DELETE
  USING (user_id = auth.uid());
