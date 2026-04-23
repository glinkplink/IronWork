ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS offline_signed_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_change_order_signature_satisfied(
  p_esign_status text,
  p_offline_signed_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_esign_status = 'completed' OR p_offline_signed_at IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.is_change_order_signature_satisfied(text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_invoice_change_orders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_job_level_invoice_line_items(NEW.line_items) THEN
    RAISE EXCEPTION
      'Standalone change order invoices are no longer supported. Add approved change orders to the work order invoice instead.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    WITH requested_change_orders AS (
      SELECT DISTINCT NULLIF(BTRIM(elem->>'change_order_id'), '')::uuid AS change_order_id
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(COALESCE(NEW.line_items, '[]'::jsonb)) = 'array'
            THEN COALESCE(NEW.line_items, '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE NULLIF(BTRIM(elem->>'change_order_id'), '') IS NOT NULL
    )
    SELECT 1
    FROM requested_change_orders r
    LEFT JOIN change_orders co
      ON co.id = r.change_order_id
     AND co.user_id = NEW.user_id
     AND co.job_id = NEW.job_id
    WHERE co.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invoice contains an unknown change order for this work order.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    WITH requested_change_orders AS (
      SELECT DISTINCT NULLIF(BTRIM(elem->>'change_order_id'), '')::uuid AS change_order_id
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(COALESCE(NEW.line_items, '[]'::jsonb)) = 'array'
            THEN COALESCE(NEW.line_items, '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE NULLIF(BTRIM(elem->>'change_order_id'), '') IS NOT NULL
    )
    SELECT 1
    FROM requested_change_orders r
    INNER JOIN change_orders co
      ON co.id = r.change_order_id
     AND co.user_id = NEW.user_id
     AND co.job_id = NEW.job_id
    WHERE NOT public.is_change_order_signature_satisfied(co.esign_status, co.offline_signed_at)
  ) THEN
    RAISE EXCEPTION
      'Change orders must be signed via DocuSeal or marked as signed offline before they can be invoiced.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_invoice_change_orders ON invoices;

CREATE TRIGGER validate_invoice_change_orders
  BEFORE INSERT OR UPDATE OF user_id, job_id, line_items
  ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_change_orders();
