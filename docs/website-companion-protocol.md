# SlothBloom website companion protocol

StreamBridge uses an outbound-only device flow. The website never connects to a creator's computer, receives the local Wizard control token, or applies settings directly.

## Trust boundaries

- The installed Bridge trusts only an HTTPS origin configured at process startup. Production defaults to `https://www.slothbloom.com`.
- Pairing and dashboard URLs returned by the service must use that exact origin.
- The permanent device credential is stored only in `data/private/website-companion.json` and is never returned by a local Wizard endpoint.
- Website configuration documents must use the existing `thsv.streambridge.wizard-configuration` export format and must never contain provider tokens, passwords, local paths, uploaded media, chat history, or viewer data.
- A downloaded website draft is untrusted input. The local configuration gateway validates it, stages it as a protected draft, and requires local creator approval before commit.
- Live-impacting actions, restarts, Streamer.bot administration, reward administration, and broadcast controls remain local-only.

## Pairing endpoints

### `POST /api/streambridge/pairing/start`

Request:

```json
{
  "deviceId": "local-random-uuid",
  "version": "4.0.1",
  "challenge": "base64url-sha256-verifier",
  "challengeMethod": "S256"
}
```

Response:

```json
{
  "pairingId": "opaque-server-id",
  "userCode": "ABCD-EFGH",
  "verificationUrl": "https://www.slothbloom.com/tools/streambridge/pair#code=ABCD-EFGH",
  "expiresAt": "2026-08-18T20:15:00.000Z",
  "pollAfterSeconds": 3
}
```

Codes must expire within 15 minutes, be single-use, be rate limited by IP and device ID, and store only the SHA-256 challenge until claimed.

### `POST /api/streambridge/pairing/check`

Request:

```json
{
  "deviceId": "local-random-uuid",
  "pairingId": "opaque-server-id",
  "verifier": "base64url-random-verifier"
}
```

Pending response:

```json
{
  "state": "pending",
  "expiresAt": "2026-08-18T20:15:00.000Z"
}
```

Successful response:

```json
{
  "state": "paired",
  "accessToken": "opaque-256-bit-device-token",
  "dashboardUrl": "https://www.slothbloom.com/tools/streambridge",
  "pairedAt": "2026-08-18T20:08:00.000Z"
}
```

The service verifies the S256 challenge, invalidates the pairing code, stores only a hash of the device token, and returns the token once.

### `POST /api/streambridge/pairing/revoke`

Uses `Authorization: Bearer <device-token>` with `{ "deviceId": "..." }`. Revocation is idempotent. The Bridge deletes its local credential even if the website is temporarily unavailable.

## Configuration synchronization

### `PUT /api/streambridge/device/configuration`

The paired Bridge sends its safe Wizard export with `Authorization: Bearer <device-token>` and `X-THSV-Device-ID`. The website accepts at most 256 KB and stores the current portable copy for that paired device. The response includes only `saved` and `savedAt`; credentials are never reflected.

### `GET /api/streambridge/device/draft`

The paired Bridge uses the same device headers to fetch a website draft. `204 No Content` means no draft is waiting. A draft contains an immutable UUID revision, creation and expiry timestamps, and the portable configuration. Drafts expire after 30 days.

### `GET|PUT /api/streambridge/dashboard`

The paired browser uses an essential HttpOnly, SameSite=Strict session cookie. `GET` returns only the device summary, portable configuration, and current draft. `PUT` validates and saves a new draft; it cannot commit local settings or invoke Streamer.bot.

The Bridge never opens an inbound port. A local **Review website draft** action imports the selected revision into the existing protected-draft workflow. An existing local draft blocks website staging, and conflicts never overwrite it. The creator must still choose **Save with backup** locally.

The website editor should expose only portable settings. Machine-specific setup remains in the local Wizard.

## Website storage and session model

The production MVP uses durable Upstash Redis records and a device-linked browser session rather than a permanent secret URL. Device and editor credentials are stored as SHA-256 hashes; the only raw device credential remains in the local private StreamBridge state file, and the raw editor credential remains in the browser's HttpOnly cookie. Pairing codes expire after ten minutes and are single-use. A future SlothBloom account system can adopt paired devices without changing the outbound-only local protocol.
