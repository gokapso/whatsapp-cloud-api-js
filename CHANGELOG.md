# Changelog

## 0.0.3 — 2025-10-07

- Split server-only helper into subpath export: `@kapso/whatsapp-cloud-api/server`.
- Universal root entry no longer imports Node builtins (improves browser/edge bundling).
- Updated README with import paths, framework notes, and migration steps.
- Added tests validating the split and server subpath export.

Migration:
- If you previously imported `verifySignature` from the root, update to the server subpath:

```diff
- import { verifySignature } from "@kapso/whatsapp-cloud-api"
+ import { verifySignature } from "@kapso/whatsapp-cloud-api/server"
```

