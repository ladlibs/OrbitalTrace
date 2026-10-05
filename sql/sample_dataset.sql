-- 1. ADD IMAGE_URL COLUMNS SO WE CAN ACTUALLY DISPLAY IMAGES IN THE UI
ALTER TABLE public.raw_frame ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.reconstructed_image ADD COLUMN IF NOT EXISTS image_url text;

-- 2. CLEAR EXISTING DEMO DATA (To avoid conflicts)
DELETE FROM public.quality_assessment;
DELETE FROM public.contributes_to;
DELETE FROM public.reconstructed_image;
DELETE FROM public.reconstruction_job;
DELETE FROM public.raw_frame;
DELETE FROM public.sensor;
DELETE FROM public.satellite;

-- 3. CREATE SATELLITES & SENSORS
INSERT INTO public.satellite (satellite_id, name, orbit_type, launch_date, agency) OVERRIDING SYSTEM VALUE VALUES
(1, 'Sentinel-2A', 'LEO', '2015-06-23', 'ESA'),
(2, 'Landsat 9', 'LEO', '2021-09-27', 'NASA/USGS');

INSERT INTO public.sensor (sensor_id, resolution, sensor_type, satellite_id) OVERRIDING SYSTEM VALUE VALUES
(1, '10m', 'OPTICAL', 1),
(2, '15m', 'OPTICAL', 2);

-- 4. INSERT RAW FRAMES (The blurry/noisy inputs)
-- We use realistic-looking raw/noisy placeholders
INSERT INTO public.raw_frame (frame_id, capture_timestamp, latitude, longitude, altitude, cloud_cover_pct, status, sensor_id, image_url) OVERRIDING SYSTEM VALUE VALUES
(101, '2026-10-01T10:00:00Z', 48.8566, 2.3522, 786000, 15.5, 'RAW', 1, 'https://images.unsplash.com/photo-1541873676-a18131494184?w=400&q=80&blur=5'), -- Blurry Paris
(102, '2026-10-01T10:00:02Z', 48.8566, 2.3522, 786000, 12.0, 'RAW', 1, 'https://images.unsplash.com/photo-1541873676-a18131494184?w=400&q=80&blur=4'), -- Slightly better
(103, '2026-10-01T10:00:04Z', 48.8566, 2.3522, 786000, 18.2, 'RAW', 1, 'https://images.unsplash.com/photo-1541873676-a18131494184?w=400&q=80&blur=6'); -- Very blurry

-- 5. CREATE FIRST RECONSTRUCTION JOB (Generation 1 - Basic Math)
INSERT INTO public.reconstruction_job (job_id, algorithm_used, parameters, start_time, end_time, status, analyst_id) OVERRIDING SYSTEM VALUE VALUES
(1001, 'POCS', '{"iterations": 200, "denoise": 0.5}'::jsonb, '2026-10-02T09:00:00Z', '2026-10-02T09:45:00Z', 'COMPLETED', 1);

-- Link raw frames to Job 1
INSERT INTO public.contributes_to (frame_id, job_id, contribution_weight) VALUES
(101, 1001, 0.4),
(102, 1001, 0.5),
(103, 1001, 0.1);

-- Output of Job 1 (A mathematically accurate but slightly soft image)
INSERT INTO public.reconstructed_image (image_id, resolution, output_format, generated_timestamp, job_id, original_image_id, image_url) OVERRIDING SYSTEM VALUE VALUES
(5001, '5m', 'TIFF', '2026-10-02T09:45:00Z', 1001, NULL, 'https://images.unsplash.com/photo-1541873676-a18131494184?w=800&q=80&blur=1');

-- Metrics for Image 1 (High PSNR, lower SSIM)
INSERT INTO public.quality_assessment (image_id, metric_type, score, assessed_by) VALUES
(5001, 'PSNR', 38.5, 1),
(5001, 'SSIM', 0.72, 1);

-- 6. CREATE SECOND RECONSTRUCTION JOB (Generation 2 - AI Refinement of Image 1)
INSERT INTO public.reconstruction_job (job_id, algorithm_used, parameters, start_time, end_time, status, analyst_id) OVERRIDING SYSTEM VALUE VALUES
(1002, 'ESRGAN', '{"epochs": 1000, "upscale_factor": 4}'::jsonb, '2026-10-03T14:00:00Z', '2026-10-03T16:20:00Z', 'COMPLETED', 1);

-- Output of Job 2 (The AI Enhanced version, links back to original_image_id 5001)
INSERT INTO public.reconstructed_image (image_id, resolution, output_format, generated_timestamp, job_id, original_image_id, image_url) OVERRIDING SYSTEM VALUE VALUES
(5002, '1.25m', 'GeoTIFF', '2026-10-03T16:20:00Z', 1002, 5001, 'https://images.unsplash.com/photo-1541873676-a18131494184?w=1600&q=100');

-- Metrics for Image 2 (Lower PSNR due to AI hallucination, high SSIM for human realism)
INSERT INTO public.quality_assessment (image_id, metric_type, score, assessed_by) VALUES
(5002, 'PSNR', 29.8, 1),
(5002, 'SSIM', 0.94, 1);
