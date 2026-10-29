# Finish checklist (do these before the trial ends)

## 1. Protect your credentials
- [ ] Reset the `test-app` secret (it was pasted into a chat).
- [ ] Delete `partner-app` and the extra consumer organization if you no longer need them.
- [ ] Never commit: `.env`, Client IDs, secrets, your ngrok URL or token.

## 2. Screenshots (hide every ID and secret)
- [ ] Sandbox published assets list showing `online-success`
- [ ] The `call-ace` sequence: Extract Identity, Authenticate, Rate Limit, Invoke
- [ ] Invoke settings (URL hidden), the `transfer-limit` definition (5 / 1 / Minute / Return 429)
- [ ] Postman: 401 with no credentials; DEBIT_FAILED with valid credentials; 429 after 5 calls
- [ ] Analytics > Discover with 401, 429 and 200 rows
- [ ] Consumer Catalog product page, and the "application is now subscribed" message
- [ ] ngrok inspector showing a request from the gateway (hide headers)
- [ ] ACE flow, and the start of `ace-transfer.log`

## 3. Tests still to run (use amount 99999999 when money must not move)
- [ ] Wrong secret returns 401
- [ ] Success transfer (amount 10) through the gateway, balances change by 10
- [ ] Refund path (destination ACC9999), source balance unchanged
- [ ] Status-code check: send the same bad request to ACE directly and through the gateway
      curl.exe -i -X POST "http://localhost:7801/funds-transfer" -H "Content-Type: application/json" -d "{\"sourceAccount\":\"ACC1001\",\"destinationAccount\":\"ACC1002\",\"amount\":99999999}"
- [ ] Import the Postman collection, set `gatewayUrl` and `clientId`, run it

## 4. Backend improvements (optional but strong)
- [ ] Run `schema.sql`, replace `server.js`, restart Node
- [ ] Paste the ESQL modules from `ace-esql-changes.esql`, redeploy
- [ ] Retry test: same `transferId` twice moves money once; check `GET /transfers/{id}`

## 5. GitHub
- [ ] Copy this folder into a repo; keep `.gitignore`
- [ ] Add the ACE project files and the screenshots under `docs/`
- [ ] Tick only the README status boxes you have tested
