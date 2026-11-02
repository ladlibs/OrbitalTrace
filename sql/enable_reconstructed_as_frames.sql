-- ============================================================================
-- SQL Migration: Enable Reconstructed Images as Input Frames for Reconstruction Jobs
-- ============================================================================

-- 1. Backfill any existing reconstructed_image records into raw_frame
INSERT INTO public.raw_frame (
    capture_timestamp,
    latitude,
    longitude,
    altitude,
    cloud_cover_pct,
    status,
    sensor_id,
    image_url,
    source_dataset,
    scene_id
)
SELECT 
    COALESCE(ri.generated_timestamp, NOW()) AS capture_timestamp,
    0 AS latitude,
    0 AS longitude,
    0 AS altitude,
    0 AS cloud_cover_pct,
    'USABLE' AS status,
    1 AS sensor_id,
    ri.image_url,
    'RECONSTRUCTED' AS source_dataset,
    ri.image_id::text AS scene_id
FROM public.reconstructed_image ri
WHERE ri.image_url IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.raw_frame rf 
      WHERE rf.source_dataset = 'RECONSTRUCTED' 
        AND rf.scene_id = ri.image_id::text
  );

-- 2. Trigger: Automatically register any newly created/updated reconstructed image into raw_frame
CREATE OR REPLACE FUNCTION public.sync_reconstructed_image_to_raw_frame()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.image_url IS NOT NULL THEN
        -- Check if already registered
        IF NOT EXISTS (
            SELECT 1 FROM public.raw_frame 
            WHERE source_dataset = 'RECONSTRUCTED' 
              AND scene_id = NEW.image_id::text
        ) THEN
            INSERT INTO public.raw_frame (
                capture_timestamp,
                latitude,
                longitude,
                altitude,
                cloud_cover_pct,
                status,
                sensor_id,
                image_url,
                source_dataset,
                scene_id
            ) VALUES (
                COALESCE(NEW.generated_timestamp, NOW()),
                0,
                0,
                0,
                0,
                'USABLE',
                1,
                NEW.image_url,
                'RECONSTRUCTED',
                NEW.image_id::text
            );
        ELSE
            UPDATE public.raw_frame
            SET image_url = NEW.image_url
            WHERE source_dataset = 'RECONSTRUCTED'
              AND scene_id = NEW.image_id::text;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_reconstructed_image ON public.reconstructed_image;

CREATE TRIGGER trg_sync_reconstructed_image
AFTER INSERT OR UPDATE OF image_url ON public.reconstructed_image
FOR EACH ROW EXECUTE FUNCTION public.sync_reconstructed_image_to_raw_frame();
