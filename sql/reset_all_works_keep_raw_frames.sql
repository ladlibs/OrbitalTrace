-- ============================================================================
-- SQL: Wipe All Reconstruction Jobs, Images & Lineage (Keep Pure Raw Frames)
-- Run this in your Supabase SQL Editor
-- ============================================================================

BEGIN;

-- 1. Sever circular foreign keys between jobs and reconstructed images
UPDATE public.reconstruction_job SET parent_image_id = NULL WHERE parent_image_id IS NOT NULL;
UPDATE public.reconstructed_image SET original_image_id = NULL WHERE original_image_id IS NOT NULL;

-- 2. Delete tile analytics & provenance layers
DELETE FROM public.tile_source;
DELETE FROM public.tile_summary;
DELETE FROM public.provenance_layer;
DELETE FROM public.quality_assessment;

-- 3. Delete job-frame contributions bridge
DELETE FROM public.contributes_to;

-- 4. Delete all reconstruction jobs & reconstructed images
DELETE FROM public.reconstructed_image;
DELETE FROM public.reconstruction_job;

-- 5. Remove any mirrored reconstructed products from the frames table
-- (Keeps ONLY your original raw camera captures)
DELETE FROM public.raw_frame 
WHERE source_dataset = 'RECONSTRUCTED' 
   OR frame_id::text LIKE 'REC-%';

COMMIT;
