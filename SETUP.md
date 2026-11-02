# OrbitalTrace — Complete Machine Setup & Installation Guide

This document provides step-by-step instructions to set up, configure, and run **OrbitalTrace** on any local machine (macOS, Ubuntu/Linux, or Windows WSL2).

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Repository Setup](#2-repository-setup)
3. [Supabase Setup (Database & Storage)](#3-supabase-setup-database--storage)
4. [Environment Variables Configuration](#4-environment-variables-configuration)
5. [Backend Setup (FastAPI + Python)](#5-backend-setup-fastapi--python)
6. [Frontend Setup (React + Vite)](#6-frontend-setup-react--vite)
7. [Automated Pipeline Seeding (Diamond DAG)](#7-automated-pipeline-seeding-diamond-dag)
8. [Verifying the Web Console](#8-verifying-the-web-console)
9. [Troubleshooting & FAQs](#9-troubleshooting--faqs)

---

## 1. Prerequisites

Ensure the following tools are installed on your machine:

| Requirement | Recommended Version | Verification Command |
| :--- | :--- | :--- |
| **Node.js** | `v18.x` or `v20.x`+ (LTS) | `node -v` |
| **npm** | `v9.x` or `v10.x`+ | `npm -v` |
| **Python** | `3.10`, `3.11`, `3.12`, or `3.14` | `python3 --version` |
| **Git** | `v2.x`+ | `git --version` |
| **Supabase** | Free Cloud Project or Local CLI | [https://supabase.com](https://supabase.com) |

> [!NOTE]
> For Windows users, running via **WSL2 (Windows Subsystem for Linux)** with Ubuntu is strongly recommended for standard POSIX environment compatibility.

---

## 2. Repository Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/OrbitalTrace.git
   cd OrbitalTrace
   ```

2. **Verify repository structure:**
   Ensure the following top-level directories exist:
   ```text
   OrbitalTrace/
   ├── backend/     # FastAPI processing service
   ├── src/         # React 18 + Vite frontend
   ├── sql/         # Database migrations
   ├── scripts/     # Automation & seeding scripts
   └── frames/      # Calibration test frames & continuous masks
   ```

---

## 3. Supabase Setup (Database & Storage)

OrbitalTrace relies on Supabase for PostgreSQL, Storage Buckets, and Row Level Security.

### 3.1 Create a Supabase Project
1. Log in to [Supabase Console](https://app.supabase.com) and click **New Project**.
2. Name your project (e.g., `orbitaltrace`), set a database password, and select your preferred region.
3. Wait for the project initialization to complete.

### 3.2 Retrieve Your Project Credentials
In your Supabase project dashboard, navigate to **Project Settings** → **API**:
* **Project URL:** e.g., `https://xyzcompany.supabase.co`
* **anon public key:** (used by the frontend)
* **service_role secret key:** (used by the FastAPI backend to read/write storage and bypass RLS for pipeline execution)

### 3.3 Create the Storage Bucket
In your Supabase dashboard, navigate to **Storage**:
1. Click **New Bucket**.
2. Set Bucket Name to: **`satellite-images`**
3. Toggle **Public Bucket** to **ON** (so generated image layers can be rendered in the browser).
4. Click **Save**.

The application automatically creates and manages the following folder hierarchy inside `satellite-images`:
```text
satellite-images/
├── raw-frames/       # Uploaded sensor telemetry images
├── cloud-masks/      # Continuous float32 cloud masks
├── ground-truths/    # Reference high-resolution validation images
└── outputs/          # Reconstructed images and 5 provenance tensor layers
```

### 3.4 Deploy the Database Schema & Migrations
In your Supabase project dashboard, navigate to the **SQL Editor** and run the following scripts located in `sql/` **in order**:

#### Step 1: Base Tables (`sql/schema.sql`)
Creates the 11 core relational tables: `analyst`, `mission`, `satellite`, `sensor`, `raw_frame`, `reconstruction_job`, `reconstructed_image`, `contributes_to`, `quality_assessment`, `provenance_layer`, `tile_summary`, `tile_source`.
* Open [sql/schema.sql](file:///Users/spunky/Desktop/dbs/OrbitalTrace/sql/schema.sql), paste into the SQL Editor, and click **Run**.

#### Step 2: IDF Provenance Expansion (`sql/idf_migration.sql`)
Expands the `provenance_layer` constraint to support `SYNTHETIC_SHARE` and `SOURCE_WEIGHT`, and adds `record_hash` and `algorithm_used` to `reconstruction_job`.
* Open [sql/idf_migration.sql](file:///Users/spunky/Desktop/dbs/OrbitalTrace/sql/idf_migration.sql), paste into the SQL Editor, and click **Run**.

#### Step 3: Permissions & Column Backfills (`sql/fix_permissions_and_schema.sql`)
Grants service-role permissions and ensures `image_url` and `mask_url` exist on `raw_frame`.
* Open [sql/fix_permissions_and_schema.sql](file:///Users/spunky/Desktop/dbs/OrbitalTrace/sql/fix_permissions_and_schema.sql), paste into the SQL Editor, and click **Run**.

#### Step 4: Enable Reconstructed Images as Downstream Inputs (`sql/enable_reconstructed_as_frames.sql`)
Allows reconstructed images to be fed into subsequent multi-generation jobs as parent frames.
* Open [sql/enable_reconstructed_as_frames.sql](file:///Users/spunky/Desktop/dbs/OrbitalTrace/sql/enable_reconstructed_as_frames.sql), paste into the SQL Editor, and click **Run**.

#### Step 5: Analyst Seed Record
Ensure at least one Analyst record exists in the `analyst` table so jobs can be attributed:
```sql
INSERT INTO public.analyst (analyst_id, name, role)
VALUES (1, 'Lead Analyst', 'Senior Remote Sensing Specialist')
ON CONFLICT (analyst_id) DO NOTHING;
```

---

## 4. Environment Variables Configuration

### 4.1 Frontend Environment (`.env.local`)
Create a file named `.env.local` in the **root directory**:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
# Supabase Project Connection
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key

# FastAPI Backend URL
VITE_API_URL=http://localhost:8000
```

### 4.2 Backend Environment (`backend/.env`)
Create a file named `.env` inside the **`backend/`** directory:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
# Supabase Service Role Connection (Bypasses RLS for pipeline execution)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-secret-key

# API Settings
VITE_API_URL=http://localhost:8000
```

> [!CAUTION]
> Never commit `backend/.env` or `.env.local` to version control. They are already listed in `.gitignore`.

---

## 5. Backend Setup (FastAPI + Python)

The backend service runs FastAPI, executing multi-frame fusion, provenance tensor generation, and cryptographic signing.

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create a Python virtual environment:**
   ```bash
   python3 -m venv venv
   ```

3. **Activate the virtual environment:**
   * **macOS / Linux:**
     ```bash
     source venv/bin/activate
     ```
   * **Windows (PowerShell):**
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * **Windows (Command Prompt):**
     ```cmd
     .\venv\Scripts\activate.bat
     ```

4. **Install Python dependencies:**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

5. **Run the Automated Verification Test Suite:**
   Before launching the server, verify that the mathematical provenance engine passes all invariant tests:
   ```bash
   python tests/test_layers.py
   ```
   **Expected Output:**
   ```text
   [STEP 3: Invariant I1 Verification]
     • Max Invariant I1 Deviation: 1.19e-07 (Required: < 1.00e-06)
     ✓ PASS: Invariant I1 strictly satisfied.
   [STEP 4: Synthetic Share (S) Characteristics]
     • Unique S values: 4312 (Required: > 100)
     ✓ PASS: Synthetic share is continuous and non-binary.
   [STEP 5: CLASS_MAP Classification Distribution]
     ✓ PASS: All 3 invariant classes (OBSERVED, WEAK, SYNTHESIZED) actively present.
   [STEP 6: Pairwise Non-Redundancy Correlations]
     ✓ PASS: All layer pairs are non-redundant and have |r| < 0.95.
   🎉 ALL TESTS PASSED: PROVENANCE ENGINE END-TO-END VERIFIED.
   ```

6. **Start the FastAPI Development Server:**
   ```bash
   fastapi dev main.py
   # Or using uvicorn directly:
   # uvicorn main:app --reload --port 8000
   ```
   The backend API will start on: **`http://localhost:8000`**  
   Health check endpoint: **`http://localhost:8000/health`** (returns `{"ok": true}`)

---

## 6. Frontend Setup (React + Vite)

Open a **new terminal tab or window** for the frontend application.

1. **Navigate to the root directory:**
   ```bash
   cd OrbitalTrace
   ```

2. **Install Node packages:**
   ```bash
   npm install
   ```

3. **Verify the production build:**
   ```bash
   npm run build
   ```
   This compiles TypeScript and packages Vite assets into `dist/` with zero type errors.

4. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   The web application will be live at: **`http://localhost:5173`**

---

## 7. Automated Pipeline Seeding (Diamond DAG)

To immediately populate your console with the complete 3-generation diamond DAG topology, per-pixel provenance tensors, and gating telemetry:

Make sure both the **FastAPI backend** and **Supabase storage** are running, then execute the automated seeder script from the root directory:

```bash
python scripts/seed_idf_screenshots.py
```

### What this script performs:
1. **Pristine Ground Truth Setup:** Uploads the reference satellite image to `ground-truths/canonical_ground_truth.png`.
2. **Progressive Raw Frames:** Configures Raw Frames `11, 12, 13, 14` with progressive cloud cover ($5\%, 20\%, 40\%, 60\%$) and continuous float32 masks.
3. **Generation 1 — Base Multi-Frame Fusion (Job A):** Fuses the 4 raw frames using POCS ($r_a = 0.0$), generating Root Image `#6`.
4. **Generation 2 — Parallel Branch 1 (Job B):** Refines Root Image ($0.60$) + Frame 11 ($0.40$), generating Image `#7`.
5. **Generation 2 — Parallel Branch 2 (Job C):** Refines Root Image ($0.60$) + Frame 12 ($0.40$), generating Image `#8`.
6. **Generation 3 — Diamond Merge (Job D):** Fuses Branch 1 ($0.50$) + Branch 2 ($0.50$), generating Diamond Merge Image `#9` with exact Invariant I1 conservation ($\text{dev } < 10^{-6}$).
7. **Generation 4 — Generative Super-Resolution Pass (Job E):** Enhances Diamond Merge using ESRGAN ($r_a = 0.35$), generating Image `#10` with $35.0\%$ logged GCI.
8. **Generation 4 — Quality Anomaly Gate (Job F):** Injects adversarial regression ($\Delta\text{SSIM} > +0.02 \land \Delta\text{PSNR} < -1.50\text{ dB}$), locking Image `#11` into `QUARANTINE_BLOCK`.
9. **Cryptographic Signing:** Computes SHA-256 DAG hashes ($H_J$) and generates 256-bit Ed25519 digital signatures ($\sigma_J$), saving the audit log to `backend/data/audit_log.json`.

---

## 8. Verifying the Web Console

Open your browser to **`http://localhost:5173`**:

### 1. Lineage DAG (`/lineage`)
* View the 3-generation diamond graph.
* Verify the top row shows 4 raw telemetry frames.
* Click on any Job or Image node to view its parameters ($r_a$, GCI, PSNR, SSIM).
* Inspect the Quarantined node rendered in red with `QUARANTINED` badge.

### 2. Provenance Pixel Inspector (`/inspect/9`)
Navigate to Image `#9` (Diamond Merge):
* Toggle between layers: `IMAGE`, `GROUND_TRUTH`, `ERROR_MAP`, `CLASS_MAP`, `UNCERTAINTY`, `SOURCE_INDEX`, and `SYNTHETIC_SHARE`.
* **Pixel Mode:** Hover anywhere on the image crosshair to inspect exact $(x, y)$ coordinates, 3-state class decoding (Green = Observed, Amber = Weak, Red = Synthesized), uncertainty, and synthetic share.
* **Tile Mode:** Inspect $32 \times 32$ block telemetry showing observed %, weak %, synthesized %, and individual sensor contribution percentages.

### 3. Log a New Job (`/jobs/new`)
* Test creating a custom job by selecting input frames or reconstructed products.
* Assign blending weights and choose an algorithm (e.g., POCS, Bicubic, ESRGAN).
* Submit the job — the frontend calls `POST /jobs/{job_id}/run`, which executes asynchronously on the FastAPI backend and refreshes in the UI upon completion.

---

## 9. Troubleshooting & FAQs

### Q: Why do my layers look completely black or uniform?
* **Cause:** The raw frames were uploaded without cloud masks, causing the cloud mask generator to default to zero everywhere.
* **Fix:** The updated backend automatically creates a continuous float32 sigmoid mask calibrated to the frame's `cloud_cover_pct` when missing. Run `python scripts/seed_idf_screenshots.py` to ensure all 4 frames have their masks uploaded to `cloud-masks/`.

### Q: `AssertionError: Invariant I1 violation: max dev >= 1e-4`
* **Cause:** When loading parent reconstructed images, decoding the RGB inferno PNG colormap introduces rounding errors.
* **Fix:** `backend/main.py` has been updated to load the uncompressed float32 `.npy` array from `meta.raw_npy_url` and derive synthetic share strictly via conservation: $S_{\text{parent}} \equiv 1.0 - \sum_f W[f]$. This guarantees deviation $< 1.19 \times 10^{-7}$.

### Q: Supabase returned `ERROR: 42501: Direct deletion from storage tables is not allowed`
* **Cause:** Supabase security triggers prevent direct SQL `DELETE FROM storage.objects`.
* **Fix:** Use the official Python Storage API utility provided in [`scripts/reset_everything.py`](file:///Users/spunky/Desktop/dbs/OrbitalTrace/scripts/reset_everything.py) (`supabase.storage.from_('satellite-images').remove()`) which safely paginates and deletes files through the authorized Storage API.

### Q: CORS error when submitting a job from `localhost:5173` to `localhost:8000`
* **Cause:** FastAPI CORS middleware is restricting the request origin.
* **Fix:** Ensure `backend/main.py` contains:
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["http://localhost:5173"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```

### Q: Ed25519 signing key missing
* **Fix:** `backend/main.py` automatically generates a new 256-bit key at `backend/keys/ed25519_key.pem` on first run if it does not already exist.

---

## 📞 Support & Maintenance

For questions or issues with this setup:
* Run `python backend/tests/test_layers.py` to verify the mathematical engine.
* Review [PROJECT_DOCUMENTATION.md](file:///Users/spunky/Desktop/dbs/OrbitalTrace/PROJECT_DOCUMENTATION.md) for architectural notes.
