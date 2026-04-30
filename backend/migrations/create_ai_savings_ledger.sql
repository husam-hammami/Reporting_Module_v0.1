-- Plan 5 §4.6 — Money-saved-this-month attribution ledger.
-- Append-only audit log of savings rules that fired + user attribution actions.

CREATE TABLE IF NOT EXISTS ai_savings_ledger (
    id              SERIAL          PRIMARY KEY,
    rule            VARCHAR(32)     NOT NULL,                 -- 'pf_correction' | 'yield_drift' | 'off_peak_shift'
    asset_name      VARCHAR(64),
    detected_at     TIMESTAMP,
    actioned_at     TIMESTAMP,
    omr_saved       NUMERIC(10,4)   NOT NULL DEFAULT 0,
    confidence_pct  INT             NOT NULL DEFAULT 50
        CHECK (confidence_pct BETWEEN 0 AND 100),             -- §16.2: round-down enforced in code
    user_attributed BOOLEAN         DEFAULT FALSE,
    disputed        BOOLEAN         DEFAULT FALSE,            -- §16.7: Dispute button drops confidence to 0
    evidence_json   JSONB           DEFAULT '{}'::JSONB,      -- §16.2: snapshots values, not refs
    notes           TEXT,
    created_at      TIMESTAMP       DEFAULT NOW(),
    updated_at      TIMESTAMP       DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_ledger_rule_time
    ON ai_savings_ledger(rule, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_savings_ledger_asset_time
    ON ai_savings_ledger(asset_name, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_savings_ledger_disputed
    ON ai_savings_ledger(disputed)
    WHERE disputed = FALSE;

-- Confidence-weighted total query helper (used by /api/hercules-ai/savings)
-- Active = not disputed.
COMMENT ON TABLE ai_savings_ledger IS
    'Plan 5 §4.6 — append-only ledger. Confidence-weighted sum is omr_saved * confidence_pct/100 over non-disputed rows.';
