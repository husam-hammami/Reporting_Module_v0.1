# ECC Configuration Assessment — Post Backend Deep-Dive

## Context

After implementing the 6-fix PLC polling performance overhaul (TagValueCache, batched reads,
shared poller, reduced logging, bulk inserts, config caching), we need to evaluate whether
the ECC configuration (.claude/ agents, rules, skills, commands, contexts) is still accurate
and sufficient, or needs updates.

## Verdict: 80% solid, 20% stale or missing

The ECC setup is **genuinely project-specific** (not boilerplate) — agents reference real
classes, rules cite actual patterns, skills document real PostgreSQL/Flask conventions.
But the backend work exposed concrete gaps:

---

## What Worked Well

| ECC Asset | Why It Worked |
|-----------|---------------|
| `/code-review` command | Caught all 21 issues correctly — the agent checklist references advisory locks, workers, PLC safety |
| `python/patterns.md` | Worker try/except pattern, DB connection pattern, advisory lock pattern — all matched what we used |
| `python/security.md` | Correctly flags asteval-only for formulas, parameterized queries |
| `code-reviewer` agent | Its checklist was exactly right for the historian/dynamic_monitor rewrites |
| `backend/CLAUDE.md` | Route patterns, decorator conventions, blueprint structure — all accurate |
| Root `CLAUDE.md` | Architecture overview and data flow diagram were essential for understanding the system |

---

## What's Now Stale/Wrong

### 1. Testing rules say "NO test framework set up" — but we just created one
- `rules/common/testing.md` and `rules/python/testing.md` both say tests don't exist yet
- **Reality:** `backend/tests/` now has 37 passing pytest tests
- **Fix:** Update to reflect the new test structure

### 2. CLAUDE.md data flow diagram is outdated
- Shows: `PLC -> SharedPLCConnection -> [Historian | Monitor | WebSocket]` (3 independent readers)
- **Reality now:** `PLC -> TagPoller -> TagValueCache -> [Historian | Monitor | WebSocket]` (1 reader, 3 consumers)
- **Fix:** Update the architecture diagram

### 3. backend/CLAUDE.md missing new patterns
- No mention of `TagValueCache`, batched reads, `start_tag_poller()`, or the `tests/` directory
- **Fix:** Add a "Performance Patterns" section

### 4. Python patterns.md has wrong TTL
- Says "Config with TTL cache (5 seconds)"
- **Reality:** Tag config cache = 30s, layout config cache = 30s
- **Fix:** Update to 30s

---

## What's Missing (gaps exposed by real work)

### 5. No "performance optimization" agent
- The code-reviewer found the issues, but only because the user explicitly asked about performance
- **Suggestion:** Add a `performance-reviewer.md` agent that proactively checks for:
  - N+1 read patterns (N individual PLC calls when M batched reads suffice)
  - Redundant DB queries per cycle (should be cached)
  - Excessive logging in hot paths (workers running every second)
  - Missing bulk inserts (executemany -> execute_values)
  - Connection reuse vs creation per cycle

### 6. No rule about the TagValueCache / shared-poller pattern
- This is now a **core architectural pattern** — any new worker MUST use the cache, not call `read_all_tags()` directly
- **Suggestion:** Add to `python/patterns.md` and `backend/CLAUDE.md`:
  ```
  ## Tag Value Access (MANDATORY)
  Workers MUST read from TagValueCache via get_tag_value_cache().get_values().
  NEVER call read_all_tags() from a worker — that creates redundant PLC reads.
  Only the shared poller (start_tag_poller) calls read_all_tags_batched().
  ```

### 7. No cache invalidation pattern
- We added `invalidate_tag_config_cache()` and `invalidate_layout_config_cache()`
  but there's no documented rule about WHEN to call them
- **Suggestion:** Add rule: "When Settings API modifies tags or layouts, call the
  corresponding invalidate function so the 30s cache refreshes immediately"

### 8. No `/test` command to actually run tests
- We have `/tdd` for TDD guidance but no command that runs `python -m pytest backend/tests/ -v`
- **Suggestion:** Add `commands/test.md` that runs the test suite

### 9. No eventlet compatibility rule
- TagValueCache uses `threading.Lock` which works under eventlet's monkey-patching,
  but this isn't documented. A future developer might use `multiprocessing.Lock` or
  `asyncio.Lock` which would break
- **Suggestion:** Add rule: "All concurrency primitives MUST be threading-based
  (threading.Lock, threading.Event). Eventlet monkey-patches these. Never use
  multiprocessing or asyncio primitives."

### 10. eval() in tag_reader.py contradicts security rules
- `python/security.md` says "Formula evaluation ONLY via asteval (never eval/exec)"
- **Reality:** `evaluate_value_formula()` in tag_reader.py uses `eval()` with a restricted dict
- **This is a real security gap** — the rules are correct but the code violates them
- **Suggestion:** Flag this as tech debt to migrate to asteval, or document the restricted-eval as an accepted exception

---

## Recommended Changes (10 items)

### Update existing files:
1. **`rules/common/testing.md`** — Update: pytest exists at `backend/tests/`, 37 tests, run with `python -m pytest backend/tests/ -v`
2. **`rules/python/testing.md`** — Update fixtures and test patterns to match actual test files
3. **`rules/python/patterns.md`** — Add TagValueCache pattern, fix TTL from 5s to 30s, add cache invalidation pattern, add eventlet rule
4. **`CLAUDE.md` (root)** — Update data flow diagram to show TagPoller -> Cache -> Workers
5. **`backend/CLAUDE.md`** — Add Performance Patterns section (TagValueCache, batched reads, bulk insert, config caching), add tests/ directory reference

### Add new files:
6. **`agents/performance-reviewer.md`** — Agent that checks for N+1 reads, missing caches, excessive logging, missing bulk inserts
7. **`commands/test.md`** — Command to run pytest suite

### Flag for future:
8. **Migrate `evaluate_value_formula()` from eval() to asteval** — security rules say asteval-only but code uses eval
9. **Add `invalidate_*_cache()` calls** to Settings API endpoints that modify tags/layouts
10. **Document the `read_all_tags()` vs `read_all_tags_batched()` distinction** — original kept for backward compat, batched is for the poller only

---

## Verification

After implementing these changes:
- Run `python -m pytest backend/tests/ -v` — should still pass 37/37
- Verify CLAUDE.md data flow diagram matches actual code
- Spot-check that `python/patterns.md` TagValueCache example is importable
- Confirm new `/test` command works
