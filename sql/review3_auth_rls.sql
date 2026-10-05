-- ============================================================================
-- ORBITALTRACE: DBMS Coursework — Review 3 Auth & Row Level Security (RLS)
-- PostgreSQL / Supabase Compatible
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD Auth_UID TO ANALYST TABLE
-- ----------------------------------------------------------------------------
-- Links each row in the ANALYST table to a Supabase Auth user (auth.users)
ALTER TABLE analyst 
ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTION TO GET CURRENT ANALYST_ID
-- Returns the Analyst_ID of the currently authenticated Supabase user
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_analyst_id()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_analyst_id VARCHAR(50);
BEGIN
    SELECT analyst_id INTO v_analyst_id
    FROM analyst
    WHERE auth_uid = auth.uid();
    
    RETURN v_analyst_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY (RLS) ON CORE TABLES
-- Rule: All authenticated users can SELECT all data.
--       Analysts can only INSERT / UPDATE / DELETE rows attributed to themselves.
-- ----------------------------------------------------------------------------

-- ANALYST Table
ALTER TABLE analyst ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all logged-in analysts"
ON analyst FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow analysts to update their own profile"
ON analyst FOR UPDATE TO authenticated USING (auth_uid = auth.uid());


-- MISSION Table (Read-only for analysts)
ALTER TABLE mission ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all missions"
ON mission FOR SELECT TO authenticated USING (true);


-- SATELLITE Table (Read-only for analysts)
ALTER TABLE satellite ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all satellites"
ON satellite FOR SELECT TO authenticated USING (true);


-- SENSOR & Subclasses (Read-only for analysts)
ALTER TABLE sensor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all sensors" ON sensor FOR SELECT TO authenticated USING (true);

ALTER TABLE optical_sensor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read optical sensors" ON optical_sensor FOR SELECT TO authenticated USING (true);

ALTER TABLE infrared_sensor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read infrared sensors" ON infrared_sensor FOR SELECT TO authenticated USING (true);

ALTER TABLE radar_sensor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read radar sensors" ON radar_sensor FOR SELECT TO authenticated USING (true);


-- RAW_FRAME Table (Read-only for analysts)
ALTER TABLE raw_frame ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to raw frames"
ON raw_frame FOR SELECT TO authenticated USING (true);


-- RECONSTRUCTION_JOB Table (View all, create/edit only your own)
ALTER TABLE reconstruction_job ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all jobs"
ON reconstruction_job FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow analysts to create jobs attributed to themselves"
ON reconstruction_job FOR INSERT TO authenticated
WITH CHECK (analyst_id = get_current_analyst_id());

CREATE POLICY "Allow analysts to update their own jobs"
ON reconstruction_job FOR UPDATE TO authenticated
USING (analyst_id = get_current_analyst_id());


-- CONTRIBUTES_TO Table
ALTER TABLE contributes_to ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to contributes_to"
ON contributes_to FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow job creator to manage frame contributions"
ON contributes_to FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM reconstruction_job rj
        WHERE rj.job_id = contributes_to.job_id
        AND rj.analyst_id = get_current_analyst_id()
    )
);


-- RECONSTRUCTED_IMAGE Table
ALTER TABLE reconstructed_image ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all reconstructed images"
ON reconstructed_image FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow analysts to insert images for their own jobs"
ON reconstructed_image FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM reconstruction_job rj
        WHERE rj.job_id = reconstructed_image.job_id
        AND rj.analyst_id = get_current_analyst_id()
    )
);


-- QUALITY_ASSESSMENT Table
ALTER TABLE quality_assessment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to quality assessments"
ON quality_assessment FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow analysts to record quality assessments"
ON quality_assessment FOR INSERT TO authenticated
WITH CHECK (true);
