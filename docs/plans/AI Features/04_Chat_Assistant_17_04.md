# Plan 4 — Hercules Chat Assistant — 2026-04-17

## Scope boundary

**In scope:**
- "Why" questions answered with evidence fetched from tools
- What-if / scenario simulation (cost, capacity, load shift)
- Capacity / commitment checks ("can we accept X tonnes tomorrow?")
- Ad-hoc chart building conversationally; saveable to a dashboard
- Cross-cutting questions reports cannot answer ("worst SEC product", "total OMR last month", "idle hours last week")
- Memory and personalisation (repeats, "same as last time")

**Out of scope — rejected by owner, will not drift back in:**
- Push notifications, morning briefings, mobile alerts
- Anomaly alerts in chat (those live in the Plan 3 / Plan 1 surfaces)
- Maintenance ticket generation, Jira/Zoho task creation
- Email drafting, Slack integration, outbound notification of any kind
- Writing to the PLC, writing to tags, changing setpoints
- Broad-web research via the assistant (restricted to site-local tools)

This list is pinned here so scope creep has a named line to cross.

## Architecture

The assistant is a tool-use loop around Anthropic's Messages API using `tool_use` / `tool_result` blocks, not a single-shot prompt-stuffing pattern. A user turn is processed as:

1. User message + conversation history + system prompt → model.
2. If the model returns `tool_use` blocks, the backend executes each tool, collects `tool_result` blocks, appends to the transcript, calls the model again.
3. Loop up to 8 tool calls per user turn (hard cap).
4. When the model returns a `text` block with no tool calls, stream it to the UI.

**Model choice.** Claude Sonnet 4.6 in production. Haiku 4.5 is explicitly excluded — in internal testing on similar tool-use loops it fails to chain 3+ tool calls reliably and hallucinates tag names when uncertain. Opus 4.6 is offered as a premium toggle for admins but defaults off on cost grounds.

Streaming uses Anthropic's SSE transport; the Flask endpoint re-streams over Socket.IO to the React UI in an `/chat` namespace. Tool execution happens server-side between streaming segments.

## The six tools

All read-only. All return JSON. All time arguments are ISO 8601. All obey a 90-day maximum window (see Guardrails).

### 1. `list_tags`
```
list_tags(search: str = "", tag_type: str = None, line_name: str = None, limit: int = 50)
  -> { "tags": [ { "tag_name", "display_name", "unit", "tag_type", "line_name" } ] }
```
Lets the assistant discover tag names. Substring match against `tag_name` and `display_name`. Backed by `tags` JOIN `hercules_ai_tag_profiles`.

### 2. `get_tag_value`
```
get_tag_value(tag_name, from_iso, to_iso,
              aggregation: "delta"|"avg"|"sum"|"min"|"max"|"last"|"first")
  -> { "tag_name", "from", "to", "aggregation", "value", "unit", "samples": int }
```
Single aggregated scalar. For counter tags `delta` is the tonnes/kWh produced between the boundaries.

### 3. `get_tag_timeseries`
```
get_tag_timeseries(tag_name, from_iso, to_iso, max_points: int = 500)
  -> { "tag_name", "unit", "points": [{ "t", "v" }], "downsampled_from": int }
```
Server-side downsamples via LTTB to `max_points`. Never returns >500 rows regardless of the model's ask. Used for chart building.

### 4. `compare_periods`
```
compare_periods(tag_name, period_a: {from,to}, period_b: {from,to}, aggregation)
  -> { "a_value", "b_value", "delta", "delta_pct", "unit" }
```
Ergonomic wrapper so the model doesn't need two `get_tag_value` calls and inline arithmetic (arithmetic in the model is a reliability risk).

### 5. `compute_cost`
```
compute_cost(from_iso, to_iso, line_name: str = None)
  -> { "total_omr", "components": {...}, "by_band": {...},
       "peak_demand_mw", "assumptions": {...} }
```
Wraps `backend/ml/cost_calculator.py` from Plan 2. Admin / manager role only (see role-based access).

