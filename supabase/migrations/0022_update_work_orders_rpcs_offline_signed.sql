-- Update work_orders_dashboard RPCs to include offline_signed_at
-- Must DROP before changing return type since we're using RETURNS TABLE

-- Drop existing functions
DROP FUNCTION IF EXISTS public.list_work_orders_dashboard(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.list_work_orders_dashboard_page(uuid, integer, timestamptz, uuid);

-- Recreate list_work_orders_dashboard with offline_signed_at
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
  offline_signed_at timestamptz,
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
      j.esign_status,
      j.offline_signed_at
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
    j.offline_signed_at,
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
    j.offline_signed_at,
    inv.latest_invoice
  ORDER BY j.created_at DESC;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.list_work_orders_dashboard(uuid, uuid[]) TO authenticated;

-- Recreate list_work_orders_dashboard_page with offline_signed_at
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
  offline_signed_at timestamptz,
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
      j.esign_status,
      j.offline_signed_at
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
    j.offline_signed_at,
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

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.list_work_orders_dashboard_page(uuid, integer, timestamptz, uuid) TO authenticated;