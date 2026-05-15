# AI Pages Consolidation — Plan

**Branch:** `Salalah_Mill_B`
**Date:** 2026-05-07
**Goal:** Collapse 3 AI pages in the navbar (Hercules AI, Hercules Atlas, Atlas AI) into 1 (Atlas AI), and move all setup/config to Settings.

## End state

**Navbar — single AI entry:** Atlas AI

**Atlas AI tabs (4):**
1. **Forecast** — verdict bar + production/cost forecast (was Hercules Atlas)
2. **Production** — existing
3. **PdM** — existing
4. **Yield** — existing

**Settings — new "AI" section** (sub-page):
- Provider toggle: Cloud Claude / Local LM Studio
- Model picker: Haiku / Sonnet / Opus (with cost label)
- API key field (show/hide)
- Test connection button
- Scan tags button + classification table (used by email distribution AI summaries)

**Deleted:**
- `/atlas` route + `Frontend/src/Pages/Atlas/` directory
- `/hercules-ai` and `/hercules-ai/settings` routes + `Frontend/src/Pages/HerculesAI/` directory
- Navbar entries for both
- Backend savings ledger code stays dormant (no UI consumer; can be deleted in a follow-up)

## Why no Savings tab

The `ai_savings_ledger` table is empty in production. `savings_ledger.record()` is defined in `backend/ai_money/savings_ledger.py:30` but never called anywhere. The detector modules (`yield_drift.py`, `pf_penalty.py`) compute numbers but don't write to the ledger. Surfacing "Hercules saved you X OMR" with no real entries would burn customer trust.

## Branch protocol

- Worktree branch is `claude/elastic-shockley-f26891`. Final merge target: `Salalah_Mill_B`.
- Every push to `Salalah_Mill_B` triggers an ~8 min installer build (`.github/workflows/build-ota-update.yml`). Batch commits before pushing.
- Also push to `main` after `Salalah_Mill_B` lands.

## Step 1 — Build the Forecast tab inside Atlas AI

**Add:** `Frontend/src/Pages/AtlasAI/tabs/ForecastTab.jsx`

Port the four pieces from `Pages/Atlas/AtlasPage.jsx`, redrawn in Atlas AI's design language (ambient/glass cards, mono fonts, neon accents, no `useLanguage().t()` — hardcoded English per user direction):

- AI verdict bar (single sentence with `{gold:…}/{good:…}/{hi:…}` token highlights)
- Production hero (NOW → AI EOD, delta-vs-plan badge)
- Production cumulative chart (actual + dashed forecast + confidence band)
- Energy cost hero (NOW → next-shift, savings badge in OMR)
- Energy cost trend chart
- KPI strip (Pace · Yield · Energy · Maintenance)

**Reuse data source:** `Pages/Atlas/data/mockSnapshot.js` — copy into `Pages/AtlasAI/data/forecastMock.js` so we can delete the old Atlas folder cleanly. Same shape; future Phase 2 swap to `/api/hercules-ai/mill-b-snapshot` is one line.

**Update tab list in** `Frontend/src/Pages/AtlasAI/AtlasAIPage.jsx`:
- Add `{ key: 'forecast', label: 'Forecast', icon: <…> }` as the **first** entry
- Make `'forecast'` the default `useState('forecast')`
- Add `{active === 'forecast' && <ForecastTab />}` to the render switch

## Step 2 — Build the Settings → AI section

**Add:** `Frontend/src/Pages/Settings/AI/AISettings.jsx` (new sub-page)

Sections:
1. **Provider** — toggle Cloud Claude / Local LM Studio (writes to `/api/hercules-ai/config`)
2. **Model** — radio cards: Haiku / Sonnet / Opus with cost label
3. **API Key** — password input with show/hide eye, Test Connection button
4. **Tag Classification** — Scan button + table of tags with detected type (counter / rate / boolean / etc.) and editable type column. Saves to `/api/hercules-ai/profiles`. Note in the section header: "Used by email distribution AI summaries."

**Reuse logic from** `Pages/HerculesAI/HerculesAISetup.jsx` — copy the API-calling functions (`herculesAIApi.scan`, `setProfiles`, `testConnection`, `setConfig`) but **do not** copy the framer-motion wizard chrome, BoardroomCard, RoiSurface, or stages. Just the forms.

**Wire into Settings:**
- Add to `Pages/Settings/SettingsHome.jsx` (or wherever the settings index lives) — new card linking to `/settings/ai`
- Add route in `Frontend/src/Routes/AppRoutes.jsx`

## Step 3 — Update routing & navbar

**`Frontend/src/Routes/AppRoutes.jsx`:**
- Remove imports: `HerculesAISetup`, `HerculesAISettingsPage`, `AtlasPage`
- Remove `<Route path="hercules-ai">`, `<Route path="hercules-ai/settings">`, `<Route path="atlas">`
- Keep `<Route path="atlas-ai">` → `AtlasAIPage`
- Add `<Route path="settings/ai">` → `AISettings`

**`Frontend/src/Data/Navbar.js`:**
- Remove the `nav.herculesAI` entry
- Remove the `nav.atlas` entry
- Keep `nav.atlasAI` entry
- Remove the now-unused translation keys for `nav.herculesAI`, `nav.atlas`, and their tooltips from all 4 i18n files (`en.json`, `ar.json`, `hi.json`, `ur.json`)

## Step 4 — Delete old code

After Step 1–3 land and verification passes:

```
rm -rf Frontend/src/Pages/Atlas/
rm -rf Frontend/src/Pages/HerculesAI/
```

Backend stays untouched in this PR:
- `hercules_ai_bp.py` blueprint is still used by Settings → AI (config, scan, profiles, test-connection)
- `ai_money/` directory (savings_ledger, pf_penalty, yield_drift, payload_builder) becomes orphaned — no UI consumer. Safe to delete in a follow-up but **not** in this PR (keeps blast radius small).
- The `/api/hercules-ai/savings*` endpoints become unused — leave for now.

## Step 5 — Verification checklist

Local:
- [ ] `/atlas-ai` loads with Forecast as default tab
- [ ] All 4 tabs render without console errors
- [ ] Forecast tab shows verdict bar, both heroes, both charts, KPI strip
- [ ] Light/dark theme toggle works on Forecast tab
- [ ] Tab indicator slides correctly across all 4 tabs
- [ ] `/settings/ai` loads — provider toggle, model picker, API key, scan all work
- [ ] Test connection succeeds for Cloud Claude
- [ ] Tag scan returns profiles, table renders, edits save
- [ ] `/atlas` and `/hercules-ai` redirect/404 cleanly (no console errors)
- [ ] Navbar shows only "Atlas AI" in the AI section
- [ ] Email distribution AI summaries still work (regression — they consume the same `/api/hercules-ai/profiles`)

Build:
- [ ] `npm run build` (Frontend) succeeds with no warnings about missing modules
- [ ] PyInstaller `hercules.spec` doesn't need changes (no new blueprints, no new Python deps)

## Step 6 — Push

```
git checkout Salalah_Mill_B
git merge claude/elastic-shockley-f26891
git push origin Salalah_Mill_B   # triggers ~8 min installer build
git checkout main
git merge Salalah_Mill_B
git push origin main
```

## Open questions

- **Forecast tab data source** — stays mock for this PR. Phase 2 wires `/api/hercules-ai/mill-b-snapshot` (separate plan).
- **Backend cleanup of `ai_money/` and `/api/hercules-ai/savings*`** — defer to a follow-up PR after this lands stable.
- **Existing `hercules_ai_*` DB tables** — leave in place. No migration in this PR.
