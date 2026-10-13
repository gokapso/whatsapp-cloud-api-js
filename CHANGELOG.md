# Changelog

## Unreleased

### Added

- `messages.sendInteractiveVoiceCall` sends free-form call button messages (interactive `voice_call`). It validates `displayText` ≤ 20, `ttlMinutes` 1–43200 and `payload` ≤ 512, and accepts phone or BSUID recipients. Meta accepts it only inside a customer service or open conversation window.
- Template `voice_call` buttons: `TemplateDefinition` accepts `{ type: "voice_call" | "VOICE_CALL", text?, ttlMinutes? }` with the creation range 1440–43200. `buildVoiceCallTemplateButton`, `buildTemplateSendPayload` and `buildTemplatePayload` build the send-time `ttl_minutes` (1–43200) and `payload` (≤ 512) parameters.
- `buildCallDeepLink` builds `https://wa.me/call/<number>?biz_payload=<payload>` links with a percent-encoded payload. It makes no network calls. Meta does not support these links on WhatsApp desktop.
- `NormalizedCallEvent.ctaPayload` and `deeplinkPayload` type the tracking payloads that Meta returns on `connect` and `terminate` call webhooks (WhatsApp clients 2.25.27+).

### Changed

- `TemplateButtonComponent` now includes `TemplateButtonVoiceCallComponent`. Exhaustive switches over `subType` need a `voice_call` case. `TemplateCarouselCardComponent` excludes it, and both builders reject `voice_call` inside carousel cards.

## 0.4.0

### Added

- Native recording and transcription options on `calls.connect` and `calls.accept`, with BSUID support for call permission lookup.
- `calls.details` and `calls.fetchArtifact` for Kapso call details, artifact availability, recording playback, transcript previews, and original downloads.
- `kapsoAppBaseUrl` for custom Kapso app API origins and `GraphApiError.apiCode` for structured backend error codes.
- Server exports `verifyKapsoWebhookSignature` and `isCallArtifactEvent`, plus typed recording and transcription metadata in normalized call webhooks.
- `npm run typecheck`, also run by `npm test`, to check compile-time SDK contracts.

### Fixed

- `messages.sendTemplate` accepts results from both `buildTemplateSendPayload` and `buildTemplatePayload` without TypeScript casts, while continuing to accept raw Meta templates. Fixes [#11](https://github.com/gokapso/whatsapp-cloud-api-js/issues/11).
- Call webhook normalization preserves Meta call IDs, legacy `wacid` fields, BSUID identities, and artifact events across entries and changes.
- Call identity and artifact metadata types reflect nullable fields returned by Kapso.

### Usage notes

- Artifact helpers require a Kapso API key and use the Kapso local call UUID (`calls.get(...).id`), rather than the Meta `wacid`. Custom proxy hosts must configure a trusted HTTPS `kapsoAppBaseUrl` origin.
- Native capture is opt-in on connect/accept; `preAccept` rejects capture options.
