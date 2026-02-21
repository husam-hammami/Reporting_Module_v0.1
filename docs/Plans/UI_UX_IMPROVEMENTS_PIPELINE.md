# UI/UX Improvements Pipeline — Overview

> **Purpose:** Add SMTP/Shifts config, User Management overhaul, Typography/Color fixes, ColumnEditor dark mode, MUI Tooltips, Live Data Indicator, Silo Widget SVG upgrade, Export PDF/PNG, and full QA pipeline.
>
> **Date:** 2026-02-19
> **Branch:** `demo-pipeline-wiring`
> **Project root:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config`

---

## Execution Order

```
Plan A (Backend + Settings Infrastructure)    ─── run in PARALLEL ───    Plan B-1 (UI/UX Polish)
         6 agents, ~60-75 min                                              4 agents, ~35 min
                        \                                                   /
                         \                                                 /
                          └──────── BOTH complete ────────────────────────┘
                                          |
                                Plan B-2 (Export, QA & Commit)
                                    4 agents, ~60 min
```

---

## Signal File Coordination

Plans coordinate automatically using signal files so you can launch all 3 sessions at once:

| Signal File | Written By | Read By |
|-------------|-----------|---------|
| `.plan_a_done` | Plan A Agent 6 (after commit) | Plan B-2 (waits before starting) |
| `.plan_b1_done` | Plan B-1 (after Agent 4 passes) | Plan B-2 (waits before starting) |

**How it works:**
1. Launch all 3 Claude Code sessions simultaneously
2. Plan A and Plan B-1 start working immediately (no file overlap)
3. Plan B-2 polls every 30s for both `.plan_a_done` AND `.plan_b1_done`
4. Once both signals exist, Plan B-2 starts its agents automatically
5. Plan B-2 Agent 4 cleans up both signal files after commit

---

## How to Run (Single Launch)

Open **3 Claude Code terminals** and paste one prompt into each — all at the same time:

**Terminal 1 — Plan A:**
```
You are executing Plan A — Backend + Settings Infrastructure.
Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Branch: demo-pipeline-wiring
Read the full plan at: docs/Plans/PLAN_A_BACKEND_SETTINGS_INFRASTRUCTURE.md
Execute ALL 6 agents in order. Agent 6 writes .plan_a_done signal after commit.
```

**Terminal 2 — Plan B-1:**
```
You are executing Plan B-1 — UI/UX Polish (Parallel).
Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Branch: demo-pipeline-wiring
Read the full plan at: docs/Plans/PLAN_B1_UI_POLISH_PARALLEL.md
Execute ALL 4 agents in order. Write .plan_b1_done signal after all agents pass.
```

**Terminal 3 — Plan B-2:**
```
You are executing Plan B-2 — Export, Documentation, Full QA & Commit.
Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Branch: demo-pipeline-wiring
Read the full plan at: docs/Plans/PLAN_B2_EXPORT_QA_COMMIT.md
FIRST: Run the "Wait for Signal Files" section — poll until both .plan_a_done and .plan_b1_done exist.
THEN: Execute ALL 4 agents in order. Agent 4 cleans up signal files after commit.
```

All 3 sessions run autonomously. Plan B-2 waits automatically. No manual intervention needed.

---

## Plan A — Backend + Settings Infrastructure

**File:** [`docs/Plans/PLAN_A_BACKEND_SETTINGS_INFRASTRUCTURE.md`](PLAN_A_BACKEND_SETTINGS_INFRASTRUCTURE.md)
**Runs:** First (parallel with Plan B-1)

| Agent | Name | Scope |
|-------|------|-------|
| 1 | SMTP + Shifts Backend | Backend config modules + 5 API routes + wire SMTP |
| 2 | User Role Guards + Endpoints | `require_role` decorator + 3 new user endpoints + lock down existing |
| 3 | Email + Shifts Settings Pages | Frontend settings pages + tab registration + shifts in ReportViewer |
| 4 | User Management Settings Page | Frontend user management + Login cleanup + retire `/user` route |
| 5 | QA & Integration Testing | Full Plan A validation — backend APIs + frontend + dark/light mode |
| 6 | Commit & Push | **GATED** — only after Agent 5 QA passes 100% |

---

## Plan B-1 — UI/UX Polish (Parallel with Plan A)

**File:** [`docs/Plans/PLAN_B1_UI_POLISH_PARALLEL.md`](PLAN_B1_UI_POLISH_PARALLEL.md)
**Runs:** First (parallel with Plan A) — zero file overlap with Plan A

| Agent | Name | Scope |
|-------|------|-------|
| 1 | Typography + Light Mode Color Fix | Inter + JetBrains Mono fonts, fix warm gray :root hues |
| 2 | ColumnEditor Dark Mode + MUI Tooltips | CSS variable fix + tooltip migration on all toolbars |
| 3 | Live Data Refresh Indicator | Reusable pulsing dot component + Preview integration |
| 4 | Silo Widget SVG Upgrade | 3D cylindrical vessel with metallic gradient, wave, glow |

**No QA or Commit agent** — Plan B-2 handles comprehensive QA and commit for all plans.

---

## Plan B-2 — Export, Documentation, Full QA & Commit

**File:** [`docs/Plans/PLAN_B2_EXPORT_QA_COMMIT.md`](PLAN_B2_EXPORT_QA_COMMIT.md)
**Runs:** After BOTH Plan A and Plan B-1 complete

| Agent | Name | Scope |
|-------|------|-------|
| 1 | Export PDF / PNG | jspdf install + export utility + dropdown in Preview + ReportViewer |
| 2 | Documentation Update | LOCAL_DEV_SETUP.md with all Plan A + Plan B-1 + Plan B-2 changes |
| 3 | Full QA & Debug Pipeline | Full Plan A + Plan B-1 + Plan B-2 validation — every page, every mode |
| 4 | Commit & Push | **GATED** — only after Agent 3 QA passes 100% |

---

## Original Agent Mapping

| Original Agent | New Location |
|---------------|-------------|
| Agent 1 (SMTP + Shifts Backend) | Plan A → Agent 1 |
| Agent 2 (User Role Guards) | Plan A → Agent 2 |
| Agent 3 (Email + Shifts UI) | Plan A → Agent 3 |
| Agent 4 (User Management UI) | Plan A → Agent 4 |
| Agent 5 (Typography + Color) | Plan B-1 → Agent 1 |
| Agent 6 (ColumnEditor + Tooltips) | Plan B-1 → Agent 2 |
| Agent 7 (LiveDataIndicator) | Plan B-1 → Agent 3 |
| Agent 8 (Silo Widget SVG) | Plan B-1 → Agent 4 |
| Agent 9 (Export PDF/PNG) | Plan B-2 → Agent 1 |
| Agent 10 (Documentation) | Plan B-2 → Agent 2 |
| Agent 11 (Full QA) | Plan B-2 → Agent 3 |
| _(new)_ Plan A QA agent | Plan A → Agent 5 |
| _(new)_ Plan A Commit | Plan A → Agent 6 |
| _(new)_ Final Commit | Plan B-2 → Agent 4 |

---

## Key Improvements

1. **3-document split** — Plan A and Plan B-1 run in parallel on separate Claude Code sessions
2. **Zero file overlap verified** — File Overlap Safety table in Plan B-1 confirms no conflicts
3. **Dedicated QA agents** — Plan A has Agent 5, Plan B-2 has Agent 3 (tests ALL plans)
4. **Gated commit/push** — Plan A commits after Plan A QA; Plan B-2 commits everything after full QA
5. **Security fixes** — `@login_required` on all settings routes, `@require_role` on user mutation routes
6. **Merge-conflict handling** — explicit failure rows for files modified by multiple agents
7. **Concrete Silo SVG** — full JSX skeleton instead of prose description
8. **Stale line numbers fixed** — text search patterns replace fragile line references
9. **Signal file coordination** — `.plan_a_done` and `.plan_b1_done` let Plan B-2 auto-start when both plans finish
10. **Single launch** — all 3 sessions start at once, no manual waiting or coordination needed
11. **~35 min faster** — parallel execution saves ~35 min vs sequential Plan A → Plan B
