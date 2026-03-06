# Reporting Module v0.1 — Claude Code Configuration

## Project Structure
- **Frontend**: React 18 + Vite + Tailwind CSS (`/Frontend`)
- **Backend**: `/backend`
- **Docs**: `/docs`, `/Docs_Silos_Final`

## Design System (UI UX Pro Max)
- This is a **data-heavy reporting UI** — dashboards, charts, data grids
- Tech stack: React / Vite + Tailwind
- Design direction: Clean, professional, high-contrast — prioritize readability over decoration
- Chart library: Chart.js (react-chartjs-2)
- Table library: TanStack (via 21st.dev components when available)
- When designing, always generate a design system first (colors, typography, spacing scale)
  before writing any component code

## 21st.dev Component Integration
- Browse components at 21st.dev for data tables, chart cards, KPI widgets
- Claude Code can fetch and integrate 21st.dev components directly into the React project
- Prefer 21st.dev components for: data tables, chart cards, KPI cards, metric displays

## Frontend Design Skill
- The Anthropic frontend-design skill is installed at `.claude/skills/frontend-design/`
- Use it for all UI/component work to ensure high design quality
- Avoid generic AI aesthetics — make bold, distinctive choices specific to industrial reporting context
