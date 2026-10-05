-- ============================================================================
-- ORBITALTRACE: PostgreSQL Database Schema DDL (11 Tables)
-- Coursework Review 1 & 2 Base Schema
-- ============================================================================

-- 1. ANALYST (Strong Entity)
CREATE TABLE IF NOT EXISTS analyst (
    analyst_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(100) NOT NULL
);

-- 2. MISSION (Strong Entity)
CREATE TABLE IF NOT EXISTS mission (
    mission_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    objective TEXT,
    start_date DATE NOT NULL,
    lead_analyst_id VARCHAR(50) REFERENCES analyst(analyst_id) ON DELETE SET NULL
);

-- 3. SATELLITE (Strong Entity)
CREATE TABLE IF NOT EXISTS satellite (
    satellite_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    orbit_type VARCHAR(50) NOT NULL,
    launch_date DATE NOT NULL,
    agency VARCHAR(100) NOT NULL,
    mission_id VARCHAR(50) REFERENCES mission(mission_id) ON DELETE CASCADE
);

-- 4. SENSOR (Superclass Entity)
CREATE TABLE IF NOT EXISTS sensor (
    sensor_id VARCHAR(50) PRIMARY KEY,
    resolution VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL CHECK (sensor_type IN ('OPTICAL', 'INFRARED', 'RADAR')),
    satellite_id VARCHAR(50) REFERENCES satellite(satellite_id) ON DELETE CASCADE
);

-- 5. OPTICAL_SENSOR (Subclass)
CREATE TABLE IF NOT EXISTS optical_sensor (
    sensor_id VARCHAR(50) PRIMARY KEY REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    band_range VARCHAR(100) NOT NULL
);

-- 6. INFRARED_SENSOR (Subclass)
CREATE TABLE IF NOT EXISTS infrared_sensor (
    sensor_id VARCHAR(50) PRIMARY KEY REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    wavelength_range VARCHAR(100) NOT NULL
);

-- 7. RADAR_SENSOR (Subclass)
CREATE TABLE IF NOT EXISTS radar_sensor (
    sensor_id VARCHAR(50) PRIMARY KEY REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    frequency_band VARCHAR(100) NOT NULL
);

-- 8. CALIBRATION_RECORD (Weak Entity)
CREATE TABLE IF NOT EXISTS calibration_record (
    sensor_id VARCHAR(50) REFERENCES sensor(sensor_id) ON DELETE CASCADE,
    calibration_date TIMESTAMP WITH TIME ZONE NOT NULL,
    offset_parameters TEXT NOT NULL,
    PRIMARY KEY (sensor_id, calibration_date)
);

-- 9. RAW_FRAME (Strong Telemetry Entity)
CREATE TABLE IF NOT EXISTS raw_frame (
    frame_id VARCHAR(50) PRIMARY KEY,
    capture_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    altitude NUMERIC(10, 2) NOT NULL,
    cloud_cover_pct NUMERIC(5, 2) NOT NULL CHECK (cloud_cover_pct BETWEEN 0 AND 100),
    status VARCHAR(50) NOT NULL,
    sensor_id VARCHAR(50) REFERENCES sensor(sensor_id) ON DELETE CASCADE
);

-- 10. RECONSTRUCTION_JOB (Strong Process Entity)
CREATE TABLE IF NOT EXISTS reconstruction_job (
    job_id VARCHAR(50) PRIMARY KEY,
    algorithm_used VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    analyst_id VARCHAR(50) REFERENCES analyst(analyst_id) ON DELETE SET NULL
);

-- 11. RECONSTRUCTED_IMAGE (Strong Entity with Recursive Self-FK)
CREATE TABLE IF NOT EXISTS reconstructed_image (
    image_id VARCHAR(50) PRIMARY KEY,
    resolution VARCHAR(50) NOT NULL,
    output_format VARCHAR(50) NOT NULL,
    generated_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    job_id VARCHAR(50) REFERENCES reconstruction_job(job_id) ON DELETE CASCADE,
    original_image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE SET NULL
);

-- 12. QUALITY_ASSESSMENT (Weak Entity)
CREATE TABLE IF NOT EXISTS quality_assessment (
    image_id VARCHAR(50) REFERENCES reconstructed_image(image_id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,
    score NUMERIC(8, 4) NOT NULL,
    assessed_by VARCHAR(50) REFERENCES analyst(analyst_id) ON DELETE SET NULL,
    PRIMARY KEY (image_id, metric_type)
);

-- 13. CONTRIBUTES_TO (M:N Bridge Entity)
CREATE TABLE IF NOT EXISTS contributes_to (
    frame_id VARCHAR(50) REFERENCES raw_frame(frame_id) ON DELETE CASCADE,
    job_id VARCHAR(50) REFERENCES reconstruction_job(job_id) ON DELETE CASCADE,
    contribution_weight NUMERIC(5, 4) NOT NULL CHECK (contribution_weight BETWEEN 0 AND 1),
    PRIMARY KEY (frame_id, job_id)
);
