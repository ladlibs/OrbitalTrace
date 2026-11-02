-- ============================================================================
-- SQL: Grant DELETE Privileges for Frame & Job Management
-- Run this in your Supabase SQL Editor once
-- ============================================================================

-- 1. Grant DELETE permissions on all pipeline and telemetry tables
GRANT DELETE ON public.raw_frame TO service_role, authenticated, anon;
GRANT DELETE ON public.reconstruction_job TO service_role, authenticated, anon;
GRANT DELETE ON public.reconstructed_image TO service_role, authenticated, anon;
GRANT DELETE ON public.contributes_to TO service_role, authenticated, anon;
GRANT DELETE ON public.tile_source TO service_role, authenticated, anon;
GRANT DELETE ON public.tile_summary TO service_role, authenticated, anon;
GRANT DELETE ON public.provenance_layer TO service_role, authenticated, anon;
GRANT DELETE ON public.quality_assessment TO service_role, authenticated, anon;

-- 2. Ensure tile_source cascades when a raw frame is deleted
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tile_source_frame_id_fkey'
  ) THEN
    ALTER TABLE public.tile_source DROP CONSTRAINT tile_source_frame_id_fkey;
  END IF;

  ALTER TABLE public.tile_source 
    ADD CONSTRAINT tile_source_frame_id_fkey 
    FOREIGN KEY (frame_id) 
    REFERENCES public.raw_frame(frame_id) 
    ON DELETE CASCADE;
END $$;
