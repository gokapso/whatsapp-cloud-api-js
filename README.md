# WhatsApp Cloud API TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@kapso/whatsapp-cloud-api.svg)](https://www.npmjs.com/package/@kapso/whatsapp-cloud-api)
[![npm downloads](https://img.shields.io/npm/dm/@kapso/whatsapp-cloud-api.svg)](https://www.npmjs.com/package/@kapso/whatsapp-cloud-api)

TypeScript client for the WhatsApp Business Cloud API. It provides typed request/response models, Zod‑validated builders for messages and templates, media helpers, phone‑number flows, and webhook signature verification.

Optionally, you can route your calls through [Kapso](https://kapso.ai/)’s proxy by changing the `baseUrl` and auth header.

## Choose your setup

1. **Meta setup (~ 1 hour)** – Create a Meta WhatsApp app, generate a system or business token, and link a WhatsApp Business phone number in Meta Business Manager.
2. **Kapso proxy (~ 2 minutes)** – Have Kapso provision and connect a WhatsApp number for you, then use your Kapso API key and base URL to begin sending immediately.

## Install

```bash
npm install @kapso/whatsapp-cloud-api
```

## Quick start

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

## Features
- Configurable base URL and auth: direct Meta Graph or Kapso proxy
- Messages: text, media, location, contacts, reaction, templates, and rich interactive helpers (buttons, lists, products, flows, address, location request, call permission)
- Templates: creation (strict validation for header/body/footer/buttons), send‑time parameter builders
- Media: upload/get/delete
- Phone numbers: request/verify code, register/deregister; settings and business profile
- Historical data (Kapso proxy): conversations, message history, contacts, and call logs
- Webhooks: X‑Hub‑Signature‑256 verification helper
- Modern build (ESM+CJS), TypeScript types, Zod validation

## API surface

### Core

- `client.messages` — send text/media/interactive/templates and mark messages as read
- `client.templates` — list/create/delete templates on your WABA
- `client.media` — upload media, fetch metadata, delete media
- `client.phoneNumbers` — request/verify code, register/deregister, settings, business profile
- `verifySignature` — verify webhook signatures (app secret)
- `TemplateDefinition` — strict template creation builders
- `buildTemplateSendPayload` — build send-time template payloads

### Kapso proxy extras
 Requires `baseUrl` and `kapsoApiKey`.

- `client.conversations` — list/get/update conversations across your project
- `client.messages.query` / `listByConversation` — pull stored message history
- `client.contacts` — list/get/update contacts, with `customerId` or `hasCustomer` filters
- `client.calls` — initiate calls plus historic call logs (`list`/`get`) and permission helpers

## Using the Kapso Proxy

To use Kapso’s proxy, set the client base URL and API key:

```ts
const client = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});
```

Notes:
- Media GET/DELETE requires `phoneNumberId` query on the proxy.
- You can also pass a bearer `accessToken` instead of `kapsoApiKey` if you’ve stored a token with Kapso.

### Why Kapso?

- Get a WhatsApp API for your number in ~2 minutes.
- Built‑in inbox for your team.
- Query conversations and messages.
- Automatic backup to Supabase.
- Webhooks for critical events: message received, message sent, conversation inactive, and more.
- Provision US phone numbers for WhatsApp (works globally).
- Multi‑tenant by design — onboard thousands of customers safely.
- And more.

## Sending messages

Below are concise examples for common message types. Assume `client` is created as shown above.

### Image

By media ID:
```ts
await client.messages.sendImage({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  image: { id: "<MEDIA_ID>", caption: "Check this out" }
});
```

By link:
```ts
await client.messages.sendImage({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  image: { link: "https://example.com/photo.jpg", caption: "Photo" }
});
```

### Document
```ts
await client.messages.sendDocument({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  document: { link: "https://example.com/invoice.pdf", filename: "invoice.pdf", caption: "Invoice" }
});
```

### Video
```ts
await client.messages.sendVideo({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  video: { link: "https://example.com/clip.mp4", caption: "Clip" }
});
```

### Sticker
```ts
await client.messages.sendSticker({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  sticker: { id: "<MEDIA_ID>" }
});
```

### Location
```ts
await client.messages.sendLocation({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  location: { latitude: -33.45, longitude: -70.66, name: "Santiago", address: "CL" }
});
```

### Contacts
```ts
await client.messages.sendContacts({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  contacts: [
    { name: { formattedName: "John Doe" }, phones: [{ phone: "+15551234567", type: "WORK" }] }
  ]
});
```

### Reaction
```ts
await client.messages.sendReaction({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  reaction: { messageId: "wamid......", emoji: "😀" }
});
```

### Mark read & typing indicator
```ts
await client.messages.markRead({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  messageId: "wamid......",
  typingIndicator: { type: "text" }
});
```

### Interactive buttons
```ts
await client.messages.sendInteractiveButtons({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  header: { type: "text", text: "Header" },
  bodyText: "Pick an option",
  footerText: "Footer",
  buttons: [ { id: "accept", title: "Accept" }, { id: "decline", title: "Decline" } ]
});
```

## Query history & contacts

When you point the client to Kapso’s proxy (`baseUrl: "https://app.kapso.ai/api/meta"` plus `kapsoApiKey`), you can query stored data in addition to sending messages.

```ts
const client = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});

// Conversations
const conversations = await client.conversations.list({
  phoneNumberId: "647015955153740",
  status: "active",
  perPage: 50
});

const conversation = await client.conversations.get({ conversationId: conversations.data[0].id });
await client.conversations.updateStatus({ conversationId: conversation.id, status: "ended" });

// Message history
const history = await client.messages.query({
  phoneNumberId: "647015955153740",
  direction: "inbound",
  since: "2025-01-01T00:00:00Z"
});

// Contacts
const contacts = await client.contacts.list({ phoneNumberId: "647015955153740", customerId: "123" });
await client.contacts.update({
  phoneNumberId: "647015955153740",
  waId: contacts.data[0].waId,
  metadata: { tags: ["vip"], source: "import" }
});

// Call logs
const calls = await client.calls.list({ phoneNumberId: "647015955153740", direction: "INBOUND", perPage: 20 });
const call = await client.calls.get({ phoneNumberId: "647015955153740", callId: calls.data[0].id });
```

## Templates

### Create

```ts
import { TemplateDefinition } from "@kapso/whatsapp-cloud-api";

const templateDefinition = TemplateDefinition.buildTemplateDefinition({
  name: "seasonal_promo",
  language: "en_US",
  category: "MARKETING",
  components: [
    { type: "HEADER", format: "TEXT", text: "Our {{1}} is on!", example: { headerText: ["Summer Sale"] } },
    { type: "BODY", text: "Shop now through {{1}} using code {{2}}", example: { bodyText: [["Aug 31", "SALE25"]] } },
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
  buttons: [ { type: "button", subType: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "STOP" }] } ],
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
const metadata = await client.media.get({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>" }); // Kapso requires phoneNumberId
await client.media.delete({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>" });
```

## Phone numbers

```ts
await client.phoneNumbers.requestCode({ phoneNumberId: "<PHONE_NUMBER_ID>", codeMethod: "SMS", language: "en_US" });
await client.phoneNumbers.verifyCode({ phoneNumberId: "<PHONE_NUMBER_ID>", code: "123456" });
await client.phoneNumbers.register({ phoneNumberId: "<PHONE_NUMBER_ID>", pin: "000111" });
await client.phoneNumbers.settings.update({ phoneNumberId: "<PHONE_NUMBER_ID>", fallbackLanguage: "en_US" });
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

## Typed responses

- All helpers return typed payloads (e.g., `SendMessageResponse`, `MediaUploadResponse`, etc.).
- You can also call the low-level client with typing:

```ts
const response = await client.request<MyType>("GET", "<path>", { responseType: "json" });
```

## Runtime & Compatibility

- Requires Node.js 20.19+ or any environment with WHATWG `fetch`/`FormData` globals.
- ESM and CJS builds are provided. The package is side-effect free and supports tree-shaking.

## Error handling

When a response is not OK, the client throws an `Error` whose message includes the HTTP status and response text, e.g.:

```
Meta API request failed with status 400: {"error":{...}}
```

## License

MIT
