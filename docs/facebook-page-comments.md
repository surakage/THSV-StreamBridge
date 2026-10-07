# Facebook Page live comments (experimental)

This first implementation connects a creator-owned Meta app and Page to the existing StreamBridge multichat pipeline. It supports read-only collection, aggregate milestone alerts, and opt-in timed Page comments; it is not yet an accepted public Facebook integration. Live provider acceptance and current Meta permission/version requirements remain to be confirmed with an authorized Page.

## Creator setup

1. Unlock the local wizard and open Platforms → Facebook Page live comments.
2. Use your Meta app to obtain an access token for the Page you administer. Enter the Page ID, the Graph API version supported by your app, and the Page access token in the wizard's password field. A username lookup is attempted if a numeric ID is not supplied; use the numeric Page ID if that lookup is unavailable.
3. Verify and save. The connection checks that the token belongs to the selected Page and can list its live broadcasts. Saving leaves collection disabled.
4. During a live broadcast, choose Test read access to confirm live-comment access. The test does not publish comments or invoke commands.
5. Enable live comments, then post a new comment after the first poll. The initial batch is a baseline, so old comments do not execute as new commands.

Do not paste credentials into support chats. The wizard clears its token field after submission, stores a Windows DPAPI-encrypted credential under the preserved data root, and never returns the token in connection status. The token must be reauthorized after expiry, revocation, or transfer to another Windows account. Meta documentation is linked from the connection card; the initial API version is editable rather than inferred from the install date.

## Supported behavior and limits

- Live text comments use `chat.message`, stable Page/comment event IDs, existing deduplication, filtering, multichat projection, and the current landscape/vertical chat overlays.
- No moderator/subscriber role is inferred. Missing commenter IDs are marked unverified, and no synthetic IDs are manufactured.
- The renderer uses a muted Facebook blue while retaining shared layout and transparency settings.
- Aggregate follower and Page-like milestones are supported; existing totals are baselined and high-water totals persist. Enable the desired metrics and interval under Platforms. The Alerts editor provides Facebook milestone styling in the existing themed overlay.
- Timed comments are separately opt-in. Authorize `pages_manage_engagement`, enable collection and timed output, and select Facebook on an existing timed-message action. Exactly one active Page broadcast is required. Simulated tests cannot publish; stale runs and uncertain writes are not replayed. Failures appear under Diagnostics → output status.
- Timed output resolves the active LiveVideo's associated `video.id` and publishes to that Video's `/comments` edge. The broadcast control ID is not used as the posting target. A missing associated Video ID blocks posting; the target is rediscovered on every send so ended broadcasts are not selected.
- No named Facebook follows, Stars, subscriptions, redemptions, moderation mutations, or automatic replies are implemented. Existing add-ons with a platform allowlist may not accept Facebook yet.
- Polling reads the latest 100 comments every five seconds while live, and checks less often when offline. Very busy broadcasts can exceed this bound. Pagination and high-volume acceptance are required before a general production release.
- Authorization failures stop retries until the creator reconnects. Other failures retry with bounded backoff. Provider error text and access tokens are not logged.

## Distribution work still required

A universal release must complete provider acceptance against current Meta documentation, pagination/load testing, setup migration and installer rehearsal, and supported-feature capability declarations. A public Connect Facebook button additionally needs an appropriate reviewed Meta app and a maintained authorization flow; an application secret must never be embedded in the downloadable desktop package. The current wizard supports creator-owned app tokens so this flow can be exercised locally first.

TikFinity is now a first-class optional launcher application: discovery, exact executable selection, saved startup toggle, crash pause, and the existing startup summary. Settings stay under the preserved data root. Unconfigured apps are skipped; enabled apps with missing executables warn while other apps continue.
