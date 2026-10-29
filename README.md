# IBM API Connect Funds Transfer API

> Personal learning project. Not affiliated with or endorsed by IBM.

A funds-transfer REST API published through **IBM API Connect** (v12, DataPower Nano Gateway).
An **IBM App Connect Enterprise (ACE 12)** flow orchestrates each transfer: it debits the source
account, credits the destination, and **automatically refunds the source if the credit fails**.

**Stack:** IBM API Connect · IBM ACE 12 (ESQL) · Node.js · Express · PostgreSQL · OpenAPI 3.0 · Postman · ngrok (testing only)

## Contents

1. [Architecture](#architecture)
2. [How a transfer works](#how-a-transfer-works)
3. [API Connect setup](#api-connect-setup)
4. [Screenshots](#screenshots)
5. [Tests performed](#tests-performed)
6. [Troubleshooting story](#troubleshooting-story)
7. [Known limitations](#known-limitations)
8. [Planned improvements](#planned-improvements)
9. [Repository layout](#repository-layout)

## Architecture

```mermaid
flowchart LR
  C["Client (Postman)"] --> G["IBM API Connect<br/>Nano Gateway"]
  G --> T["Tunnel (ngrok)<br/>testing only"]
  T --> A["IBM ACE flow<br/>/funds-transfer"]
  A --> N["Node.js API<br/>debit / credit"]
  N --> D[("PostgreSQL")]
```

| Component | Role |
|---|---|
| **API Connect** | Publishes the API, checks credentials, applies the rate limit |
| **ngrok** | Lets the cloud trial gateway reach ACE on a laptop (testing only) |
| **ACE flow** | Orchestrates debit, credit and refund; writes trace logs |
| **Node.js API** | Debit and credit endpoints (a refund is a credit back to the source) |
| **PostgreSQL** | Account balances |

## How a transfer works

```mermaid
flowchart TD
  S["Transfer request"] --> D["Debit source account"]
  D -->|rejected| DF["DEBIT_FAILED<br/>nothing moved"]
  D -->|unknown outcome| DU["DEBIT_UNCERTAIN<br/>manual check"]
  D -->|ok| C["Credit destination account"]
  C -->|ok| OK["SUCCESS"]
  C -->|rejected| R["Refund source account"]
  C -->|unknown outcome| CU["CREDIT_UNCERTAIN<br/>manual check"]
  R -->|ok| RF["FAILED_REFUNDED"]
  R -->|fails| CF["COMPENSATION_FAILED<br/>manual reconciliation"]
```

| `status` | Meaning |
|---|---|
| `SUCCESS` | Debit and credit both applied |
| `DEBIT_FAILED` | Debit rejected, nothing moved |
| `FAILED_REFUNDED` | Credit failed, source account refunded |
| `DEBIT_UNCERTAIN` / `CREDIT_UNCERTAIN` | Timeout or connection failure; outcome unknown |
| `COMPENSATION_FAILED` | Refund failed; manual reconciliation needed |

## API Connect setup

Policy sequence `call-ace`:

```mermaid
flowchart LR
  E["Extract Identity"] --> AU["Authenticate<br/>(Subscription)"] --> RL["Rate Limit<br/>5 / minute"] --> I["Invoke<br/>ACE endpoint"]
```

| Setting | Value |
|---|---|
| Gateway / catalog | DataPower Nano Gateway / Sandbox |
| Base path and operation | `/funds-transfer-api`, `POST /transfer` |
| Security | API key: `X-IBM-Client-Id` and `X-IBM-Client-Secret` headers |
| Rate limit | 5 requests per minute, over the limit returns 429 (shared across applications) |
| Invoke | Plain URL to the ACE endpoint, 60 s timeout |
| TLS client profile | `tls-client-profile-catalog-default:1.0.0` (required for any https target) |

The gateway files are in [`apic/`](apic). The Invoke URL there is a placeholder.

## Screenshots

### Published API
<img src="docs/screenshots/01-published-api.png" alt="Published API in the Sandbox catalog" width="800">

*The API in the Sandbox catalog with state `online-success`.*

### Policy sequence
<img src="docs/screenshots/02-policy-sequence.png" alt="call-ace policy sequence" width="800">

*Extract Identity, Authenticate, Rate Limit and Invoke.*

### Rate limit definition
<img src="docs/screenshots/03-rate-limit-definition.png" alt="transfer-limit definition" width="800">

*5 requests per 1 minute; exceeding the limit returns 429.*

### Applications and subscriptions
<img src="docs/screenshots/04-subscriptions.png" alt="Subscriptions" width="800">

*Applications subscribed to the Default Plan of the product.*

### Consumer Catalog
<img src="docs/screenshots/Analytics/Consumer Catalog.png" alt="Consumer Catalog product page" width="800">
<img src="docs/screenshots/Analytics/Consumer Catalog1.png" alt="Consumer Catalog product page" width="800">
<img src="docs/screenshots/Analytics/Consumer Catalog2.png" alt="Consumer Catalog product page" width="800">

*The developer's view of the product.*

### Security tests (Postman)
<img src="docs/screenshots/07-postman-wrong-secret-401.png" alt="Wrong secret returns 401" width="800">

*A wrong secret is rejected with 401.*

<img src="docs/screenshots/08-postman-valid-debit-failed.png" alt="Valid credentials, rejected debit" width="800">

*Valid credentials reach ACE; an oversized amount returns `DEBIT_FAILED` and no money moves.*

### Transfer tests (Postman)
<img src="docs/screenshots/09-postman-success.png" alt="Successful transfer" width="800">

*A real transfer returns `SUCCESS`.*

<img src="docs/screenshots/10-postman-refund.png" alt="Failed credit refunded" width="800">

*A transfer to an unknown account returns `FAILED_REFUNDED`; the source balance is unchanged.*

### Analytics
<img src="docs/screenshots/05-analytics.png" alt="Analytics Discover page" width="800">

*Gateway events: 200, 401 and 429 responses.*

<img src="docs/screenshots/11-analytics-final.png" alt="Analytics after final tests" width="800">

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

The gateway returned `200` with an **empty body**. The ngrok inspector showed that ACE was replying
correctly, so the fault had to be inside the gateway. The Invoke policy had explicit `input` and
`output` message settings; removing them made the gateway return the backend's reply.
I found the fix by testing and have not confirmed the internal reason.

A second finding: the security scheme in the OpenAPI file did **not** enforce anything on the
Nano Gateway. Enforcement started only after I added Extract Identity and Authenticate policies
to the sequence.

## Known limitations

- The rate limit is **shared across applications**, even with consumer-specific ticked.
- Analytics shows App name as `n/a`, so calls from different applications cannot be told apart.
- A second application briefly returned a 500 that cleared without any change; the cause was not found.
- A rejected transfer came back as HTTP 200 through the gateway, so callers should read the `status` field.
- ngrok is a temporary public tunnel; ACE would need permanent hosting for real use.
- Trial gateway only: no OAuth, JWT, DataPower or full Developer Portal work.

See [`docs/findings.md`](docs/findings.md) for what was and was not confirmed.

## Planned improvements

Prepared in [`planned/`](planned) but **not yet applied or tested**:

- Idempotent transfers: a `transferId` and a `transfer_ledger` table so a retried request cannot move money twice.
- Postman collection for automated tests.
- Per-application rate limiting and gateway-level input validation.

## Repository layout

```
├── README.md
├── backend-node/   Node.js API (debit and credit endpoints)
├── ace/            IBM ACE project (message flow and ESQL)
├── apic/           IBM API Connect policy and API files
├── planned/        prepared, untested improvements
└── docs/           findings, notes and screenshots
```
