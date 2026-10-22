# WhatsApp Flows with `@kapso/whatsapp-cloud-api`

This guide walks through the full developer workflow for WhatsApp Flows using the SDK — from authoring Flow JSON in camelCase to deploying, previewing, and serving Data Endpoint callbacks.

## Why code-first flows?

- **CamelCase authoring:** Write JSON in idiomatic TS/JS; the SDK converts to Meta’s mixed casing automatically.
- **Lifecycle helpers:** `client.flows.create/updateAsset/publish/deploy/preview/get/list` mirror the Graph API.
- **DX-focused validation:** Meta errors come back camelized with hints when casing mistakes occur.
- **Server utilities:** `receiveFlowEvent` and `respondToFlow` handle native Meta callback encryption and camelCase normalization. `downloadFlowMedia` separately handles PhotoPicker/DocumentPicker media encryption/HMAC.

## 1. Author Flow JSON (camelCase)

Create a file such as `flows/csat.flow.ts`:

```ts
export default {
  version: "7.2",
  screens: [
    {
      id: "CSAT",
      title: "How was your experience?",
      terminal: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "RadioButtonsGroup",
            name: "rating",
            label: "Rate us",
            required: true,
            dataSource: [
              { id: "up", title: "👍 Great" },
              { id: "down", title: "👎 Not great" }
            ]
          },
          {
            type: "Footer",
            label: "Submit",
            onClickAction: {
              name: "complete",
              payload: { rating: "${form.rating}" }
            }
          }
        ]
      }
    }
  ]
} as const;
```

> ✅ Use camelCase everywhere. The SDK maps keys like `onClickAction`, `dataSource`, `maxUploadedPhotos`, etc., to Meta’s `on-click-action`, `data-source`, `max-uploaded-photos` on upload.

### Validation tips

- `client.flows.create/updateAsset/deploy` surface Meta validation errors with camelCase pointers and DX hints when common casing mistakes occur.
- `toFlowJsonWireCase(flow, { strictCamel: false })` is available if you need to ingest legacy snake-case JSON temporarily.

## 2. Deploy & preview

Use the client to upload Flow JSON, optionally publish, and fetch a preview URL. The deploy helper is idempotent: it skips asset uploads when the content hash hasn’t changed.

```ts
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import csatFlow from "./flows/csat.flow";

const client = new WhatsAppClient({ accessToken: process.env.WHATSAPP_TOKEN! });

const result = await client.flows.deploy(csatFlow, {
  wabaId: process.env.WABA_ID!,
  name: "csat-flow",
  publish: true,
  preview: true, // or { interactive: true, params: { flowAction: "navigate" } }
});

console.log("Flow ID:", result.flowId);
console.log("Preview URL:", result.previewUrl);
console.log("Validation errors:", result.validationErrors);
```

## 3. Send Flow messages

Use `client.messages.sendInteractiveFlow` (typed with `FlowInteractiveInput`) to trigger your flow. `flowCta` is required; `flowMessageVersion` defaults to `"3"` when omitted. Meta treats an omitted `mode` as `"published"`, so pass `mode: "draft"` when testing an unpublished Flow.

```ts
import { WhatsAppClient, type FlowInteractiveInput } from "@kapso/whatsapp-cloud-api";

const client = new WhatsAppClient({ accessToken: process.env.WHATSAPP_TOKEN! });

const message: FlowInteractiveInput = {
  phoneNumberId: "1234567890",
  to: "+15551234567",
  bodyText: "Check out our new experience",
  parameters: {
    flowId: "1234567890",
    flowCta: "Open",
    mode: "draft",
    flowToken: "token123",
    flowAction: "navigate",
    flowActionPayload: { screen: "WELCOME" }
  }
};

await client.messages.sendInteractiveFlow(message);
```

Other lifecycle helpers:

```ts
await client.flows.create({ wabaId, name, flowJson, publish: false });
await client.flows.updateAsset({ flowId, json: flowJson });
await client.flows.publish({ flowId });
await client.flows.list({ wabaId, limit: 20 });
```

## 4. Handle Data Endpoint requests

