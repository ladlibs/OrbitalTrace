const fs = require('fs');
const path = require('path');

const filesToInclude = [
  'src/main.tsx',
  'src/App.tsx',
  'src/lib/supabase/client.ts',
  'src/pages/LoginPage.tsx',
  'src/pages/DashboardPage.tsx',
  'src/pages/AddRawFramePage.tsx',
  'src/pages/LogNewJobPage.tsx',
  'src/pages/JobsPage.tsx',
  'src/pages/LineagePage.tsx',
  'src/components/Tooltip.tsx',
  'types/database.types.ts',
  'sql/schema.sql'
];

let markdown = `# OrbitalTrace Console - Project Documentation

## Architecture Overview
OrbitalTrace is a modern, single-page React application built with Vite and Tailwind CSS. It serves as an Analyst Console for a satellite imagery reconstruction pipeline. 

**Key Technologies:**
- **Frontend Framework:** React 18 (via Vite)
- **Routing:** React Router v7 (\`createBrowserRouter\`)
- **Styling:** Tailwind CSS + Lucide React (Icons)
- **State & Graph Visualization:** React Flow (\`@xyflow/react\`) for rendering the image lineage tree.
- **Backend & Auth:** Supabase (PostgreSQL, Row Level Security, Storage, Authentication).

## How the App Works (End-to-End Flow)
1. **Authentication (\`LoginPage.tsx\`):** Analysts log in using Supabase Auth. The session is managed globally in \`App.tsx\`.
2. **Dashboard (\`DashboardPage.tsx\`):** Provides high-level metrics (Total jobs, Satellites, Active workflows) fetched directly from the database views.
3. **Raw Frame Ingestion (\`AddRawFramePage.tsx\`):** Analysts upload actual raw satellite image files to Supabase Storage, linking them to a specific Satellite & Sensor, and saving the public URL to the \`raw_frame\` table.
4. **Job Logging (\`LogNewJobPage.tsx\`):** Analysts select noisy raw frames, assign contribution weights, choose a reconstruction algorithm (e.g., POCS, ESRGAN) with JSON hyperparameters, and log a job as 'RUNNING' in the \`reconstruction_job\` table.
5. **Job QA & Completion (\`JobsPage.tsx\`):** Analysts view their running jobs and mark them as 'COMPLETED'. They input the output resolution (GSD), output format, and Quality Assessment metrics (PSNR and SSIM) which are stored in the \`quality_assessment\` table.
6. **Provenance Lineage (\`LineagePage.tsx\`):** A dynamic React Flow graph that queries the database to visualize the entire family tree of an image (Raw Frames -> Job -> Reconstructed Image -> Refinement Job -> Refined Image).

---

## Directory Structure & Codebase
Below is the full source code for the core application files.

`;

for (const file of filesToInclude) {
  try {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(file).replace('.', '');
      markdown += `### ${file}\n\n` +
                  `\`\`\`${ext === 'tsx' || ext === 'ts' ? 'tsx' : ext}\n` +
                  content +
                  `\n\`\`\`\n\n---\n\n`;
    } else {
      markdown += `### ${file}\n\n*(File not found)*\n\n---\n\n`;
    }
  } catch (err) {
    console.error('Error reading ' + file, err);
  }
}

fs.writeFileSync('PROJECT_DOCUMENTATION.md', markdown);
console.log('Successfully created PROJECT_DOCUMENTATION.md');
