-- ============================================================================
-- ORBITALTRACE: DBMS Coursework — Review 2 SQL Views
-- PostgreSQL / Supabase Compatible
-- ============================================================================
-- Description: Core SQL Views for Lineage Tracking, Refinement Ancestry (Recursive CTE),
--              Quality Trend Analytics, and Analyst Performance.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIEW 1: RAW FRAME CONTRIBUTIONS PER RECONSTRUCTION JOB
-- ----------------------------------------------------------------------------
-- Question Answered: Which raw frames (and at what weight) fed a given reconstruction job?
-- DBMS Concept: Multi-table JOIN across bridge entity (CONTRIBUTES_TO) and parent tables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_job_frame_contributions AS
SELECT 
    rj.job_id,
    rj.algorithm_used,
    rj.status AS job_status,
    rj.start_time AS job_start_time,
    a.name AS analyst_name,
    rf.frame_id,
    rf.capture_timestamp,
    rf.cloud_cover_pct,
    rf.status AS frame_status,
    ct.contribution_weight,
    s.sensor_id,
    s.sensor_type,
    sat.name AS satellite_name,
    m.name AS mission_name
FROM reconstruction_job rj
JOIN analyst a ON rj.analyst_id = a.analyst_id
JOIN contributes_to ct ON rj.job_id = ct.job_id
JOIN raw_frame rf ON ct.frame_id = rf.frame_id
JOIN sensor s ON rf.sensor_id = s.sensor_id
JOIN satellite sat ON s.satellite_id = sat.satellite_id
JOIN mission m ON sat.mission_id = m.mission_id;

COMMENT ON VIEW v_job_frame_contributions IS 
'Shows the provenance mapping of raw frame telemetry and weights feeding each reconstruction job.';


-- ----------------------------------------------------------------------------
-- VIEW 2: RECONSTRUCTED IMAGE REFINEMENT ANCESTRY (RECURSIVE LINEAGE)
-- ----------------------------------------------------------------------------
-- Question Answered: What is the full refinement ancestry of a reconstructed image?
-- DBMS Concept: Recursive Common Table Expression (WITH RECURSIVE).
-- How it works: 
--   1. Anchor Member: Selects root images (where original_image_id IS NULL).
--   2. Recursive Member: Joins subsequent iterations where original_image_id matches previous image_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_image_refinement_ancestry AS
WITH RECURSIVE lineage_tree AS (
    -- Anchor member: root images (first attempts, original_image_id is NULL)
    SELECT 
        image_id,
        resolution,
        output_format,
        generated_timestamp,
        job_id,
        original_image_id,
        image_id AS root_image_id,
        0 AS generation_depth,
        CAST(image_id::text AS VARCHAR(1000)) AS ancestry_path,
        TRUE AS is_first_attempt
    FROM reconstructed_image
    WHERE original_image_id IS NULL

    UNION ALL

    -- Recursive member: refined images (original_image_id points to parent image)
    SELECT 
        ri.image_id,
        ri.resolution,
        ri.output_format,
        ri.generated_timestamp,
        ri.job_id,
        ri.original_image_id,
        lt.root_image_id,
        lt.generation_depth + 1 AS generation_depth,
        CAST(lt.ancestry_path || ' -> ' || ri.image_id::text AS VARCHAR(1000)) AS ancestry_path,
        FALSE AS is_first_attempt
    FROM reconstructed_image ri
    JOIN lineage_tree lt ON ri.original_image_id = lt.image_id
)
SELECT 
    image_id,
    resolution,
    output_format,
    generated_timestamp,
    job_id,
    original_image_id AS parent_image_id,
    root_image_id,
    generation_depth,
    ancestry_path,
    is_first_attempt
FROM lineage_tree;

COMMENT ON VIEW v_image_refinement_ancestry IS 
'Recursive lineage view tracing multi-generation refinement trees back to root images.';


-- ----------------------------------------------------------------------------
-- VIEW 3A: QUALITY TREND PER MISSION OVER TIME
-- ----------------------------------------------------------------------------
-- Question Answered: How are image quality metrics (PSNR, SSIM) trending per mission over time?
-- DBMS Concept: Conditional Aggregation (FILTER / CASE WHEN) & Date Truncation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_quality_trend_per_mission AS
SELECT 
    m.mission_id,
    m.name AS mission_name,
    DATE_TRUNC('month', ri.generated_timestamp) AS assessment_month,
    COUNT(DISTINCT ri.image_id) AS total_images_assessed,
    ROUND(AVG(CASE WHEN UPPER(qa.metric_type) = 'PSNR' THEN qa.score END)::numeric, 2) AS avg_psnr_db,
    ROUND(AVG(CASE WHEN UPPER(qa.metric_type) = 'SSIM' THEN qa.score END)::numeric, 4) AS avg_ssim_score