Native callbacks use `encrypted_aes_key`, `encrypted_flow_data`, and `initial_vector`. The Node.js server helper verifies `X-Hub-Signature-256` over the original request bytes, decrypts the AES key with RSA-OAEP/SHA-256, and authenticates the payload with AES-128-GCM. Pass the returned context to `respondToFlow` to encrypt the response using the same AES key and inverted IV, as required by [Meta's official endpoint sample](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/basic/src/encryption.js).

Configure the matching Flow private key and Meta app secret on your server. Provide `verifyToken` to validate the decrypted token against your application's trusted session store, including number/user binding and expiration. Encryption and a valid Meta signature do not authorize business actions. Health-check `ping` callbacks do not carry a token; they are signature-verified and returned as `ctx.action === "PING"`.

```ts
import express from "express";
import { receiveFlowEvent, respondToFlow, FlowServerError } from "@kapso/whatsapp-cloud-api/server";
import { authenticateFlowToken } from "./your-flow-session-store";

const app = express();
app.post("/flows/csat", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const ctx = await receiveFlowEvent({
      rawBody: req.body as Buffer,
      headers: req.headers,
      phoneNumberId: process.env.PHONE_ID!,
      appSecret: process.env.META_APP_SECRET!,
      getPrivateKey: async () => process.env.FLOW_PRIVATE_KEY_PEM!,
      verifyToken: authenticateFlowToken
    });
    const reply = ctx.action === "PING"
      ? respondToFlow({ context: ctx, data: { status: "active" } })
      : respondToFlow({ context: ctx, screen: "NEXT_SCREEN", data: {} });
    res.status(reply.status).set(reply.headers).send(reply.body);
  } catch (error) {
    if (error instanceof FlowServerError) {
      return res.status(error.status).set(error.headers).send(error.body);
    }
    res.status(500).send();
  }
});
```

Migration: plaintext input is rejected in the default Meta mode. An adapter that already authenticates and decrypts requests can explicitly pass `inputFormat: "decrypted"`; `verifyToken` is still required. This mode returns plaintext JSON responses. Do not expose it directly to untrusted callers. The old `encrypted_flow_data` plus `encryption_metadata` format was a media-envelope format and is no longer accepted as a callback. Media descriptors continue to work with `downloadFlowMedia` below.

The server helpers require Node.js crypto; they are not Edge-runtime helpers. Keep the original `ctx` object for the encrypted response. `respondToFlow` without a native callback context remains a JSON builder for trusted adapters. Unsupported actions and non-object input return 400; invalid signatures return 432; failed decryption returns 421; rejected tokens return an encrypted 427 response. Missing key/secret/token-verifier configuration returns 500.

## 5. Decrypt PhotoPicker/DocumentPicker media

Use `downloadFlowMedia` (alias for `downloadAndDecrypt`) to pull media from the CDN once your webhook receives the descriptor.

```ts
import { downloadFlowMedia } from "@kapso/whatsapp-cloud-api/server";

const media = await downloadFlowMedia({
  cdnUrl: descriptor.cdnUrl,
  encryptionMetadata: descriptor.encryptionMetadata,
});

// media is an ArrayBuffer — persist to storage, run validations, etc.
```

## 6. Validation errors & hints

When Meta returns validation errors, the SDK camelizes field names and pointer paths, and adds a hint when the fix is a casing issue:

```jsonc
[
  {
    "error": "INVALID_PROPERTY_VALUE",
    "errorType": "FLOW_JSON_ERROR",
    "message": "Invalid value for property",
    "pointers": [
      {
        "path": "screens[0].layout.children[0].on-click-action",
        "lineStart": 10,
        "columnStart": 5
      }
    ],
    "hint": "Use onClickAction (camelCase). We map it to on-click-action."
  }
]
```

Use these hints to fix your camelCase authoring quickly.

## 7. Local testing & iteration

- **Unit tests:** `npm test` covers case mapping, hashing, resource requests, and server helpers.
- **Manual integration (without publish):**
  - `npm run build`
  - `npm pack` → install the tarball in your app (`npm install ../@kapso-whatsapp-cloud-api-*.tgz`), or
  - `npm install file:../whatsapp-cloud-api-js` (with build artifacts), or
  - `npm link` for rapid iteration.
- **Preview flows locally:** use `client.flows.preview({ flowId, interactive: true })` to generate a URL you can share with stakeholders.

## 8. Checklist before production

- Flow JSON authored in camelCase (`dataApiVersion`, `routingModel`, `onClickAction`, etc.).
- Data Endpoint responds within 10 seconds (Meta timeout).
- Handle `FlowServerError` statuses: 421 (decrypt error), 432 (request signature), 427 (invalid flow token).
- Refresh Flow private key when rotating phone numbers.
- Log `ctx.action`, `ctx.screen`, and timing for observability (recommended).

## Additional references

- Meta docs: [Flow JSON reference](https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson) • [Flows API](https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi)
- Kapso docs: coming soon (stay tuned).

Have feedback? Open an issue or PR — the Flow DX is still evolving and we’d love your input.
