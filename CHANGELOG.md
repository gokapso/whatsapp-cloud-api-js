# Changelog

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
