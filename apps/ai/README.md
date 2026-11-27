# WhatBox AI: shared photo checks

One service, run by WhatBox in its Azure account, that every WhatBox dating site and every other
WhatBox app uses to check photos. Outside sites and apps can use it too and are billed per photo.

For each photo it answers two questions:

1. **Is it adult content?** `safe`, `suggestive` (revealing clothing, suggestive poses) or `explicit`
   (nudity, sexual content). Uses Azure AI Content Safety.
2. **Does it contain contact info?** Phone numbers, email addresses, web addresses, social handles
   (WhatsApp, Snapchat, Instagram, Telegram and others) written in the photo, and any QR code.
   Uses Azure AI Vision to read text, then the same rules the dating sites use for messages.

Photos are checked in memory and thrown away. WhatBox AI never stores a photo or the text read
from it. It keeps only who called it and how many photos they checked each day.

## Plugging in another app

You need two things from WhatBox: the service address and an API key. A WhatBox platform admin
makes the key in **Platform Admin → All sites and owners → WhatBox AI → Add an app or site**.
The key is shown once; keep it on your server, never in a phone app or web page.

### Check a photo

Send the photo's bytes as the request body:

```
curl -X POST "https://<whatbox-ai-address>/v1/photos/check" \
  -H "Authorization: Bearer wbai_your_key" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg
```

Or JSON, if that is easier from your code: `{"imageBase64": "<base64 of the file>"}` with
`Content-Type: application/json`.

JPEG, PNG, WebP, HEIC, AVIF and GIF are accepted, up to 10 MB.

Optional query parameters:

| Parameter | Meaning |
|---|---|
| `checks=adult` or `checks=contact` | Run only one of the two checks. Default is both. Each photo counts once either way. |
| `account=<id>` | Your own label for usage reports, e.g. a customer or site id. Letters, digits, `.`, `-`, `_`. |

Answer:

```json
{
  "id": "chk_6f1c2a9e0b7d4410",
  "rating": "suggestive",
  "adult": { "checked": true, "severity": 2 },
  "contact": {
    "checked": true,
    "found": true,
    "kinds": ["phone", "qr"],
    "matches": [
      { "kind": "phone", "text": "555 123 4567" },
      { "kind": "qr", "text": "https://instagram.com/someone" }
    ]
  },
  "ms": 640
}
```

- `rating` is what to act on. `severity` is Azure's raw score (0, 2, 4 or 6) if you want your own cutoffs.
- `contact.kinds` can include `phone`, `email`, `url`, `handle` and `qr`. `matches` shows what was
  found so a moderator can see why.

What the WhatBox dating sites do with the answer, as an example:

- `explicit` on a public photo, or on a site that doesn't allow explicit photos: refuse the upload.
- `suggestive` or `explicit` on an allowed photo: save it with that rating, so members who hide
  explicit photos never see it. The member can't mark it as less explicit.
- Contact info found: keep the photo hidden until a moderator approves it.
- WhatBox AI unreachable: accept the photo and put it in the moderation queue as usual.

### Errors

Errors come back as `{"code": "...", "message": "..."}` with a plain-English message.

| Status | Meaning |
|---|---|
| 401 | Missing or wrong key |
| 403 | Your key has been turned off |
| 413 | Photo over 10 MB |
| 415 | Not a photo we can read |
| 429 | Too many photos this minute (default 120 a minute per key; ask WhatBox for more) |
| 502 | The check is down for a moment. Retry later, or accept the photo and review it by hand |

### Your usage

```
curl "https://<whatbox-ai-address>/v1/usage?month=2026-12" -H "Authorization: Bearer wbai_your_key"
```

Returns photos checked, how many were flagged, and the bill estimate for the month (zero for
WhatBox's own apps).

## Billing

- WhatBox's own sites and apps: free. Their usage is still counted so WhatBox can see its Azure costs.
- Outside apps that call WhatBox AI directly: billed per photo at the rate set on their key
  (default 0.5¢). Shown in Platform Admin → WhatBox AI.
- Outside dating sites hosted on the WhatBox platform: the platform checks their photos when
  "Check new photos with WhatBox AI" is on for the site, and the cost appears on that site's own bill
  as "Photo AI checks".

Azure's own cost is about 0.23¢ per photo (Content Safety plus Vision text reading) after the free
allowance, so 0.5¢ covers it with margin.

## Running it

```
npm run dev -w @whatbox/ai          # http://localhost:4100, AI_ENGINE=stub (no Azure, QR codes still found)
npm test -w @whatbox/ai
```

Settings (environment variables):

| Name | Meaning |
|---|---|
| `PG_SERVER_URL`, `PG_SSL`, `AI_DB` | Postgres server; the service creates its own `whatbox_ai` database |
| `AI_ENGINE` | `stub` (local) or `azure` |
| `CONTENT_SAFETY_ENDPOINT`, `CONTENT_SAFETY_KEY` | Azure AI Content Safety |
| `VISION_ENDPOINT`, `VISION_KEY` | Azure AI Vision |
| `AI_ADMIN_KEY` | Lets Platform Admin list callers and make keys |
| `PLATFORM_CALLER_KEY` | The dating platform's own key, registered as the free `whatbox-dating` caller on start |

In Azure, `infra/modules/ai.bicep` creates the two Azure AI accounts and the `whatbox-<env>-ai`
container app, and the deploy workflow puts every key in Key Vault. See `infra/README.md`.

Admin routes (used by Platform Admin, need `AI_ADMIN_KEY`): `GET /v1/admin/callers?month=`,
`POST /v1/admin/callers`, `PATCH /v1/admin/callers/:id`, `POST /v1/admin/callers/:id/key`.
