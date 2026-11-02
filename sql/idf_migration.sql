-- IDF Migration: expand provenance_layer constraint + add record_hash column
-- Run this in the Supabase SQL Editor before running any new jobs.

-- 1. Drop the old constraint that only allowed CLASS_MAP, UNCERTAINTY, SOURCE_INDEX, ERROR_MAP
ALTER TABLE public.provenance_layer DROP CONSTRAINT IF EXISTS provenance_layer_layer_type_check;
ALTER TABLE public.provenance_layer ALTER COLUMN layer_type TYPE VARCHAR(30);
ALTER TABLE public.provenance_layer ADD CONSTRAINT provenance_layer_layer_type_check
    CHECK (layer_type IN ('CLASS_MAP','UNCERTAINTY','SOURCE_INDEX','ERROR_MAP','SYNTHETIC_SHARE','SOURCE_WEIGHT'));

-- 2. Add record_hash column to reconstruction_job for IDF §6.5 hash-linked DAG
ALTER TABLE public.reconstruction_job ADD COLUMN IF NOT EXISTS record_hash TEXT;

-- 3. Add algorithm_used column if not present (stores algorithm name for ra lookup)
ALTER TABLE public.reconstruction_job ADD COLUMN IF NOT EXISTS algorithm_used TEXT;
