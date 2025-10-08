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
- Historical data (Kapso proxy): conversations, message history, contacts, and call logs with Meta-compatible payloads and Graph cursor pagination
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
- `client.contacts` — list/get/update contacts, with `customerId` filter
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
- Responses mirror Meta’s Cloud API message schema. Kapso-only enrichments live under the `kapso` key; use the `fields` parameter (for example `fields: "kapso(flow_response,flow_token)"`) to opt into specific fields or `fields: "kapso()"` to omit them entirely.
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
  limit: 50
});

const conversation = await client.conversations.get({ conversationId: conversations.data[0].id });
await client.conversations.updateStatus({ conversationId: conversation.id, status: "ended" });

// Message history
const history = await client.messages.query({
  phoneNumberId: "647015955153740",
  direction: "inbound",
  since: "2025-01-01T00:00:00Z",
  limit: 50,
  after: conversations.paging.cursors.after
});

// Contacts
const contacts = await client.contacts.list({ phoneNumberId: "647015955153740", customerId: "123" });
await client.contacts.update({
  phoneNumberId: "647015955153740",
  waId: contacts.data[0].waId,
  metadata: { tags: ["vip"], source: "import" }
});

// Call logs
const calls = await client.calls.list({ phoneNumberId: "647015955153740", direction: "INBOUND", limit: 20 });
const call = await client.calls.get({ phoneNumberId: "647015955153740", callId: calls.data[0].id });
```

All history endpoints return Meta-compatible records with Graph paging:

- `page.data` (camelCased) mirrors Meta’s message/contact/conversation/call schema.
- `page.paging` exposes `cursors.before` / `cursors.after` plus `next` / `previous` URLs when present.
- Supply `fields: buildKapsoFields()` (or the string `"kapso(default)"`) to include all Kapso extensions, or pass your own subset such as `fields: "kapso(flow_response,flow_token)"`. Use `fields: "kapso()"` to omit Kapso extras entirely.
- Tip: `buildKapsoFields` is exported from the SDK, so you can `import { buildKapsoFields } from "@kapso/whatsapp-cloud-api";` and drop it straight into your queries.

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

### Receiving media (URL‑first, with bytes fallback)

Common cases:

1) URL‑first with Kapso

Kapso stores inbound media and now also mirrors outbound media shortly after send. Ask for `kapso(media_url)` when listing messages and render the URL directly (SSR‑friendly).

```ts
import { buildKapsoMessageFields } from "@kapso/whatsapp-cloud-api";

const fields = buildKapsoMessageFields("media_url");
const page = await client.messages.listByConversation({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  conversationId: "<CONVERSATION_ID>",
  fields
});

const msg = page.data.find(m => m.type === "image");
const src = msg?.kapso?.mediaUrl ?? msg?.image?.link; // use direct URL when present
```

2) Bytes fallback (universal)

If you need the raw bytes or the URL has not been mirrored yet, use `download()`. The SDK automatically skips auth headers for public WhatsApp CDNs and uses them for Kapso hosts.

Key points:
- `client.media.download({ mediaId, ... })` resolves the short‑lived URL via `media.get()` then fetches the bytes.
- Return types: default `ArrayBuffer`, `as: "blob"` → `Blob`, `as: "response"` → `Response`.
- Direct Meta: `phoneNumberId` is not required.
- Kapso proxy: pass `phoneNumberId`.

Examples:

```ts
// 1) From a message record you loaded (e.g., via client.messages.query):
const { data } = await client.messages.query({ phoneNumberId: "<PHONE_NUMBER_ID>", limit: 1 });
const msg = data[0];

if (msg.type === "image" && msg.image?.id) {
  const mediaId = msg.image.id;
  const bytes = await client.media.download({ mediaId, phoneNumberId: "<PHONE_NUMBER_ID>" });
  // bytes is an ArrayBuffer; do what you need with it
}
```

Node (save to file):

```ts
import { writeFile } from "node:fs/promises";

