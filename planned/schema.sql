-- Run once in PostgreSQL (pgAdmin Query Tool or psql).
-- Audit trail + idempotency for transfers. One row per applied balance change.
CREATE TABLE IF NOT EXISTS transfer_ledger (
  id          SERIAL PRIMARY KEY,
  transfer_id VARCHAR(64)   NOT NULL,
  operation   VARCHAR(10)   NOT NULL CHECK (operation IN ('DEBIT', 'CREDIT', 'REFUND')),
  account_id  VARCHAR(30)   NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (transfer_id, operation)   -- the same step can never be applied twice
);

CREATE INDEX IF NOT EXISTS idx_ledger_transfer ON transfer_ledger (transfer_id);
