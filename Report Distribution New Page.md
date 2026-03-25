# Report Distribution — Standalone Page Redesign

## Context

The current Distribution implementation is buried inside Engineering > Distribution tab with a cramped modal form for adding rules. The user wants a **standalone top-level page** with clear, spacious UX — not a settings sub-tab. SMTP config stays in Engineering/Settings.

---

## Architecture

**New sidebar item** "Distribution" between Table Reports and Engineering at `/distribution`.
**Two views** within the page: **rules list** (default) and **inline editor** (replaces modal).
**No backend changes** — the existing API is fine.

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `Frontend/src/Pages/Distribution/DistributionPage.jsx` | Main page: header, stats, search/filter, card list, empty state |
| `Frontend/src/Pages/Distribution/DistributionRuleCard.jsx` | Single rule card (list row + grid card modes) |
| `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` | Full-width inline form (replaces RuleForm modal) |

### Modified Files

| File | Change |
|------|--------|
| `Frontend/src/Data/Navbar.js` | Add `{ name: 'Distribution', icon: Send, link: '/distribution', roles: [Admin, Manager] }` at index 3 |
| `Frontend/src/Routes/AppRoutes.jsx` | Add `<Route path="distribution">` as top-level route, import `DistributionPage` |
| `Frontend/src/Pages/Settings/SettingsHome.jsx` | Rename "Distribution" tab back to "Email / SMTP", keep link at `/settings/distribution` |
| `Frontend/src/Pages/Settings/ReportDistribution/ReportDistribution.jsx` | Remove `<DistributionRules />`, keep only `<SmtpSection />` |

### Delete (orphaned after redesign)

| File | Reason |
|------|--------|
| `Frontend/src/Pages/Settings/ReportDistribution/DistributionRules.jsx` | Replaced by DistributionPage |
| `Frontend/src/Pages/Settings/ReportDistribution/RuleForm.jsx` | Replaced by DistributionRuleEditor |

### Keep As-Is

- `Frontend/src/API/distributionApi.js` — API wrapper, no changes
- `Frontend/src/Pages/Settings/ReportDistribution/RecipientInput.jsx` — reused in new editor
- `Frontend/src/Pages/Settings/ReportDistribution/SmtpSection.jsx` — stays in Settings
- All backend files — no changes

---

## Page Design: DistributionPage.jsx

Follow `ReportBuilderManager.jsx` patterns: `useTheme()` hook, Framer Motion, Lucide icons.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  ← Distribution          [ + New Rule ]              │  Header
├──────────────────────────────────────────────────────┤
│  ● Total 5  ● Active 3  ● Paused 2                  │  Stats bar
├──────────────────────────────────────────────────────┤
│  🔍 Search...        [All] [Active] [Paused]         │  Filter bar
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Rule Card ─────────────────────────────────────┐ │
│  │ [toggle] Daily Silo Report                      │ │
│  │          Grain Silos Dashboard                   │ │
│  │          Daily at 08:00 · Email · PDF   [OK]    │ │
│  │          3 recipients         [▶] [✎] [🗑]     │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─ Rule Card ─────────────────────────────────────┐ │
│  │ ...                                             │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Empty State (no rules)

Centered in content: `Send` icon, "No distribution rules yet", subtitle, accent "Create First Rule" button.

### State

- `view`: `'list'` | `'editor'` — toggles between list and inline editor
- `editingRule`: `null` (new) or rule object (editing)
- `search`, `statusFilter` — filtering

When `view === 'editor'`, the entire content area becomes `<DistributionRuleEditor>` with a back arrow to return to list.

---

## Card Design: DistributionRuleCard.jsx

Horizontal row card per rule:

| Toggle | Name + Report | Schedule | Delivery | Format | Status | Actions |
|--------|---------------|----------|----------|--------|--------|---------|

