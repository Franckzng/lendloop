# n8n integration

n8n runs locally in Docker. Convex runs in the cloud, so the two talk over a
tunnel during development. Every call between them is signed.

## 1. Start n8n

```bash
cp .env.n8n.example .env.n8n
openssl rand -hex 32            # paste the result as LENDLOOP_WEBHOOK_SECRET in .env.n8n
docker compose up -d
```

n8n is now on http://localhost:5678. On the first visit it asks you to create
the owner account of your local instance.

## 2. Import the workflows

```bash
docker compose cp n8n/workflows/request-notification.json n8n:/tmp/request-notification.json
docker compose exec n8n n8n import:workflow --input=/tmp/request-notification.json
docker compose exec n8n n8n publish:workflow --id=lendloopRequestNotif
docker compose restart n8n
```

You can also import the file from the n8n editor (menu → Import from file) and
publish it there.

## 3. Open a tunnel

Convex Cloud cannot reach `localhost`. A tunnel gives the local n8n a public
HTTPS address:

```bash
cloudflared tunnel --url http://localhost:5678
```

It prints an address such as `https://some-words.trycloudflare.com`. No account
is needed. The address changes every time the tunnel restarts, so steps 3 and 4
have to be repeated after a restart. `ngrok http 5678` works the same way.

Put the address in `.env.n8n` as `N8N_WEBHOOK_URL=https://some-words.trycloudflare.com/`
and apply it with `docker compose up -d`.

## 4. Tell Convex where n8n is

```bash
npx convex env set N8N_WEBHOOK_SECRET <same value as LENDLOOP_WEBHOOK_SECRET>
npx convex env set N8N_REQUEST_WEBHOOK_URL https://some-words.trycloudflare.com/webhook/lendloop/request-notification
```

Without these two variables the app still works: notifications are skipped and
a warning is written to the Convex logs.

## How a notification travels

1. A mutation changes a loan status. In the same transaction it records an
   event and schedules the delivery, so nothing is sent if the mutation fails.
2. A Convex action posts the event to n8n:

   ```json
   { "eventId": "…", "loanId": "…", "status": "approved",
     "recipientEmail": "…", "toolName": "…", "timestamp": 1790000000000 }
   ```

   Those six fields are all n8n ever receives.
3. The request carries two headers:
   - `X-LendLoop-Timestamp`: the time of sending, in milliseconds
   - `X-LendLoop-Signature`: `HMAC-SHA256(secret, timestamp + "." + body)` in hex
4. The workflow recomputes the signature over the raw body, compares it in
   constant time, and rejects any timestamp more than 5 minutes away from its
   own clock. A rejected call gets a `401` and no detail.
5. A valid call builds the notification and answers `200`.

The secret is read from the container environment (`LENDLOOP_WEBHOOK_SECRET`).
It is not stored in the workflow, so the exported JSON is safe to commit.

## Retries

Convex tries each delivery up to 3 times: immediately, after 30 seconds, then
after 2 minutes. Each attempt is signed again with a fresh timestamp and keeps
the same `eventId`, so a receiver can recognise a duplicate. A `4xx` answer is
not retried, because the same request would be refused again. A delivery that
fails for good is logged in Convex and recorded in the `automationEvents`
table as `notification_failed`.

## Try it by hand

```bash
set -a; . ./.env.n8n; set +a
BODY='{"eventId":"demo","loanId":"demo","status":"pending","recipientEmail":"demo@example.com","toolName":"Ladder","timestamp":0}'
TS=$(date +%s%3N)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$LENDLOOP_WEBHOOK_SECRET" -hex | awk '{print $NF}')

# Valid signature -> 200
curl -i -X POST http://localhost:5678/webhook/lendloop/request-notification \
  -H 'Content-Type: application/json' \
  -H "X-LendLoop-Timestamp: $TS" -H "X-LendLoop-Signature: $SIG" --data-binary "$BODY"

# Wrong signature -> 401
curl -i -X POST http://localhost:5678/webhook/lendloop/request-notification \
  -H 'Content-Type: application/json' \
  -H "X-LendLoop-Timestamp: $TS" -H "X-LendLoop-Signature: ${SIG/a/b}" --data-binary "$BODY"
```
