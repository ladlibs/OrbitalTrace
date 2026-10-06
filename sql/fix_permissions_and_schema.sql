-- Run this entire script in your Supabase SQL editor
-- It grants the backend service role access to all required tables

GRANT SELECT, INSERT, UPDATE ON public.satellite TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sensor TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.raw_frame TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.reconstruction_job TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.reconstructed_image TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.contributes_to TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.quality_assessment TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.analyst TO service_role;

-- Grant access to provenance tables (created in migration)
GRANT SELECT, INSERT, UPDATE ON public.provenance_layer TO service_role;

-- Grant for tile tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tile_summary') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.tile_summary TO service_role';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tile_source') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.tile_source TO service_role';
  END IF;
END
$$;

-- Also run the schema migration if not done yet:
-- Add missing columns
ALTER TABLE raw_frame ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE raw_frame ADD COLUMN IF NOT EXISTS mask_url text;
ALTER TABLE raw_frame ALTER COLUMN latitude SET DEFAULT 0;
ALTER TABLE raw_frame ALTER COLUMN longitude SET DEFAULT 0;
ALTER TABLE raw_frame ALTER COLUMN altitude SET DEFAULT 0;
ALTER TABLE reconstructed_image ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE reconstructed_image ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE reconstructed_image ADD COLUMN IF NOT EXISTS width int;
ALTER TABLE reconstructed_image ADD COLUMN IF NOT EXISTS height int;
ALTER TABLE reconstructed_image ADD COLUMN IF NOT EXISTS tile_size int;
ALTER TABLE reconstruction_job ADD COLUMN IF NOT EXISTS input_hash text;
ALTER TABLE reconstruction_job ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE analyst ADD COLUMN IF NOT EXISTS auth_uid uuid;


CREATE TABLE IF NOT EXISTS provenance_layer (
  image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE CASCADE,
  layer_type VARCHAR(20) CHECK (layer_type IN ('CLASS_MAP','UNCERTAINTY','SOURCE_INDEX')),
  layer_url TEXT NOT NULL,
  layer_hash TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (image_id, layer_type)
);
GRANT SELECT, INSERT, UPDATE ON public.provenance_layer TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.provenance_layer TO authenticated;

-- Create tile_summary table
CREATE TABLE IF NOT EXISTS tile_summary (
  image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE CASCADE,
  tile_x INT,
  tile_y INT,
  observed_pct NUMERIC(5,2),
  weak_pct NUMERIC(5,2),
  synth_pct NUMERIC(5,2),
  mean_uncertainty NUMERIC(8,6),
  PRIMARY KEY (image_id, tile_x, tile_y)
);
GRANT SELECT, INSERT, UPDATE ON public.tile_summary TO service_role;

-- Create tile_source table
CREATE TABLE IF NOT EXISTS tile_source (
  image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE CASCADE,
  tile_x INT,
  tile_y INT,
  frame_id VARCHAR(50) REFERENCES raw_frame(frame_id),
  contribution_pct NUMERIC(5,2),
  PRIMARY KEY (image_id, tile_x, tile_y, frame_id)
);
GRANT SELECT, INSERT, UPDATE ON public.tile_source TO service_role;
