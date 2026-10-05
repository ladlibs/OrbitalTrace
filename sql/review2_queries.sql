-- ============================================================================
-- ORBITALTRACE: DBMS Coursework — Review 2 Demonstrative SQL Queries
-- PostgreSQL / Supabase Compatible
-- ============================================================================

-- ----------------------------------------------------------------------------
-- QUERY 1: RAW FRAME LINEAGE & CONTRIBUTION WEIGHTS FOR A GIVEN JOB
-- Purpose: Retrieves all raw satellite frames used in a specific job, including
--          cloud cover, sensor specs, and weight contribution.
-- DBMS Concept: Multi-table INNER JOIN with WHERE filter.
-- ----------------------------------------------------------------------------
SELECT 
    job_id,
    algorithm_used,
    analyst_name,
    frame_id,
    capture_timestamp,
    cloud_cover_pct,
    contribution_weight,
    sensor_type,
    satellite_name,
    mission_name
FROM v_job_frame_contributions
-- Note: Replace 1 with an existing job_id in your database (e.g. 1, 2, or 'JOB-101' if string)
WHERE job_id = 1 
ORDER BY contribution_weight DESC;


-- ----------------------------------------------------------------------------
-- QUERY 2: FULL REFINEMENT ANCESTRY FOR A RECONSTRUCTED IMAGE
-- Purpose: Traces the exact lineage chain from a final refined image all the way
--          back to its original first-attempt image using recursive CTE.
-- DBMS Concept: WITH RECURSIVE query for hierarchy traversal.
-- ----------------------------------------------------------------------------
WITH RECURSIVE image_lineage AS (
    -- Anchor member: Target image
    SELECT 
        image_id,
        resolution,
        output_format,
        generated_timestamp,
        job_id,
        original_image_id,
        0 AS depth
    FROM reconstructed_image
    -- Note: Replace 1 with target image_id in your database (e.g. 1, 2, 4)
    WHERE image_id = 1 

    UNION ALL

    -- Recursive member: Traverse upwards to parent image
    SELECT 
        ri.image_id,
        ri.resolution,
        ri.output_format,
        ri.generated_timestamp,
        ri.job_id,
        ri.original_image_id,
        il.depth + 1 AS depth
    FROM reconstructed_image ri
    JOIN image_lineage il ON ri.image_id = il.original_image_id
)
SELECT 
    il.depth AS steps_back_from_target,
    il.image_id,
    il.resolution,
    il.output_format,
    il.generated_timestamp,
    il.job_id,
    CASE 
        WHEN il.original_image_id IS NULL THEN 'ROOT (Original First Attempt)'
        ELSE 'REFINED FROM ' || il.original_image_id::text
    END AS refinement_status
FROM image_lineage il
ORDER BY il.depth ASC;


-- ----------------------------------------------------------------------------
-- QUERY 3: JSONB PARAMETER FILTERING (PostgreSQL Native JSON Querying)
-- Purpose: Finds all reconstruction jobs that used a specific algorithm parameter,
--          demonstrating semi-structured data querying in Postgres.
-- DBMS Concept: JSONB containment operators (`@>`, `->>`).
-- ----------------------------------------------------------------------------
SELECT 
    job_id,
    algorithm_used,
    parameters->>'iterations' AS iterations,
    parameters->>'learning_rate' AS learning_rate,
    status,
    start_time,
    end_time
FROM reconstruction_job
WHERE parameters->>'iterations' IS NOT NULL 
   OR parameters @> '{"algorithm_mode": "high_res"}'
ORDER BY start_time DESC;


-- ----------------------------------------------------------------------------
-- QUERY 4: QUALITY IMPROVEMENT: FIRST ATTEMPT VS. REFINED IMAGES
-- Purpose: Compares average quality scores (PSNR & SSIM) between original initial
--          reconstruction attempts and refined retry iterations.
-- DBMS Concept: Aggregate GROUP BY with JOIN on View.
-- ----------------------------------------------------------------------------
SELECT 
    anc.is_first_attempt,
    CASE 
        WHEN anc.is_first_attempt THEN 'First Attempt' 
        ELSE 'Refined Image' 
    END AS attempt_category,
    COUNT(DISTINCT anc.image_id) AS total_images,
    ROUND(AVG(CASE WHEN UPPER(qa.metric_type) = 'PSNR' THEN qa.score END)::numeric, 2) AS avg_psnr,
    ROUND(AVG(CASE WHEN UPPER(qa.metric_type) = 'SSIM' THEN qa.score END)::numeric, 4) AS avg_ssim
FROM v_image_refinement_ancestry anc
JOIN quality_assessment qa ON anc.image_id = qa.image_id
GROUP BY anc.is_first_attempt;


-- ----------------------------------------------------------------------------
-- QUERY 5: ANALYST WORKLOAD & RELIABILITY SCORECARD
-- Purpose: Retrieves job metrics, failure percentages, and active roles per analyst.
-- DBMS Concept: Querying aggregate view `v_analyst_job_summary`.
-- ----------------------------------------------------------------------------
SELECT 
    analyst_id,
    analyst_name,
    analyst_role,
    total_jobs_managed,
    successful_jobs,
    failed_jobs,
    success_rate_pct || '%' AS success_rate,
    COALESCE(avg_execution_duration_minutes::text, 'N/A') || ' mins' AS avg_duration
FROM v_analyst_job_summary
ORDER BY total_jobs_managed DESC;