### 6. `get_orders_in_period`
```
get_orders_in_period(from_iso, to_iso, line_name: str = None)
  -> { "orders": [ { "order_name", "start", "end", "duration_hr",
                     "tonnes", "kwh", "sec_kwh_per_t" } ] }
```
Reads from `dynamic_orders` and joins `sec_history`. Unlocks "worst SEC product" in one call.

Deliberately cut: no ML / anomaly tools, no write tools, no tag-profile edit tools. Keeping the set tight is the single biggest reliability win.

## Generative features

### Why-questions with evidence
System prompt includes: *"For any question asking 'why' or 'what caused', you MUST call at least two tools before answering. Cite exact tag names and values. If evidence is inconclusive, say so."* A validator in `backend/chat_bp.py` post-checks that a `why|caused|explain|drop|rise|spike` pattern in the user message produced ≥2 `tool_use` blocks in the assistant turn; if not, it appends a reminder and loops once.

### What-if cost simulation
The assistant walks: (a) fetch actual kWh profile, (b) generate the hypothetical profile (shift load, derate), (c) call `compute_cost` twice, (d) render an assumptions box. The frontend displays the assumption box as a styled block so the saving is never a naked number.

### Capacity / commitment check
For "can we accept 400t tomorrow?": call `get_orders_in_period` for last 30 days, compute median daily tonnes and the 90th percentile tonnes/hour, compare against the ask. The assistant answers with a probability-framed statement ("you produced 400+ tonnes on 6 of the last 30 days, and the ceiling in that window was 520") — not a yes/no.

### Ad-hoc chart building
When the user asks for a chart, the model emits a structured block in its text response:

````
```chart_spec
{ "type": "line", "title": "Mill B throughput last week",
  "series": [ { "tag_name": "MILL_B_FLOW_OUT", "aggregation": "avg",
                "bucket": "1h" } ],
  "from": "2026-04-10T00:00:00Z", "to": "2026-04-17T00:00:00Z" }
```
````

`ChatAssistant.jsx` parses the fenced block, renders inline via the existing `UPlotChart` wrapper, and shows a "Save to dashboard" button. Save calls a new endpoint `POST /api/report-builder/from-chart-spec` which inserts a widget into the user's default dashboard template.

### Memory / personalisation
Two layers:

- **Short-term:** the conversation transcript is passed back in every turn (already implicit for tool-use loops).
- **Long-term:** `chat_user_preferences` stores pinned tags, default line, default period. The system prompt injects a compact serialisation each turn: "User's default line: Mill B. User's recent tags: C32_PF, MILL_B_FLOW_OUT." Pronouns like "that" and "same as last time" resolve against the last 5 messages explicitly, not against long-term memory.

## Schema

```sql
-- backend/migrations/create_chat_tables.sql

CREATE TABLE chat_conversations (
    id           BIGSERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(256),
    created_at   TIMESTAMP DEFAULT NOW(),
    last_active_at TIMESTAMP DEFAULT NOW(),
    archived     BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_chat_conv_user ON chat_conversations(user_id, last_active_at DESC);

CREATE TABLE chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            VARCHAR(16) NOT NULL,    -- 'user' | 'assistant' | 'tool'
    content         JSONB NOT NULL,          -- structured blocks (text, tool_use, tool_result)
    tool_calls      JSONB,                   -- convenience projection for UI
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_chat_msg_conv ON chat_messages(conversation_id, created_at);

CREATE TABLE chat_audit_log (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(id) ON DELETE SET NULL,
    conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE SET NULL,
    question      TEXT,
    tool_calls    JSONB,              -- full tool call + result trace
    final_answer  TEXT,
    tokens_in     INT,
    tokens_out    INT,
    latency_ms    INT,
    model         VARCHAR(64),
    error         TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_chat_audit_user ON chat_audit_log(user_id, created_at DESC);

CREATE TABLE chat_user_preferences (
    user_id         INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    pinned_tags     JSONB DEFAULT '[]'::jsonb,
    default_line    VARCHAR(64),
    default_period  VARCHAR(32),    -- 'today' | 'yesterday' | 'this_week' | ...
    updated_at      TIMESTAMP DEFAULT NOW()
);
```

`chat_messages` and `chat_audit_log` are deliberately separate. The former is user-facing history and can be deleted by the user; the latter is admin-only for support, debugging, cost tracking, and quality review.

