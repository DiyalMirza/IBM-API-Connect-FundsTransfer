
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const PORT = 3000;

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

// Debit an account
app.post('/accounts/:id/debit', async (req, res) => {
  const { amount } = req.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `UPDATE accounts
       SET balance = balance - $1
       WHERE account_id = $2 AND balance >= $1
       RETURNING account_id, owner_name, balance`,
      [amount, req.params.id]
    );

    if (result.rows.length === 0) {
      const account = await client.query(
        'SELECT account_id FROM accounts WHERE account_id = $1',
        [req.params.id]
      );

      if (account.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }

      return res.status(409).json({ error: 'Insufficient balance' });
    }

    res.json({ message: 'Debit successful', account: result.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Debit failed' });
  } finally {
    client.release();
  }
});

// Credit an account
app.post('/accounts/:id/credit', async (req, res) => {
  const { amount } = req.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const result = await pool.query(
      `UPDATE accounts
       SET balance = balance + $1
       WHERE account_id = $2
       RETURNING account_id, owner_name, balance`,
      [amount, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Credit successful', account: result.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Credit failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});