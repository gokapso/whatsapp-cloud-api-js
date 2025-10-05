# @kapso/whatsapp-cloud-api

TypeScript client for the WhatsApp Business Cloud API, with first‑class support for Kapso’s Meta proxy. Ships Zod‑validated builders for messages, templates, media, and phone‑number flows, plus webhook signature verification.

## Features
- Configurable base URL and auth: direct Meta Graph or Kapso proxy
- Messages: text, media, location, contacts, reaction, templates, and rich interactive helpers (buttons, lists, products, flows, address, location request, call permission)
- Templates: creation (strict validation for header/body/footer/buttons), send‑time parameter builders
- Media: upload/get/delete
- Phone numbers: request/verify code, register/deregister; settings and business profile
- Webhooks: X‑Hub‑Signature‑256 verification helper
- Modern build (ESM+CJS), TypeScript types, Zod validation

## Install

```bash
npm install @kapso/whatsapp-cloud-api zod
```

## Quick Start

```ts
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const client = new WhatsAppClient({
  accessToken: process.env.WHATSAPP_TOKEN!,
  // or route via Kapso proxy:
  // baseUrl: "https://app.kapso.ai/api/meta",
  // kapsoApiKey: process.env.KAPSO_API_KEY,
});

await client.messages.sendText({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  body: "Hello from Kapso",
});
```

## Kapso Proxy

To use Kapso’s proxy, set the client base URL and API key:

```ts
const client = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});
```

Notes:
- Media GET/DELETE requires `phone_number_id` query on the proxy.
- You can also pass a bearer `accessToken` instead of `kapsoApiKey` if you’ve stored a token with Kapso.

## Templates

### Create (strict Zod validation)

```ts
import { TemplateDefinition } from "@kapso/whatsapp-cloud-api";

const templateDefinition = TemplateDefinition.buildTemplateDefinition({
  name: "seasonal_promo",
  language: "en_US",
  category: "MARKETING",
  components: [
    { type: "HEADER", format: "TEXT", text: "Our {{1}} is on!", example: { header_text: ["Summer Sale"] } },
    { type: "BODY", text: "Shop now through {{1}} using code {{2}}", example: { body_text: [["Aug 31", "SALE25"]] } },
    { type: "FOOTER", text: "Tap a button below" },
    { type: "BUTTONS", buttons: [ { type: "QUICK_REPLY", text: "Unsubscribe" }, { type: "URL", text: "Shop", url: "https://store.example/promo" } ] }
  ],
});

await client.templates.create({
  businessAccountId: "<WABA_ID>",
  name: templateDefinition.name,
  language: templateDefinition.language,
  category: templateDefinition.category,
  components: templateDefinition.components,
});
```

### Send a template

```ts
import { buildTemplateSendPayload } from "@kapso/whatsapp-cloud-api";

const templatePayload = buildTemplateSendPayload({
  name: "seasonal_promo",
  language: "en_US",
  header: { type: "image", image: { link: "https://cdn.example/banner.jpg" } },
  body: [ { type: "text", text: "Aug 31" }, { type: "text", text: "SALE25" } ],
  buttons: [ { type: "button", sub_type: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "STOP" }] } ],
});

await client.messages.sendTemplate({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  template: templatePayload,
});
```

## Media

```ts
const imageBlob = new Blob([/* binary data */], { type: "image/png" });
await client.media.upload({ phoneNumberId: "<PHONE_NUMBER_ID>", type: "image", file: imageBlob, fileName: "photo.png" });
const metadata = await client.media.get({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>" }); // Kapso requires phone_number_id
await client.media.delete({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>" });
```

## Phone Numbers

```ts
await client.phoneNumbers.requestCode({ phoneNumberId: "<PHONE_NUMBER_ID>", codeMethod: "SMS", language: "en_US" });
await client.phoneNumbers.verifyCode({ phoneNumberId: "<PHONE_NUMBER_ID>", code: "123456" });
await client.phoneNumbers.register({ phoneNumberId: "<PHONE_NUMBER_ID>", pin: "000111" });
await client.phoneNumbers.settings.update({ phoneNumberId: "<PHONE_NUMBER_ID>", fallback_language: "en_US" });
await client.phoneNumbers.businessProfile.update({ phoneNumberId: "<PHONE_NUMBER_ID>", about: "My Shop", websites: ["https://example.com"] });
```

## Webhooks

```ts
import { verifySignature } from "@kapso/whatsapp-cloud-api";

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifySignature({
    appSecret: process.env.META_APP_SECRET!,
    rawBody: req.body, // Buffer
    signatureHeader: req.headers["x-hub-signature-256"] as string,
  });
  if (!ok) return res.status(401).end();

  const payload = JSON.parse(req.body.toString("utf8"));
  // handle payload.entry[0].changes[...] etc.
  res.sendStatus(200);
});
```

## Typed Responses

- All helpers return typed payloads (e.g., `SendMessageResponse`, `MediaUploadResponse`, etc.).
- You can also call the low-level client with typing:

```ts
const res = await client.request<MyType>("GET", "<path>", { responseType: "json" });
```

## Runtime & Compatibility

- Requires Node.js 20.19+ or any environment with WHATWG `fetch`/`FormData` globals.
- ESM and CJS builds are provided. The package is side-effect free and supports tree-shaking.

## Error Handling

When a response is not OK, the client throws an `Error` whose message includes the HTTP status and response text, e.g.:

```
Meta API request failed with status 400: {"error":{...}}
```

## License

MIT
