# Findings and known limitations

Everything below was observed during testing. Items marked "not confirmed" were not proven.

## Confirmed
- A call with no credentials returns 401 at the gateway and never reaches ACE.
- A call with only a Client ID, or only a secret, returns 401.
- A call with a valid Client ID and secret reaches ACE.
- More than 5 calls in a minute return 429; the 429 is returned in about 2 ms, before the backend.
- The 5-per-minute limit is shared across applications, even with `consumerSpecific: true`.
- Analytics shows `App name: n/a` on every row, so calls from different applications cannot be told apart there.
- Placing `input: request` / `output: message` on the Invoke policy returned an empty body; removing them returned ACE's reply.
- The OpenAPI `securitySchemes` entry did not enforce anything on the Nano Gateway; Extract Identity + Authenticate policies did.
- The Nano Gateway requires a TLS client profile for any https Invoke target.

## Not confirmed
- Why the Invoke `input` / `output` lines caused the empty reply.
- Why `test-app` worked while its Subscriptions count showed 0.
- The cause of a one-off HTTP 500 for a second application, which cleared by itself.
- Whether a wrong secret returns 401 (only missing credentials were tested).
- Why a rejected transfer returned HTTP 200 through the gateway when ACE is meant to send 409.
- Whether the idempotency changes (`server.js`, `schema.sql`, ESQL) were applied and tested.

## Interview story (debugging)
The API returned 200 with an empty body. The ngrok inspector showed ACE was replying correctly,
so I isolated the fault to the gateway's Invoke message settings. Removing the explicit input and
output message settings fixed it. I found the fix by testing and have not confirmed the internal reason.