FROM mission m
JOIN satellite sat ON m.mission_id = sat.mission_id
JOIN sensor s ON sat.satellite_id = s.satellite_id
JOIN raw_frame rf ON s.sensor_id = rf.sensor_id
JOIN contributes_to ct ON rf.frame_id = ct.frame_id
JOIN reconstruction_job rj ON ct.job_id = rj.job_id
JOIN reconstructed_image ri ON rj.job_id = ri.job_id
JOIN quality_assessment qa ON ri.image_id = qa.image_id
GROUP BY m.mission_id, m.name, DATE_TRUNC('month', ri.generated_timestamp);

COMMENT ON VIEW v_quality_trend_per_mission IS 
'Monthly average PSNR and SSIM quality trends aggregated per mission.';


-- ----------------------------------------------------------------------------
-- VIEW 3B: QUALITY TREND PER SATELLITE OVER TIME
-- ----------------------------------------------------------------------------
-- Question Answered: How are image quality metrics trending per satellite over time?
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_quality_trend_per_satellite AS
SELECT 
    sat.satellite_id,
    sat.name AS satellite_name,
    sat.orbit_type,
    DATE_TRUNC('month', ri.generated_timestamp) AS assessment_month,
    COUNT(DISTINCT ri.image_id) AS total_images_produced,
    ROUND(AVG(CASE WHEN UPPER(qa.metric_type) = 'PSNR' THEN qa.score END)::numeric, 2) AS avg_psnr_db,
    ROUND(AVG(CASE WHEN UPPER(qa.metric_type) = 'SSIM' THEN qa.score END)::numeric, 4) AS avg_ssim_score
FROM satellite sat
JOIN sensor s ON sat.satellite_id = s.satellite_id
JOIN raw_frame rf ON s.sensor_id = rf.sensor_id
JOIN contributes_to ct ON rf.frame_id = ct.frame_id
JOIN reconstruction_job rj ON ct.job_id = rj.job_id
JOIN reconstructed_image ri ON rj.job_id = ri.job_id
JOIN quality_assessment qa ON ri.image_id = qa.image_id
GROUP BY sat.satellite_id, sat.name, sat.orbit_type, DATE_TRUNC('month', ri.generated_timestamp);

COMMENT ON VIEW v_quality_trend_per_satellite IS 
'Monthly average PSNR and SSIM quality metrics grouped per satellite.';


-- ----------------------------------------------------------------------------
-- VIEW 4: ANALYST PERFORMANCE AND JOB SUCCESS/FAILURE RATE
-- ----------------------------------------------------------------------------
-- Question Answered: What is the job execution history, success rate, and runtime for each analyst?
-- DBMS Concept: Aggregate function with ratio calculation and EXTRACT(EPOCH) for durations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_analyst_job_summary AS
SELECT 
    a.analyst_id,
    a.name AS analyst_name,
    a.role AS analyst_role,
    COUNT(rj.job_id) AS total_jobs_managed,
    COUNT(CASE WHEN UPPER(rj.status) IN ('SUCCESS', 'COMPLETED') THEN 1 END) AS successful_jobs,
    COUNT(CASE WHEN UPPER(rj.status) IN ('FAILED', 'CANCELLED', 'ERROR') THEN 1 END) AS failed_jobs,
    ROUND(
        (COUNT(CASE WHEN UPPER(rj.status) IN ('SUCCESS', 'COMPLETED') THEN 1 END) * 100.0 / NULLIF(COUNT(rj.job_id), 0))::numeric, 
        2
    ) AS success_rate_pct,
    ROUND(
        AVG(EXTRACT(EPOCH FROM (rj.end_time - rj.start_time)) / 60.0)::numeric, 
        2
    ) AS avg_execution_duration_minutes
FROM analyst a
LEFT JOIN reconstruction_job rj ON a.analyst_id = rj.analyst_id
GROUP BY a.analyst_id, a.name, a.role;

COMMENT ON VIEW v_analyst_job_summary IS 
'Performance summary per analyst including job success rates and average runtime.';
