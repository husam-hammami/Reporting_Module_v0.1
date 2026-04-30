# Page Spec — Hercules AI / ROI Genius surface (`/hercules-ai`)

> Overrides `MASTER.md`. Reads only the deltas listed below; everything else inherits from Master.

**Plan reference:** `docs/plans/AI Features/06_Boardroom_Mode_Redesign_Plan_30_04.md`
(superseded `05_ROI_Genius_Layer_Plan_30_04.md` §14.4 page composition)
**Frontend route:** `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`
**Status:** spec — implementation gated on owner sign-off (Plan 6 §15)

---

## Page composition — Boardroom Mode

Single sticky boardroom card on top, four-chip segmented control beneath, one stage panel below that. **Total page on a 1080p display: 1.0–1.2 viewports — never two.**

```
┌─────────────────────────────────────────────────────────────────────┐
│   [coin]  PLANT VERDICT · Wed 30 Apr · 14:08    [trust 87/100]      │
│                                                                     │
│           92/100  ·  Running within targets                         │
│           1,564 OMR today  →  ~3,100 by close                       │
│           21.4 kWh/ton  ·  2,929 t produced  ·  4 of 5 lines on     │
│                                                                     │
│   ─────────────────────────────────────────                         │
│   ▸ 2 things worth your attention                                   │
│   ▸ 7 machines watched                                              │
│   ▸ Hercules learning · 28 days left                                │  (calibrating only)
└─────────────────────────────────────────────────────────────────────┘    240–320px

[ Attention (2) ] [ Machines (7) ] [ Time ] [ Audit ]                      56px

┌─ chosen stage ─────────────────────────────────────────────────────┐
│                                                                    │
│  Default: Attention — Top-3 Levers + Watch                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Density caps (PR-gated)

- Boardroom Card height: `max-height: 320px` (CSS-enforced).
- Hero number: exactly one. Always a real number. **Never** the word "Calibrating", "Loading", or "Standing by" in the hero slot.
- Inline KPI atoms in line 3: max 4, separated by middle dots.
- Sub-list bullets: max 3.
- Calibrating sub-line: at most 1 of the 3 bullets.
- Bottom segmented control: always visible at default height on 1080p.
- Stage panel: max 1 chart at a time; sparklines (≤32px) don't count.
- One Three.js moment on the entire page: the coin in the boardroom card top-left.

---

## Boardroom Card — component override

### Container

```css
.hai-boardroom {
  background:
    linear-gradient(135deg, rgba(202,138,4,0.04), rgba(202,138,4,0.01)),
    var(--hai-glass-1);
  border: 1px solid var(--hai-glass-border);
  border-radius: 24px;
  padding: var(--hai-space-6) var(--hai-space-8);
  box-shadow:
    var(--hai-shadow-deep),
    inset 0 1px 0 var(--hai-trust-glow);
  backdrop-filter: blur(18px) saturate(160%);
  position: sticky;
  top: var(--hai-space-md);
  z-index: 30;
  min-height: 240px;
  max-height: 320px;
  display: grid;
  grid-template-columns: 80px 1fr auto;
  grid-template-rows: auto 1fr auto;
  gap: var(--hai-space-2) var(--hai-space-5);
}
```

### Hero block (middle row, three lines)

| Line | Font | Size | Weight | Colour | Notes |
|---|---|---|---|---|---|
| Line 1 (hero) — primary number | Inter Tight | `clamp(56px,6vw,80px)` | 300 | Gold for OMR figures only; white for Plant Score / non-money | `tabular-nums`, `letter-spacing: -0.02em` |
| Line 1 — verdict text | Inter Tight | 36px | 400 | `--hai-text-secondary` | preceded by 10px status dot |
| Line 2 — money | Inter Tight | 22px | 400 | `--hai-money` (gold) | `→` arrow only when ghost projection present |
| Line 2 — ghost projection | Inter Tight | 22px | 400 | `--hai-money` opacity 0.55 | crossfade in 800 ms when forecast confidence ≥ 60% |
| Line 3 — inline KPIs | Inter Tight | 14px | 500 | `--hai-text-secondary` | atoms separated by middle dots; drop atoms gracefully on narrow screens |

### Status dot (Line 1)

10×10 dot, leading the verdict text:
- `--hai-status-ok-600` — `level === 'ok'`
- `--hai-status-warn-600` — `'warn'`
- `--hai-status-crit-600` — `'crit'`

### Sub-list (bottom row)

Up to 3 bullets, 13px, plain text with leading `▸` glyph (CSS `::before`). Each bullet is a plain `<button>` styled as text — clicking selects the corresponding stage chip.

### Top strip (top row)

| Slot | Content | Notes |
|---|---|---|
| Left (80px square) | Three.js gilding coin (lazy) | Static SVG fallback; matte-grey when calibrating, gold + spinning when savings > 0; first-savings gilding fires once and is permanent |
| Centre | "PLANT VERDICT · Wed 30 Apr · 14:08" | 11px, `letter-spacing: 0.08em`, `text-transform: uppercase`, `--hai-text-secondary` |
| Right | "Trust 87/100" pill | Hidden when calibrating; admin-only red badge appears when score < 70 |

### Trust glow (the "card breathes" moment)

The 1px gold inset highlight `inset 0 1px 0 var(--hai-trust-glow)` is bound to Trust Score:

| Score | `--hai-trust-glow` |
|---|---|
| ≥ 95 | `rgba(240, 181, 79, 0.30)` |
| 80–94 | `rgba(240, 181, 79, 0.18)` (default) |
| 70–79 | `rgba(240, 181, 79, 0.10)` (muted) |
| < 70 | `rgba(180, 180, 180, 0.10)` (silver — admin sees badge) |
| null (calibrating) | default `rgba(255, 255, 255, 0.18)` |

Same component, no extra UI. The card itself shows you how much to believe it.

---

## Hero number selection — the rule

**The hero number is always a real number, contextually chosen.** Plain English never sits in the hero slot.

Priority order (first match wins):
1. Today's OMR with confident forecast → `<so_far_omr>` + ghost `<projected_omr>`
2. Today's OMR alone → `<so_far_omr>`
3. Plant Score (Phase 1 fallback) → `92/100`
4. Confirmed savings (cold start with no Phase 1) → `<total_omr>`
5. Final fallback → "Standing by" + day name

See Plan 6 §3 for the algorithm and §10 for acceptance scenarios.

---

## Segmented stage — chips + panel

```
[ Attention (2) ] [ Machines (7) ] [ Time ] [ Audit ]
```

- Pills with optional count badges.
- Active chip: glass background + 3px gold underline (`--hai-money`).
- Inactive: ghost border, `--hai-text-secondary` text.
- Keyboard nav: ←/→, Tab focuses, Enter activates.

### Default chip selection

```
if anomalies.length > 0:        Attention
elif top3 levers exist:         Attention
elif savings.calibrating:       Time   (Phase 1 has working data)
else:                           Attention
```

The page never lands on an empty stage.

### Stage 1 — Attention (default)

- **Top-3 ROI Levers** (Phase C): cards from Plan 5 §14.5; pulse on rank-1 only; no parallax tilt; max 3 cards always.
- **Watch list** (Phase B): existing `WatchBand` component.

Empty state: "Nothing demanding your attention right now. Hercules is watching {N} machines and will surface anything unusual."

### Stage 2 — Machines (replaces tall asset bento)

Compact one-row-per-asset table (~56px per row). Columns: Asset · Status · Energy use · Electrical efficiency · Shift pace · Setup status.

Click row → `AssetDrillDrawer` (right-side, 480px) with the full-fat `SecCard` + `PfPenaltyCard` + `PacingRing` + recent history chart. (The full cards earn their keep in the drawer, not on the main page.)

Top of stage: "Setup status: {linked} of {total} machines linked — finish setup →" deep-linking the AI Setup wizard.

### Stage 3 — Time (Phase 1 untouched)

Existing Phase 1 surface lifted into a stage component:
- "Analyze Reports" button + filter chip
- Plant Score 92/100 breakdown
- Efficiency / Production / Energy / Energy Cost cards
- Time period tabs (Today / Yesterday / This Week / etc.)
- AI insights narrative card
- MIL-B / Energy Report / Pasta / WPK1 drill cards

**No code change to Phase 1 components.** This is the CLAUDE.md Rule #2 protection — Phase 1 keeps every working code path it has.

### Stage 4 — Audit

- Savings ledger entries: per-row asset · OMR · confidence · evidence · "Mark actioned" / "Dispute" buttons.
- Footer: small "Hercules accuracy" link → `/hercules-ai/model-health` (admin only).

Empty state: "Hercules is calibrating. Confirmed savings will appear here once Hercules has 30 days of data."

---

## Components — what stays, transforms, deletes

| Component | Status | Reason |
|---|---|---|
| `BoardroomCard.tsx` | NEW | The hero card |
| `SegmentedStage.tsx` | NEW | Chips + stage panel |
| `stages/AttentionStage.tsx` | NEW | Levers + Watch |
| `stages/MachinesStage.tsx` | NEW | Compact asset table |
| `stages/TimeStage.tsx` | NEW (extracts existing Phase 1 surface) | Phase 1 untouched |
| `stages/AuditStage.tsx` | NEW | Ledger entries |
| `components/HeroVerdict.tsx` | NEW | Picks hero number contextually |
| `components/GoldCoin3D.tsx` | NEW | Three.js coin (lazy) |
| `components/AssetDrillDrawer.tsx` | NEW | Hosts full-fat cards on row click |
| `RoiSurface.tsx` | DELETE | Replaced by Boardroom + SegmentedStage |
| `SavingsRibbon.tsx` | KEEP, unmount on this page | Reusable in digest emails / drilldowns |
| `BillProjectionCard.tsx` | KEEP, not on this page | Logic feeds HeroVerdict; component reused in admin Model Health |
| `WatchBand.tsx` | KEEP, used inside AttentionStage | |
| `SecCard.tsx`, `PfPenaltyCard.tsx`, `PacingRing.tsx` | KEEP, used inside AssetDrillDrawer | Earn their weight in the drawer |
| `BriefingView.tsx` (Phase 1) | KEEP, used inside TimeStage | Untouched |

---

## Anti-PhD enforceable rules — codified for this page

In addition to MASTER.md §9 rules 1–10:

11. **Hero is a number, never a word.** Lint rule on `<HeroVerdict>` props.
12. **Card max-height: 320px** — CSS-enforced.
13. **One chart per stage at a time.** No two charts visible simultaneously on the page (sparklines don't count).
14. **Default chip is never empty.** Algorithm in §"Segmented stage" mandatory.
15. **Coin only animates when there's something to celebrate.** Calibrating coin is static; rotation = saving > 0.
16. **Verdict text on Line 1 max 8 words.** Locked per Plan 6 §9.
17. **Phase 1 content lives only inside Time stage.** No duplication on the main surface.

---

## Acceptance scenarios (the test matrix)

See Plan 6 §10 for the 18-scenario matrix the page must pass before merge.

Headline scenarios:
- Cold install / no production today → Hero is Plant Score, not "Calibrating".
- Production day at 14:30 with confident forecast → Money line shows ghost projection with gold arrow.
- First savings ledger entry → Coin gilds once, then permanent slow rotation.
- Trust < 70 + non-admin → Card stays gold (no anxiety injection).
- Phase B endpoint errors → Boardroom card still renders via Plant Score fallback.
- 1080p display → Total page ≤ 1.2 viewports without scroll.
- RTL Arabic + mobile 375px → Both must pass; coin anchors to visual leading edge.

---

## Per-page anti-patterns (extra strict here)

- ❌ Multiple cards of equal weight on the main surface.
- ❌ Tall (>200 px) asset cards on the main surface.
- ❌ More than one chart visible simultaneously (sparklines exempt).
- ❌ Word "Calibrating" / "Loading" / "Standing by" as hero number.
- ❌ Two competing verdicts (the original Phase A+B failure mode).
- ❌ Gold colour on anything other than OMR figures.
- ❌ Animation on idle elements (coin spinning while calibrating, etc.).
- ❌ Hero card growing past 320px.
- ❌ Phase 1 components mounted outside Time stage.
- ❌ Three.js used anywhere except the boardroom coin.
