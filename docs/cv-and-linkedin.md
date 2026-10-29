# CV and LinkedIn wording (use only lines you have done)

## CV project entry
**Funds Transfer API: IBM API Connect, IBM ACE, Node.js, PostgreSQL**
- Published a REST API on IBM API Connect v12 (DataPower Nano Gateway) with a policy sequence of
  Extract Identity, Authenticate, Rate Limit and Invoke, and a TLS client profile for an https backend.
- Secured the API with Client ID and secret; verified 401 for missing credentials and 429 above 5 requests per minute.
- Created applications and subscriptions, and used the Consumer Catalog as an API consumer.
- Built an IBM ACE 12 orchestration (ESQL) that debits, credits and refunds the source account if the credit fails.
- Diagnosed an empty-response gateway issue by comparing gateway output with backend traffic in the ngrok inspector.

## Add only after you test it
- "Added idempotent transfers with a ledger table in PostgreSQL" (after the retry test)
- "Automated API tests in Postman" (after you run the collection)

## Do not write
- "Per-application rate limiting" (your limit was shared)
- OAuth, JWT, Developer Portal, CI/CD, production experience

## Skills line
IBM API Connect (v12), IBM App Connect Enterprise 12, ESQL, OpenAPI 3.0, REST, JSON, Node.js, PostgreSQL, Postman

## LinkedIn post idea
Title: "What I learned putting a funds-transfer flow behind IBM API Connect"
Points: architecture diagram; the empty-reply bug and how the ngrok inspector found it; the rate limit that turned out
to be shared across apps; Analytics showing no app name. End with what you would do next (OAuth, DataPower, CI/CD).
