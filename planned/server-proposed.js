const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const app = express();
app.use(express.json());

const PORT = 3000;

// ---------- File logging (logs/api.log) ----------
const logDir = path.join(__dirname, 'logs');
fs.mkdirSync(logDir, { recursive: true });

function logToFile(file, line) {
  fs.appendFile(
    path.join(logDir, file),
    `${new Date().toISOString()} ${line}\n`,
    () => {}
  );
}

app.use((req, res, next) => {
  res.on('finish', () => {
    logToFile(
      'api.log',
      `${req.method} ${req.originalUrl} ` +
        `content-type=${req.headers['content-type']} ` +
        `body=${JSON.stringify(req.body)} status=${res.statusCode}`
    );
  });
  next();
});

// ---------- Validation helpers ----------
const isValidAmount = (a) => typeof a === 'number' && Number.isFinite(a) && a > 0;
const isValidTransferId = (id) =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

const LABEL = { DEBIT: 'Debit', CREDIT: 'Credit', REFUND: 'Refund' };

/**
 * Applies one balance change atomically.
 * If a transferId is given, the step is recorded in transfer_ledger in the SAME
 * database transaction, so repeating the call with the same transferId does not
 * move money twice.
 */
async function applyChange({ accountId, amount, transferId, operation }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (transferId) {
      if (operation !== 'REFUND') {
        // A transfer that was refunded must not be completed later.
        const refunded = await client.query(
          `SELECT 1 FROM transfer_ledger WHERE transfer_id = $1 AND operation = 'REFUND'`,
          [transferId]
        );
        if (refunded.rowCount > 0) {
          await client.query('ROLLBACK');
          return {
            status: 409,
            body: { error: 'Transfer was already refunded; use a new transferId' },
          };
        }
      } else {
        // A refund must match an earlier debit of the same transfer.
        const debit = await client.query(
          `SELECT account_id, amount FROM transfer_ledger
           WHERE transfer_id = $1 AND operation = 'DEBIT'`,
          [transferId]
        );
        const d = debit.rows[0];
        if (!d || d.account_id !== accountId || Number(d.amount) !== amount) {
          await client.query('ROLLBACK');
          return {
            status: 409,
            body: { error: 'No matching debit found for this refund' },
          };
        }
      }

      const claim = await client.query(
        `INSERT INTO transfer_ledger (transfer_id, operation, account_id, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (transfer_id, operation) DO NOTHING
         RETURNING id`,
        [transferId, operation, accountId, amount]
      );

      if (claim.rowCount === 0) {
        // Same step already applied: return the earlier outcome, move nothing.
        const prior = await client.query(
          `SELECT account_id, amount FROM transfer_ledger
           WHERE transfer_id = $1 AND operation = $2`,
          [transferId, operation]
        );
        await client.query('ROLLBACK');
        const p = prior.rows[0];
        if (p && (p.account_id !== accountId || Number(p.amount) !== amount)) {
          return {
            status: 409,
            body: { error: 'transferId already used with different details' },
          };
        }
        const acc = await pool.query(
          'SELECT account_id, owner_name, balance FROM accounts WHERE account_id = $1',
          [accountId]
        );
        return {
          status: 200,
          body: {
            message: `${LABEL[operation]} already applied`,
            replayed: true,
            account: acc.rows[0],
          },
        };
      }
    }

    const sql =
      operation === 'DEBIT'
        ? `UPDATE accounts SET balance = balance - $1
           WHERE account_id = $2 AND balance >= $1
           RETURNING account_id, owner_name, balance`
        : `UPDATE accounts SET balance = balance + $1
           WHERE account_id = $2
           RETURNING account_id, owner_name, balance`;

    const result = await client.query(sql, [amount, accountId]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK'); // also removes the ledger claim
      const exists = await pool.query(
        'SELECT 1 FROM accounts WHERE account_id = $1',
        [accountId]
      );
      if (exists.rowCount === 0) {
        return { status: 404, body: { error: 'Account not found' } };
      }
      return { status: 409, body: { error: 'Insufficient balance' } };
    }

    await client.query('COMMIT');
    return {
      status: 200,
      body: { message: `${LABEL[operation]} successful`, account: result.rows[0] },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Routes ----------
app.get('/health', (req, res) => res.json({ status: 'UP' }));

// View all accounts
app.get('/accounts', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT account_id, owner_name, balance FROM accounts ORDER BY account_id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Debit an account. Body: { amount, transferId? }
app.post('/accounts/:id/debit', async (req, res) => {
  const { amount, transferId } = req.body;

  if (!isValidAmount(amount)) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (transferId !== undefined && !isValidTransferId(transferId)) {
    return res.status(400).json({ error: 'transferId must be 8-64 letters, digits, - or _' });
  }

  try {
    const out = await applyChange({
      accountId: req.params.id,
      amount,
      transferId,
      operation: 'DEBIT',
    });
    res.status(out.status).json(out.body);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Debit failed' });
  }
});

// Credit an account. Body: { amount, transferId?, operation? ('CREDIT' | 'REFUND') }
app.post('/accounts/:id/credit', async (req, res) => {
  const { amount, transferId } = req.body;
  const operation = req.body.operation || 'CREDIT';

  if (!isValidAmount(amount)) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (transferId !== undefined && !isValidTransferId(transferId)) {
    return res.status(400).json({ error: 'transferId must be 8-64 letters, digits, - or _' });
  }
  if (!['CREDIT', 'REFUND'].includes(operation)) {
    return res.status(400).json({ error: "operation must be 'CREDIT' or 'REFUND'" });
  }

  try {
    const out = await applyChange({
      accountId: req.params.id,
      amount,
      transferId,
      operation,
    });
    res.status(out.status).json(out.body);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: `${LABEL[operation]} failed` });
  }
});

// Look up what happened to a transfer
app.get('/transfers/:transferId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT operation, account_id, amount, created_at
       FROM transfer_ledger WHERE transfer_id = $1 ORDER BY id`,
      [req.params.transferId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    const ops = result.rows.map((r) => r.operation);
    const state = ops.includes('REFUND')
      ? 'REFUNDED'
      : ops.includes('CREDIT')
      ? 'COMPLETED'
      : 'DEBITED'; // debit applied, credit not yet applied
    res.json({ transferId: req.params.transferId, state, steps: result.rows });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Malformed JSON and other unexpected errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err.message);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