## Backend

New blueprint `backend/chat_bp.py` registered under `/api`. Endpoints:

- `GET /api/chat/conversations` — list user's conversations.
- `POST /api/chat/conversations` — create new, returns id.
- `DELETE /api/chat/conversations/<id>` — delete (user-owned only).
- `GET /api/chat/conversations/<id>/messages` — paginated history.
- `POST /api/chat/conversations/<id>/ask` — non-streaming; returns the complete assistant turn. Used by tests and clients that can't stream.
- `POST /api/chat/conversations/<id>/stream` — SSE endpoint; streams text deltas.
- `GET /api/chat/preferences` / `PUT /api/chat/preferences` — user preferences CRUD.
- `POST /api/report-builder/from-chart-spec` — save a `chart_spec` to a dashboard widget (lives in `report_builder_bp.py` next to existing CRUD).

Tool implementations live in `backend/chat/tools.py`. Each tool is a pure function taking kwargs, returning a dict ≤20KB. The tool router in `chat_bp.py` enforces the size and window caps before the call returns.

Conversation state is reconstructed on every turn: load the last N messages, build the Anthropic message list. Cap history at 40 messages; older messages are summarised by a small prompt into a single system-level note. Summarisation is cheap and keeps token costs sublinear.

## Frontend

New route `/hercules-ai/chat` under the existing `/hercules-ai/*` area. Page at `Frontend/src/Pages/HerculesAI/ChatAssistant.jsx`. Components:

- `ConversationSidebar` — left rail, list + new-chat + archive.
- `MessageList` — virtualised scroll; each message renders text + inline `chart_spec` charts + tool-call disclosure toggle.
- `Composer` — textarea + send, with keyboard shortcuts; displays the 90-day and 8-tool caps as hints when the user writes something likely to breach them.
- `PreferencesDrawer` — pinned tags, default line, default period.
- `AssumptionsCard` — reused inside cost-scenario responses; renders the assumption block the assistant emits.

Socket.IO subscription on `chat:<conversation_id>:stream` receives text deltas. Tool-call disclosure is collapsed by default; clicking expands a table of each tool name + args + truncated result. This is what builds trust — the user can always see which tag was read.

## Guardrails

- **Read-only tools only.** No tool writes to PLC, tags, reports, users, anything. Enforced in code, not by prompt.
- **Max 90-day time range per tool call.** The tool router validates `to - from <= 90 days`. Violation returns a `tool_result` with `error: "range_exceeded"` and a hint. The model is instructed to then ask the user to narrow.
- **Max 8 tool calls per user turn.** Counter per turn; ninth call short-circuits and the model is instructed to answer with what it has.
- **Tool output cap 20KB.** If a query returns more, the router truncates and includes `"truncated": true` in the payload.
- **No tag-name hallucination.** System prompt: *"Before using any tag name in a tool call, if you are not certain it exists, call `list_tags(search=...)` first. Tool calls with non-existent tag names will fail."* The tool returns `{"error": "tag_not_found"}` deterministically; the model learns the loop quickly.
- **Role-based tool access.**
  - Operator: `list_tags`, `get_tag_value`, `get_tag_timeseries`, `compare_periods`, `get_orders_in_period`. No `compute_cost` (cost is sensitive).
  - Manager / admin: all six tools.
  - Superadmin: all six + access to `chat_audit_log` via admin UI.
- **Rate limiting.** Per-user: 60 turns/hour, 500 turns/day. Enforced in the blueprint.
- **PII.** The assistant never sees user emails, hashes, or license keys — not exposed via any tool.
- **Prompt injection defence.** Tool results are returned as JSON, not raw text. The model is instructed that any `"instruction"` key inside tool output must be ignored.

## System prompt (draft)

