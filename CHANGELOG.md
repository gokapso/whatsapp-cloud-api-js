# Changelog

## Unreleased

### Fixed

- `messages.sendInteractiveLocationRequest` no longer sends `action.parameters.request_message`, which Meta rejects with `Unexpected key "request_message" on param "interactive.action.parameters"`. The request now matches Meta's documented shape, `action: { name: "send_location" }`, with `bodyText` as the only text. `parameters` is still accepted for compatibility but is deprecated and ignored.

## 0.4.0

Includes the call features merged after 0.3.0, together with the resource/media and Flow fixes listed below.

### Security and compatibility

- Resource requests stay within the configured API/version; media IDs must be identifiers rather than URLs or paths. Resource requests and all media downloads reject redirects. Direct low-level `client.fetch` and `client.rawFetch` retain their explicit absolute-URL behavior and require trusted destinations.
- Automatic Kapso media authentication matches `kapso.ai` and DNS subdomains, without matching lookalike suffixes. Media URLs must use HTTPS without embedded credentials.
- Media byte/Blob downloads throw `GraphApiError` on HTTP failures; `as: "response"` preserves the raw unsuccessful response for caller inspection.
- Native Meta Flow callbacks use RSA-OAEP/SHA-256 and AES-128-GCM, with exact raw-body signature verification and separate application token verification. Responses use the original callback context, inverted IV, and a single encryption per native context. Copied/unknown/used contexts fail closed.
- Native Flow integrations must configure `appSecret`, forward original request bytes and headers, provide the matching RSA private key and `verifyToken` for business actions, and pass the original context to `respondToFlow` once. Authorize the returned action before effects and enforce cross-delivery replay/idempotency in the application.
- Pre-decrypted adapters explicitly select `inputFormat: "decrypted"` and still validate tokens. The previous media-encryption envelope is not a supported native callback format. Server helpers require Node crypto.

### Added

- `messages.sendInteractiveVoiceCall` sends free-form call button messages (interactive `voice_call`). It validates `displayText` ≤ 20, `ttlMinutes` 1–43200 and `payload` ≤ 512, and accepts phone or BSUID recipients. Meta accepts it only inside a customer service or open conversation window.
- Template `voice_call` buttons: `TemplateDefinition` accepts `{ type: "voice_call" | "VOICE_CALL", text?, ttlMinutes? }` with the creation range 1440–43200. `buildVoiceCallTemplateButton`, `buildTemplateSendPayload` and `buildTemplatePayload` build the send-time `ttl_minutes` (1–43200) and `payload` (≤ 512) parameters.
- `buildCallDeepLink` builds `https://wa.me/call/<number>?biz_payload=<payload>` links with a percent-encoded payload. It makes no network calls. Meta does not support these links on WhatsApp desktop.
- `NormalizedCallEvent.ctaPayload` and `deeplinkPayload` type the tracking payloads that Meta returns on `connect` and `terminate` call webhooks (WhatsApp clients 2.25.27+).
- Native recording and transcription options on `calls.connect` and `calls.accept`, with BSUID support for call permission lookup.
- `calls.details` and `calls.fetchArtifact` for Kapso call details, artifact availability, recording playback, transcript previews, and original downloads.
- `kapsoAppBaseUrl` for custom Kapso app API origins and `GraphApiError.apiCode` for structured backend error codes.
- Server exports `verifyKapsoWebhookSignature` and `isCallArtifactEvent`, plus typed recording and transcription metadata in normalized call webhooks.
- `npm run typecheck`, also run by `npm test`, to check compile-time SDK contracts.

### Changed

- `TemplateButtonComponent` now includes `TemplateButtonVoiceCallComponent`. Exhaustive switches over `subType` need a `voice_call` case. `TemplateCarouselCardComponent` excludes it, and both builders reject `voice_call` inside carousel cards.

### Fixed

- `messages.sendTemplate` accepts results from both `buildTemplateSendPayload` and `buildTemplatePayload` without TypeScript casts, while continuing to accept raw Meta templates. Fixes [#11](https://github.com/gokapso/whatsapp-cloud-api-js/issues/11).
- Call webhook normalization preserves Meta call IDs, legacy `wacid` fields, BSUID identities, and artifact events across entries and changes.
- Call identity and artifact metadata types reflect nullable fields returned by Kapso.

### Usage notes

- Artifact helpers require a Kapso API key and use the Kapso local call UUID (`calls.get(...).id`), rather than the Meta `wacid`. Custom proxy hosts must configure a trusted HTTPS `kapsoAppBaseUrl` origin.
- Native capture is opt-in on connect/accept; `preAccept` rejects capture options.

- The supported minimum runtime remains Node.js 20.19. See the packaged `docs/flows.md` for Flow migration details.
