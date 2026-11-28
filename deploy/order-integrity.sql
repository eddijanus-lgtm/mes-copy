-- Apply to existing databases before deploying with TYPEORM_SYNCHRONIZE=false.
-- Existing orphaned links abort the migration; no production records are deleted.
BEGIN;
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'carriers'::regclass AND conname = 'fk_carriers_order') THEN
    ALTER TABLE carriers ADD CONSTRAINT fk_carriers_order
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'order_route_steps'::regclass AND conname = 'fk_order_route_steps_order') THEN
    ALTER TABLE order_route_steps ADD CONSTRAINT fk_order_route_steps_order
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
  END IF;
END;
$migration$;
COMMIT;