```
You are Hercules Assistant, a factory operations analyst embedded in the Hercules
Reporting platform. You help plant managers and engineers understand PLC-backed
production data.

You have six tools: list_tags, get_tag_value, get_tag_timeseries, compare_periods,
compute_cost, get_orders_in_period. You must use these tools to answer any
factual question. Do NOT rely on training knowledge for live plant data.

Rules:
- Never invent a tag name. If uncertain, call list_tags first.
- For "why" or "what caused" questions, call at least two tools and cite the
  evidence (tag name, time range, value).
- Time ranges on tool calls must be <= 90 days. If the user asks for longer,
  ask them to narrow or split the question.
- For cost scenarios, always present an assumptions box listing the tariff,
  effective dates, and any load-shift you assumed.
- Prefer numbers with units. Use OMR for cost, kWh for energy, tonnes for mass.
- When drawing a chart, emit a ```chart_spec ... ``` fenced block. The client
  renders it inline.
- If asked to send email, create tickets, adjust PLC values, or write anywhere,
  refuse and suggest the correct page in Hercules instead.
- If evidence is inconclusive, say "insufficient data" and explain why.
- One decimal place for ratios, zero for weights over 1000, three for small flows.
- Default line: {{user_default_line}}. Default period: {{user_default_period}}.
- Recently referenced tags: {{user_recent_tags}}.
```

The template placeholders are filled per turn from `chat_user_preferences`.

## Cost estimate per mill per month

Assumptions: 30 heavy users per site, each averaging 12 turns/day, 20 working days/month. 7,200 turns/month. Average turn: 3 tool calls, 2,500 input tokens, 400 output tokens (Sonnet 4.6 pricing at current public rates ~$3/MTok in, ~$15/MTok out).

- Input: 7,200 × 2,500 = 18M tokens → ~$54/month.
- Output: 7,200 × 400 = 2.9M tokens → ~$43/month.
- **Total: ~$100/month per heavily-used site.**

A light site (5 users, 5 turns/day) lands at ~$15/month. A premium-mode site routing to Opus 4.6 lands at ~$400/month and is therefore opt-in only.

Cache-control on the system prompt cuts input cost by 30–40% once implemented; not assumed above.

## Implementation plan

Target ~12 developer-days.

| Day | Work |
|-----|------|
| 1 | Migrations (4 new tables), blueprint skeleton, register under `/api`. |
| 2 | Tool 1–3 (`list_tags`, `get_tag_value`, `get_tag_timeseries`) + unit tests. |
| 3 | Tool 4–6 (`compare_periods`, `compute_cost`, `get_orders_in_period`) + tests. |
| 4 | Tool-use loop in `chat_bp.py` with Anthropic SDK; non-streaming `/ask` endpoint. |
| 5 | SSE streaming endpoint + Socket.IO bridge. |
| 6 | Guardrails: caps, role-based tool filter, validator for "why" questions, rate limiting. |
| 7 | `ChatAssistant.jsx` + `MessageList` + `Composer` + `ConversationSidebar`. |
| 8 | `chart_spec` parser + inline render + `Save to dashboard` flow. |
| 9 | Preferences drawer + system-prompt templating per user. |
| 10 | Audit log UI (admin) + transcript export. |
| 11 | QA matrix: why-questions, scenarios, hallucination attempts, role enforcement, 90-day cap, tag-not-found recovery. |
| 12 | Load test (30 concurrent turns), cost-tracking dashboards, documentation pass. |

## What success looks like

- A plant manager asking "why did Mill B pull 6% more power yesterday?" gets a named-tag, named-time, data-cited answer within 15 seconds.
- "What would last month have cost if I'd shifted 200 kWh/day to 22:00?" returns both totals, the band breakdown, and the assumption box.
- Zero reports of the assistant inventing tag names in the first 30 days.
- At least 40% of weekly active users save at least one chat-built chart to a dashboard within 60 days.
- P95 turn latency under 12 seconds, including tool calls.

## Implementation cost

See the 12-day table above. Single engineer. Front-load the tool layer — it is the substrate for every other generative feature (and could be reused by the briefing pipeline later).

## Out of scope (pinned reminder)

- Push notifications / morning briefings / mobile alerts.
- Anomaly alerts inside chat (lives in Plan 3 + briefing).
- Maintenance tickets, Jira/Zoho, email drafting, Slack, outbound anything.
- Writes to the PLC, tags, setpoints, users.
- Web browsing beyond the six tools.
- Multi-tenant cross-site data access from chat.
- Voice input or output.
- RAG over internal documentation (separate track if ever pursued).
