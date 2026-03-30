ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_esign_status_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_esign_status_check CHECK (
        esign_status IN ('not_sent', 'sent', 'opened', 'completed', 'declined', 'expired')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_inflight_esign_by_user_created_at
  ON invoices (user_id, created_at DESC)
  WHERE esign_status IN ('sent', 'opened');

CREATE INDEX IF NOT EXISTS idx_invoices_user_id_issued_at_created_at
  ON invoices (user_id, issued_at DESC NULLS LAST, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_change_order(
  p_user_id uuid,
  p_job_id uuid,
  p_description text,
  p_reason text,
  p_status text,
  p_requires_approval boolean,
  p_line_items jsonb,
  p_time_amount numeric,
  p_time_unit text,
  p_time_note text
)
RETURNS change_orders
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_row change_orders%ROWTYPE;
  v_co_number integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'User mismatch while creating change order'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(5005, hashtext(p_job_id::text));

  IF EXISTS (
    SELECT 1
    FROM invoices i
    WHERE i.job_id = p_job_id
      AND i.user_id = p_user_id
      AND i.issued_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(i.line_items, '[]'::jsonb)) AS elem
        WHERE NULLIF(TRIM(elem->>'change_order_id'), '') IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Change orders cannot be added after the work order invoice has been issued.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(co_number), 0) + 1
  INTO v_co_number
  FROM change_orders
  WHERE job_id = p_job_id;

  INSERT INTO change_orders (
    user_id,
    job_id,
    co_number,
    description,
    reason,
    status,
    requires_approval,
    line_items,
    time_amount,
    time_unit,
    time_note
  )
  VALUES (
    p_user_id,
    p_job_id,
    v_co_number,
    p_description,
    p_reason,
    p_status,
    p_requires_approval,
    COALESCE(p_line_items, '[]'::jsonb),
    COALESCE(p_time_amount, 0),
    COALESCE(p_time_unit, 'days'),
    COALESCE(p_time_note, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_work_orders_dashboard(
  p_user_id uuid,
  p_job_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  wo_number integer,
  customer_name text,
  job_type text,
  other_classification text,
  agreement_date date,
  created_at timestamptz,
  price numeric,
  esign_status text,
  change_orders jsonb,
  latest_invoice jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH filtered_jobs AS (
    SELECT
      j.id,
      j.wo_number,
      j.customer_name,
      j.job_type,
      j.other_classification,
      j.agreement_date,
      j.created_at,
      j.price,
      j.esign_status
    FROM jobs j
    WHERE j.user_id = p_user_id
      AND auth.uid() = p_user_id
      AND (
        p_job_ids IS NULL
        OR cardinality(p_job_ids) = 0
        OR j.id = ANY (p_job_ids)
      )
  )
  SELECT
    j.id,
    j.wo_number,
    j.customer_name,
    j.job_type,
    j.other_classification,
    j.agreement_date,
    j.created_at,
    j.price,
    j.esign_status,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', co.id,
          'job_id', co.job_id,
          'co_number', co.co_number,
          'esign_status', co.esign_status
        )
        ORDER BY co.co_number
      ) FILTER (WHERE co.id IS NOT NULL),
      '[]'::jsonb
    ) AS change_orders,
    inv.latest_invoice
  FROM filtered_jobs j
  LEFT JOIN change_orders co
    ON co.job_id = j.id
   AND co.user_id = p_user_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', i.id,
      'job_id', i.job_id,
      'issued_at', i.issued_at,
      'invoice_number', i.invoice_number,
      'created_at', i.created_at
    ) AS latest_invoice
    FROM invoices i
    WHERE i.user_id = p_user_id
      AND i.job_id = j.id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(COALESCE(i.line_items, '[]'::jsonb)) = 'array'
              THEN COALESCE(i.line_items, '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) AS elem
        WHERE COALESCE(elem->>'change_order_id', '') <> ''
      )
    ORDER BY i.created_at DESC
    LIMIT 1
  ) inv ON true
  GROUP BY
    j.id,
    j.wo_number,
    j.customer_name,
    j.job_type,
    j.other_classification,
    j.agreement_date,
    j.created_at,
    j.price,
    j.esign_status,
    inv.latest_invoice
  ORDER BY j.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_work_orders_dashboard_page(
  p_user_id uuid,
  p_limit integer,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  wo_number integer,
  customer_name text,
  job_type text,
  other_classification text,
  agreement_date date,
  created_at timestamptz,
  price numeric,
  esign_status text,
  change_order_count integer,
  change_orders_preview jsonb,
  has_in_flight_change_orders boolean,
  latest_invoice jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH page_jobs AS (
    SELECT
      j.id,
      j.wo_number,
      j.customer_name,
      j.job_type,
      j.other_classification,
      j.agreement_date,
      j.created_at,
      j.price,
      j.esign_status
    FROM jobs j
    WHERE j.user_id = p_user_id
      AND auth.uid() = p_user_id
      AND (
        p_cursor_created_at IS NULL
        OR j.created_at < p_cursor_created_at
        OR (
          j.created_at = p_cursor_created_at
          AND p_cursor_id IS NOT NULL
          AND j.id < p_cursor_id
        )
      )
    ORDER BY j.created_at DESC, j.id DESC
    LIMIT GREATEST(p_limit, 1)
  ),
  page_change_orders AS (
    SELECT
      co.id,
      co.job_id,
      co.co_number,
      co.esign_status
    FROM change_orders co
    INNER JOIN page_jobs j
      ON j.id = co.job_id
    WHERE co.user_id = p_user_id
  ),
  ranked_change_orders AS (
    SELECT
      co.id,
      co.job_id,
      co.co_number,
      co.esign_status,
      row_number() OVER (PARTITION BY co.job_id ORDER BY co.co_number ASC) AS preview_rank
    FROM page_change_orders co
  ),
  change_order_rollups AS (
    SELECT
      co.job_id,
      COUNT(*)::integer AS change_order_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', co.id,
            'job_id', co.job_id,
            'co_number', co.co_number,
            'esign_status', co.esign_status
          )
          ORDER BY co.co_number
        ) FILTER (WHERE co.preview_rank <= 2),
        '[]'::jsonb
      ) AS change_orders_preview,
      COALESCE(bool_or(co.esign_status IN ('sent', 'opened')), false) AS has_in_flight_change_orders
    FROM ranked_change_orders co
    GROUP BY co.job_id
  ),
  page_job_level_invoices AS (
    SELECT
      i.id,
      i.job_id,
      i.issued_at,
      i.invoice_number,
      i.created_at
    FROM invoices i
    INNER JOIN page_jobs j
      ON j.id = i.job_id
    WHERE i.user_id = p_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(COALESCE(i.line_items, '[]'::jsonb)) = 'array'
              THEN COALESCE(i.line_items, '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) AS elem
        WHERE COALESCE(elem->>'change_order_id', '') <> ''
      )
  ),
  latest_job_level_invoices AS (
    SELECT DISTINCT ON (i.job_id)
      i.job_id,
      jsonb_build_object(
        'id', i.id,
        'job_id', i.job_id,
        'issued_at', i.issued_at,
        'invoice_number', i.invoice_number,
        'created_at', i.created_at
      ) AS latest_invoice
    FROM page_job_level_invoices i
    ORDER BY i.job_id, i.created_at DESC, i.id DESC
  )
  SELECT
    j.id,
    j.wo_number,
    j.customer_name,
    j.job_type,
    j.other_classification,
    j.agreement_date,
    j.created_at,
    j.price,
    j.esign_status,
    COALESCE(c.change_order_count, 0) AS change_order_count,
    COALESCE(c.change_orders_preview, '[]'::jsonb) AS change_orders_preview,
    COALESCE(c.has_in_flight_change_orders, false) AS has_in_flight_change_orders,
    l.latest_invoice
  FROM page_jobs j
  LEFT JOIN change_order_rollups c
    ON c.job_id = j.id
  LEFT JOIN latest_job_level_invoices l
    ON l.job_id = j.id
  ORDER BY j.created_at DESC, j.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_work_orders_dashboard_summary(
  p_user_id uuid
)
RETURNS TABLE (
  job_count bigint,
  invoiced_contract_total numeric,
  pending_contract_total numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH user_jobs AS (
    SELECT
      j.id,
      j.price
    FROM jobs j
    WHERE j.user_id = p_user_id
      AND auth.uid() = p_user_id
  ),
  user_job_level_invoices AS (
    SELECT
      i.id,
      i.job_id,
      i.issued_at,
      i.created_at
    FROM invoices i
    INNER JOIN user_jobs j
      ON j.id = i.job_id
    WHERE i.user_id = p_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(COALESCE(i.line_items, '[]'::jsonb)) = 'array'
              THEN COALESCE(i.line_items, '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) AS elem
        WHERE COALESCE(elem->>'change_order_id', '') <> ''
      )
  ),
  latest_job_level_invoices AS (
    SELECT DISTINCT ON (i.job_id)
      i.job_id,
      i.issued_at
    FROM user_job_level_invoices i
    ORDER BY i.job_id, i.created_at DESC, i.id DESC
  )
  SELECT
    COUNT(*)::bigint AS job_count,
    COALESCE(
      SUM(
        CASE
          WHEN l.issued_at IS NOT NULL THEN j.price
          ELSE 0
        END
      ),
      0
    ) AS invoiced_contract_total,
    COALESCE(
      SUM(
        CASE
          WHEN l.issued_at IS NULL THEN j.price
          ELSE 0
        END
      ),
      0
    ) AS pending_contract_total
  FROM user_jobs j
  LEFT JOIN latest_job_level_invoices l
    ON l.job_id = j.id;
$$;
