# WhatsApp Flows with `@kapso/whatsapp-cloud-api`

This guide walks through the full developer workflow for WhatsApp Flows using the SDK — from authoring Flow JSON in camelCase to deploying, previewing, and serving Data Endpoint callbacks.

## Why code-first flows?

- **CamelCase authoring:** Write JSON in idiomatic TS/JS; the SDK converts to Meta’s mixed casing automatically.
- **Lifecycle helpers:** `client.flows.create/updateAsset/publish/deploy/preview/get/list` mirror the Graph API.
- **DX-focused validation:** Meta errors come back camelized with hints when casing mistakes occur.
- **Server utilities:** `receiveFlowEvent`, `respondToFlow`, and `downloadFlowMedia` handle encryption/HMAC, PhotoPicker/DocumentPicker payloads, and camelCase normalization.

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

Use `client.messages.sendInteractiveFlow` (typed with `FlowInteractiveInput`) to trigger your flow. `flowCta` is required; `flowMessageVersion` defaults to `"3"` when omitted.

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

When Meta calls your Data Endpoint, use `receiveFlowEvent` to decrypt the payload and normalize it to camelCase, and `respondToFlow` to send the next screen data.

### Express example

```ts
import express from "express";
import { receiveFlowEvent, respondToFlow } from "@kapso/whatsapp-cloud-api/server";

const app = express();
const phoneNumberId = process.env.PHONE_ID!;
const flowKey = process.env.FLOW_PRIVATE_KEY_PEM!;

app.post("/flows/csat", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const ctx = await receiveFlowEvent({
      rawBody: req.body as Buffer,
      phoneNumberId,
      getPrivateKey: async () => flowKey
    });

    if (ctx.action === "COMPLETE") {
      console.log("CSAT rating:", ctx.form.rating);
      const reply = respondToFlow({ screen: ctx.screen, data: {} });
      return res.status(reply.status).set(reply.headers).send(reply.body);
    }

    const reply = respondToFlow({ screen: ctx.screen, data: {} });
    res.status(reply.status).set(reply.headers).send(reply.body);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const flowError = error as any;
      return res.status(flowError.status).set(flowError.headers).send(flowError.body);
    }
    res.status(500).send({ error: "Unexpected error" });
  }
});
```

### Edge / standard Fetch handler

```ts
import { receiveFlowEvent, respondToFlow } from "@kapso/whatsapp-cloud-api/server";

export default async function handler(request: Request) {
  const buffer = new Uint8Array(await request.arrayBuffer());
  const ctx = await receiveFlowEvent({
    rawBody: buffer,
    phoneNumberId: process.env.PHONE_ID!,
    getPrivateKey: async () => process.env.FLOW_PRIVATE_KEY_PEM!
  });

  const reply = respondToFlow({ screen: ctx.screen, data: {} });
  return new Response(reply.body, { status: reply.status, headers: reply.headers });
}
```

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
- Handle `FlowServerError` statuses: 421 (decrypt error), 432 (signature/HMAC), 427 (invalid flow token).
- Refresh Flow private key when rotating phone numbers.
- Log `ctx.action`, `ctx.screen`, and timing for observability (recommended).

## Additional references

- Meta docs: [Flow JSON reference](https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson) • [Flows API](https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi)
- Kapso docs: coming soon (stay tuned).

Have feedback? Open an issue or PR — the Flow DX is still evolving and we’d love your input.