const buf = Buffer.from(await client.media.download({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>" }) as ArrayBuffer);
await writeFile("./downloaded.jpg", buf);
```

Browser (show as image):

```ts
const blob = await client.media.download({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>", as: "blob" });
const url = URL.createObjectURL(blob);
document.querySelector("img#preview")!.setAttribute("src", url);
```

Pass custom headers (if needed):

```ts
await client.media.download({
  mediaId: "<MEDIA_ID>",
  phoneNumberId: "<PHONE_NUMBER_ID>",
  headers: { "User-Agent": "curl/7.64.1" }
});
```

Webhook → download flow (Express, simplified):

```ts
import express from "express";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { normalizeWebhook, verifySignature } from "@kapso/whatsapp-cloud-api/server";

const app = express();
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!verifySignature({ appSecret: process.env.META_APP_SECRET!, rawBody: req.body, signatureHeader: req.headers["x-hub-signature-256"] as string })) {
    return res.status(401).end();
  }

  const payload = JSON.parse(req.body.toString("utf8"));
  const events = normalizeWebhook(payload);

  for (const message of events.messages) {
    if (message.image?.id) {
      // ... download media, persist, etc.
    }
  }

  const client = new WhatsAppClient({
    // Use accessToken for Meta direct OR kapsoApiKey + baseUrl for Kapso proxy
    accessToken: process.env.META_ACCESS_TOKEN,
    // baseUrl: "https://app.kapso.ai/api/meta", kapsoApiKey: process.env.KAPSO_API_KEY
  });

  // If you obtained a mediaId from the event:
  // const bytes = await client.media.download({ mediaId, phoneNumberId: "<PHONE_NUMBER_ID>" });
  res.sendStatus(200);
});
```

Tips:
- Don’t store or display the URL returned by `media.get()` directly; it expires quickly. Always download bytes or re‑resolve as needed.
- Prefer storing your own durable URL (e.g., upload the bytes to your storage) or cache the bytes.
- For videos/documents, the same `download()` helper applies; check the `mimeType` returned by `media.get()` or `Response.headers` when deciding how to render.

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
import express from "express";
import { normalizeWebhook, verifySignature } from "@kapso/whatsapp-cloud-api/server";

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifySignature({
    appSecret: process.env.META_APP_SECRET!,
    rawBody: req.body,
    signatureHeader: req.headers["x-hub-signature-256"] as string,
  });
  if (!ok) return res.status(401).end();

  const payload = JSON.parse(req.body.toString("utf8"));
  const events = normalizeWebhook(payload);

  events.messages.forEach((message) => {
    // message matches the same shape returned by client.messages.query()
  });

  events.statuses.forEach((status) => {
    // handle delivery receipts
  });

  events.calls.forEach((call) => {
    // handle calling events
  });

  res.sendStatus(200);
});

// events.contacts contains the contact array from the webhook, already camelCased
```

`normalizeWebhook()` unwraps the raw Graph payload, returning `{ messages, statuses, calls, contacts }` with camelCased fields so webhook events and history queries share the same Meta-compatible structure. Each normalized message also gets `kapso.direction` (`"inbound"`/`"outbound"`) and SMB echoes are tagged with `kapso.source = "smb_message_echo"` so you can tell when the business initiated a message. All other webhook `field` payloads are exposed under `events.raw.<fieldName>` (camelCased), so you can react to updates like `accountAlerts`, `templateCategoryUpdate`, etc., without additional parsing.

## Raw fetch helper

Use `client.fetch(url, init?)` to make a request to any absolute URL with the client’s auth headers applied. Most users do not need this for media anymore because `media.download()` handles header policy automatically.

```ts
// Sends Authorization (Meta) or X-API-Key (Kapso) automatically
const resp = await client.fetch("https://files.example/resource", { headers: { Accept: "image/*" } });
```

### Framework notes

- Next.js / Remix / SvelteKit: import from `@kapso/whatsapp-cloud-api/server` only inside API routes or server actions. Do not import the server subpath in client components.
- Cloudflare Workers / Vercel Edge / Workers-like runtimes: use only the universal entry; server subpath relies on Node `crypto`.

## Typed responses

- All helpers return typed payloads (e.g., `SendMessageResponse`, `MediaUploadResponse`, etc.).
- You can also call the low-level client with typing:

```ts
const response = await client.request<MyType>("GET", "<path>", { responseType: "json" });
```

## Runtime & Compatibility

- Universal entry has no Node builtins and works in Node 20.19+, browsers, and edge runtimes that provide WHATWG `fetch`/`FormData`.
- Server subpath (`/server`) targets Node.js and imports Node builtins (e.g., `node:crypto`). Use it only on the server.
- ESM and CJS builds are provided. The package is side‑effect free and supports tree‑shaking.

## Migration

If you previously imported `verifySignature` from the package root, update to the server subpath:

```diff
- import { verifySignature } from "@kapso/whatsapp-cloud-api"
+ import { verifySignature } from "@kapso/whatsapp-cloud-api/server"
```

## Error handling

When a response is not OK, the client throws an `Error` whose message includes the HTTP status and response text, e.g.:

```
Meta API request failed with status 400: {"error":{...}}
```

## License

MIT