- **Toggle**: enabled/disabled switch (left)
- **Name**: rule name (semibold), report name below (muted). Left accent bar (green=active, gray=paused)
- **Schedule**: "Daily at 08:00" / "Mondays at 10:00" / "1st of month at 08:00" with Clock icon
- **Delivery**: Email / Disk / Both badge with Mail/HardDrive icon
- **Format**: PDF/HTML badge
- **Status**: Last run OK/Failed badge, "Report deleted" warning if report_missing
- **Actions** (hover-reveal): Run Now (Play), Edit (Pencil), Delete (Trash2)
- Clicking the card opens the editor for that rule

---

## Inline Editor: DistributionRuleEditor.jsx

Full-width form (max-w-3xl centered), replaces modal. Two columns on desktop, one on mobile.

### Sections

**1. Basic Info**
- Rule Name (text input)
- Report picker (select dropdown from reportBuilderApi.list())

**2. Delivery** (visual card selector — 3 clickable cards)
- "Email" (Mail icon) / "Save to Disk" (HardDrive icon) / "Both"
- Selected card gets accent border + tint
- Conditionally shows: RecipientInput for email, path input for disk

**3. Format**
- PDF / HTML toggle buttons

**4. Schedule** (bordered card section)
- Daily / Weekly / Monthly toggle buttons
- Time picker (always shown)
- Day of Week: 7 clickable day pills (Mon–Sun) for Weekly
- Day of Month: number selector (1–28) for Monthly
- **Preview line**: "Runs every Monday at 08:00" in muted text

**5. Enable/Disable toggle**

**Footer**: Cancel (ghost) + Save Rule (accent). If editing: Run Now button.

---

## Navbar.js Change

```js
import { LayoutGrid, BarChart2, Settings, Table2, Send } from 'lucide-react';

// Add at index 3 (between Table Reports and Engineering):
{
  name: 'Distribution',
  icon: Send,
  tooltip: 'Scheduled report delivery',
  link: '/distribution',
  roles: [Roles.Admin, Roles.Manager],
},
```

---

## AppRoutes.jsx Change

Add as sibling of `dashboards`, `reports`, etc.:

```jsx
import DistributionPage from '../Pages/Distribution/DistributionPage';

<Route path="distribution" element={
  <ProtectedRoute roles={[Roles.Admin, Roles.Manager]}>
    <DistributionPage />
  </ProtectedRoute>
} />
```

---

## Settings Changes

**SettingsHome.jsx**: Rename "Distribution" → "Email / SMTP", description → "SMTP server configuration"

**ReportDistribution.jsx**: Remove DistributionRules import, render only SmtpSection.

---

## Implementation Order

1. Create `DistributionRuleCard.jsx`
2. Create `DistributionRuleEditor.jsx` (imports RecipientInput)
3. Create `DistributionPage.jsx` (composes card + editor + empty state)
4. Modify `Navbar.js` — add sidebar entry
5. Modify `AppRoutes.jsx` — add /distribution route
6. Modify `SettingsHome.jsx` — rename tab to "Email / SMTP"
7. Modify `ReportDistribution.jsx` — remove DistributionRules, keep SmtpSection only
8. Delete orphaned files (DistributionRules.jsx, RuleForm.jsx)
9. Build + verify + push

---

## Verification

1. `npm run build` — frontend builds without errors
2. Sidebar shows "Distribution" between Table Reports and Engineering
3. `/distribution` renders the page with empty state (no rules yet)
4. Create a rule via the inline editor — verify it appears as a card
5. Toggle, edit, delete, run-now all work from the card actions
6. Engineering > "Email / SMTP" tab shows only SMTP config
7. Dark mode works correctly on all new components
8. Mobile responsive — single column layout on small screens

---

## Key Reference Files

- `Frontend/src/Pages/ReportBuilder/ReportBuilderManager.jsx` — page layout, useTheme, stats bar, search, cards, empty state
- `Frontend/src/Pages/Settings/ReportDistribution/RecipientInput.jsx` — reuse in editor
- `Frontend/src/API/distributionApi.js` — API wrapper (listRules, createRule, updateRule, deleteRule, runRule)
- `Frontend/src/Data/Navbar.js` — sidebar nav items
- `Frontend/src/Routes/AppRoutes.jsx` — route definitions
