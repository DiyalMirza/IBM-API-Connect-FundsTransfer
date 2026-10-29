# Funds Transfer: IBM API Connect + IBM ACE + Node.js + PostgreSQL

A funds-transfer API published through IBM API Connect (v12, DataPower Nano Gateway).
An IBM App Connect Enterprise (ACE 12) flow orchestrates the transfer: it debits the
source account, credits the destination, and refunds the source if the credit fails.

## Architecture

```
Client -> API Connect (gateway) -> tunnel (testing only) -> ACE flow -> Node.js API -> PostgreSQL
```

| Component | Role |
|---|---|
| PostgreSQL | Account balances |
| Node.js (port 3000) | Debit and credit endpoints (a refund is a credit back to the source) |
| ACE flow `/funds-transfer` | Orchestration and compensation (ESQL Compute nodes, HTTP Request nodes, Trace nodes for logging) |
| API Connect | Publishes the API; Client ID and secret security; rate limit |
| ngrok | Lets the cloud trial gateway reach a local ACE (testing only) |

## Transfer outcomes

| `status` | Meaning |
|---|---|
| `SUCCESS` | Debit and credit both applied |
| `DEBIT_FAILED` | Debit rejected, nothing moved |
| `FAILED_REFUNDED` | Credit failed, source account refunded |
| `DEBIT_UNCERTAIN` / `CREDIT_UNCERTAIN` | Timeout or connection failure; outcome unknown, manual check needed |
| `COMPENSATION_FAILED` | Refund failed; manual reconciliation needed |

## API Connect configuration

Policy sequence `call-ace`: **Extract Identity -> Authenticate -> Rate Limit -> Invoke**

| Setting | Value |
|---|---|
| Gateway / catalog | DataPower Nano Gateway / Sandbox |
| API server (base path) | `/funds-transfer-api` |
| Operation | `POST /transfer` |
| Security | Extract Identity (API key: `X-IBM-Client-Id` and `X-IBM-Client-Secret` headers) + Authenticate (Subscription) |
| Rate limit | 5 requests per minute, return 429 (shared across applications) |
| Invoke | plain URL to the ACE endpoint, 60 s timeout |
| TLS client profile | `tls-client-profile-catalog-default:1.0.0` (required for any https target) |

The gateway files are in `apic/`. The Invoke URL there is a placeholder.

## Tests performed

| Case | Result |
|---|---|
| No credentials | 401 |
| Missing Client ID or missing secret | 401 |
| Wrong secret | 401 |
| Valid credentials, amount too large | `DEBIT_FAILED` |
| Valid credentials, transfer between two accounts | `SUCCESS`, balances changed |
| Valid credentials, unknown destination account | `FAILED_REFUNDED`, source balance unchanged |
| More than 5 calls in a minute | 429 |

## Troubleshooting story

The gateway returned `200` with an empty body. The ngrok inspector showed ACE was replying
correctly, so the fault was in the gateway's Invoke policy. Removing the explicit `input` and
`output` message settings made the gateway return the backend reply. I found the fix by
testing and have not confirmed the internal reason.

## Known limitations

- The rate limit is shared across applications, even with consumer-specific ticked.
- Analytics shows App name as `n/a`, so calls from different applications cannot be told apart.
- A second application briefly returned a 500 that cleared without any change; the cause was not found.
- A rejected transfer returned HTTP 200 through the gateway; callers should read the `status` field.
- ngrok is a temporary public tunnel; ACE would need permanent hosting for real use.
- Trial gateway only: no OAuth, JWT, DataPower or full Developer Portal work.

See `docs/findings.md` for what was and was not confirmed.

## Planned improvements (in `planned/`, not yet applied or tested)

- **Idempotent transfers:** a `transferId` and a `transfer_ledger` table so a retried request cannot move money twice
  (`schema.sql`, a new `server.js`, ESQL changes).
- **Postman collection** for automated tests (needs the `X-IBM-Client-Secret` header added).
- Per-application rate limiting, and gateway-level input validation.
