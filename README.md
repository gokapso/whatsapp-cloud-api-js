# `whatsapp-cloud-api-js`

[![npm version](https://img.shields.io/npm/v/@kapso/whatsapp-cloud-api.svg)](https://www.npmjs.com/package/@kapso/whatsapp-cloud-api)
[![npm downloads](https://img.shields.io/npm/dm/@kapso/whatsapp-cloud-api.svg)](https://www.npmjs.com/package/@kapso/whatsapp-cloud-api)

TypeScript client for the WhatsApp Cloud API.

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

## Choose your setup

1. **Meta setup (~ 1 hour)**

Create a Meta WhatsApp app, generate a system token, and link a WhatsApp Business phone number in Meta Business Manager.

2. **Kapso proxy (~ 2 minutes)**

Have [Kapso](https://kapso.ai/) provision and connect a WhatsApp number for you, then use your Kapso API key and base URL to begin sending immediately.

Query conversations, messages, contacts, and more.

## API surface

### Core

- [`client.messages`](#sending-messages) — send text/media/interactive/templates and mark messages as read
- [`client.templates`](#templates) — list/create/delete templates on your WABA
- [`client.media`](#sending-messages) — upload media, fetch metadata, delete media
- [`client.phoneNumbers`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/phone-numbers) — request/verify code, register/deregister, settings, business profile
- [`client.flows`](#flows) — author, validate, deploy, and preview WhatsApp Flows
- [`verifySignature`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/utilities#webhooks) — verify webhook signatures (app secret)
- `receiveFlowEvent`, `respondToFlow`, `downloadFlowMedia` — decrypt and respond to Flow callbacks
- [`TemplateDefinition`](#templates) — strict template creation builders
- [`buildTemplateSendPayload`](#typed-builder-optional) — build send-time template payloads
- [`buildTemplatePayload`](#build-with-components) — accept Meta-style raw `components` and normalize/camelize inputs

### Kapso proxy extras
 Requires `baseUrl` and `kapsoApiKey`.

- [`client.conversations`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/conversations) — list/get/update conversations across your project
- [`client.messages.query` / `listByConversation`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/messages) — pull stored message history
- [`client.contacts`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/contacts) — list/get/update contacts, with `customerId` filter
- [`client.calls`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/calls) — initiate calls plus historic call logs (`list`/`get`) and permission helpers
- [`Kapso Extensions`](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/kapso-extensions) — opt-in to extra fields via `fields=kapso(...)`

## Using the Kapso Proxy

To use Kapso’s proxy, set the client base URL and API key:

```ts
const client = new WhatsAppClient({
  baseUrl: "https://app.kapso.ai/api/meta",
  kapsoApiKey: process.env.KAPSO_API_KEY!,
});
```

### Why Kapso?

- Get a WhatsApp API for your number in ~2 minutes.
- Built‑in inbox for your team.
- Query conversations, messages and contacts.
- Automatic backup to Supabase.
- Webhooks for critical events: message received, message sent, conversation inactive, and more.
- Get a US phone number for WhatsApp (works globally).
- Multi‑tenant by design — onboard thousands of customers safely.
- And more.

Notes:
- Media GET/DELETE requires `phoneNumberId` query on the proxy.
- Responses mirror Meta’s Cloud API message schema.
- Kapso-only enrichments live under the `kapso` key; use the `fields` parameter (for example `fields: "kapso(flow_response,flow_token)"`) to opt into specific fields or `fields: "kapso()"` to omit them entirely.
- You can also pass a bearer `accessToken` instead of `kapsoApiKey` if you’ve stored a token with Kapso.

## Sending messages

Below are concise examples for common message types. Assume `client` is created as shown above.

### Text
```ts
await client.messages.sendText({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  body: "Hello!",
});
```

### Image

By media ID:
```ts
await client.messages.sendImage({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  image: { id: "<MEDIA_ID>", caption: "Check this out" },
});
```

By link:
```ts
await client.messages.sendImage({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  image: { link: "https://example.com/photo.jpg", caption: "Photo" },
});
```

### Document
```ts
await client.messages.sendDocument({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  document: { link: "https://example.com/invoice.pdf", filename: "invoice.pdf", caption: "Invoice" },
});
```

### Video
```ts
await client.messages.sendVideo({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  video: { link: "https://example.com/clip.mp4", caption: "Clip" },
});
```

### Sticker
```ts
await client.messages.sendSticker({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  sticker: { id: "<MEDIA_ID>" },
});
```

### Location
```ts
await client.messages.sendLocation({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  location: { latitude: -33.45, longitude: -70.66, name: "Santiago", address: "CL" },
});
```

### Contacts
```ts
await client.messages.sendContacts({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  contacts: [
    { name: { formattedName: "John Doe" }, phones: [{ phone: "+15551234567", type: "WORK" }] },
  ],
});
```

### Reaction
```ts
await client.messages.sendReaction({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  to: "+15551234567",
  reaction: { messageId: "wamid......", emoji: "😀" },
});
```

### Mark read & typing indicator
```ts
await client.messages.markRead({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  messageId: "wamid......",
  typingIndicator: { type: "text" },
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
  buttons: [ { id: "accept", title: "Accept" }, { id: "decline", title: "Decline" } ],
});
```

## Flows

Use `client.flows.deploy()` for idempotent deployments, or `create/updateAsset/publish/preview` for granular control. Server utilities (`receiveFlowEvent`, `respondToFlow`, `downloadFlowMedia`) handle Data Endpoint callbacks.

### Deploy a Flow

```ts
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const flowJson = {
  version: "7.2",
  screens: [
    {
      id: "CSAT",
      terminal: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "RadioButtonsGroup", name: "rating", label: "Rate us", dataSource: [
            { id: "up", title: "👍" },
            { id: "down", title: "👎" }
          ] },
          { type: "Footer", label: "Submit", onClickAction: { name: "complete", payload: { rating: "${form.rating}" } } }
        ]
      }
    }
  ]
};

const client = new WhatsAppClient({ accessToken: process.env.WHATSAPP_TOKEN! });

await client.flows.deploy(flowJson, {
  wabaId: process.env.WABA_ID!,
  name: "csat-flow",
  publish: true,
  preview: true
});
```

### Send a Flow message
```ts
import { WhatsAppClient, type FlowInteractiveInput } from "@kapso/whatsapp-cloud-api";

const client = new WhatsAppClient({ accessToken: process.env.WHATSAPP_TOKEN! });

await client.messages.sendInteractiveFlow({
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
});
```

> `flowCta` is required by Meta. `flowMessageVersion` defaults to `"3"` when omitted.

For a full walkthrough (authoring guidance, deployment scripts, Express/Edge examples, and manual testing tips) see [docs/flows.md](./docs/flows.md).

## Templates

### Build with components

Use `buildTemplatePayload` as the primary way to build templates. It accepts Meta‑style `components`, normalizes casing, and enforces shape (e.g., `language.policy = 'deterministic'` when using an object).

```ts
import { buildTemplatePayload } from '@kapso/whatsapp-cloud-api';

const template = buildTemplatePayload({
  name: 'order_confirmation',
  language: 'en_US', // or { code: 'en_US', policy: 'deterministic' }
  components: [
    { type: 'body', parameters: [{ type: 'text', text: 'Jessica' }] },
  ],
});
```

### Typed builder

Prefer typed guardrails? Use `buildTemplateSendPayload`. It outputs the same Meta structure but gives compile‑time guidance. Example with body parameters and a Flow button:

```ts
import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';

const template = buildTemplateSendPayload({
  name: 'order_confirmation',
  language: 'en_US',
  body: [
    { type: 'text', text: 'Jessica' },
    { type: 'text', text: 'SKBUP2-4CPIG9' },
  ],
  buttons: [
    {
      type: 'button',
      subType: 'flow',
      index: 0,
      parameters: [{ type: 'action', action: { flow_token: 'FT_123', flow_action_data: { step: 'one' } } }],
    },
  ],
});
```

### Template creation

The creation builder validates components and examples like Meta’s review.

Minimal examples:

```ts
import { buildTemplateDefinition } from '@kapso/whatsapp-cloud-api';

// Authentication (copy code)
const authenticationTemplate = buildTemplateDefinition({
  name: 'authentication_code',
  language: 'en_US',
  category: 'AUTHENTICATION',
  messageSendTtlSeconds: 60,
  components: [
    { type: 'BODY', addSecurityRecommendation: true },
    { type: 'FOOTER', codeExpirationMinutes: 10 },
    { type: 'BUTTONS', buttons: [{ type: 'OTP', otpType: 'COPY_CODE' }] },
  ],
});

// Limited-time offer
const limitedTimeOfferTemplate = buildTemplateDefinition({
  name: 'limited_offer', language: 'en_US', category: 'MARKETING',
  components: [
    { type: 'BODY', text: 'Hello {{1}}', example: { bodyText: [['Pablo']] } },
    { type: 'LIMITED_TIME_OFFER', limitedTimeOffer: { text: 'Expiring!', hasExpiration: true } },
  ],
});

// Catalog / MPM / SPM
const catalogTemplate = buildTemplateDefinition({
  name: 'catalog_push', language: 'en_US', category: 'MARKETING',
  components: [ { type: 'BODY', text: 'Browse our catalog' }, { type: 'BUTTONS', buttons: [{ type: 'CATALOG', text: 'View catalog' }] } ],
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
  limit: 50,
});

const conversation = await client.conversations.get({ conversationId: conversations.data[0].id, });
await client.conversations.updateStatus({ conversationId: conversation.id, status: "ended", });

// Message history
const history = await client.messages.query({
  phoneNumberId: "647015955153740",
  direction: "inbound",
  since: "2025-01-01T00:00:00Z",
  limit: 50,
  after: conversations.paging.cursors.after,
});

// Contacts
const contacts = await client.contacts.list({ phoneNumberId: "647015955153740", customerId: "123", });
await client.contacts.update({
  phoneNumberId: "647015955153740",
  waId: contacts.data[0].waId,
  metadata: { tags: ["vip"], source: "import" },
});

// Call logs
const calls = await client.calls.list({ phoneNumberId: "647015955153740", direction: "INBOUND", limit: 20, });
const call = await client.calls.get({ phoneNumberId: "647015955153740", callId: calls.data[0].id, });
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
    { type: "BUTTONS", buttons: [ { type: "QUICK_REPLY", text: "Unsubscribe" }, { type: "URL", text: "Shop", url: "https://store.example/promo" } ] },
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
await client.media.upload({ phoneNumberId: "<PHONE_NUMBER_ID>", type: "image", file: imageBlob, fileName: "photo.png", });
const metadata = await client.media.get({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>", }); // Kapso requires phoneNumberId
await client.media.delete({ mediaId: "<MEDIA_ID>", phoneNumberId: "<PHONE_NUMBER_ID>", });
```

### Receiving media

Common cases:

1) URL‑first with Kapso

Kapso stores inbound media and now also mirrors outbound media shortly after send. Ask for `kapso(media_url)` when listing messages and render the URL directly (SSR‑friendly).

```ts
import { buildKapsoMessageFields } from "@kapso/whatsapp-cloud-api";

const fields = buildKapsoMessageFields("media_url");
const page = await client.messages.listByConversation({
  phoneNumberId: "<PHONE_NUMBER_ID>",
  conversationId: "<CONVERSATION_ID>",
  fields,
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
const { data } = await client.messages.query({ phoneNumberId: "<PHONE_NUMBER_ID>", limit: 1, });
const msg = data[0];

if (msg.type === "image" && msg.image?.id) {
  const mediaId = msg.image.id;
  const bytes = await client.media.download({ mediaId, phoneNumberId: "<PHONE_NUMBER_ID>", });
  // bytes is an ArrayBuffer; do what you need with it
}
```

## Phone numbers

```ts
await client.phoneNumbers.requestCode({ phoneNumberId: "<PHONE_NUMBER_ID>", codeMethod: "SMS", language: "en_US", });
await client.phoneNumbers.verifyCode({ phoneNumberId: "<PHONE_NUMBER_ID>", code: "123456", });
await client.phoneNumbers.register({ phoneNumberId: "<PHONE_NUMBER_ID>", pin: "000111", });
await client.phoneNumbers.settings.update({ phoneNumberId: "<PHONE_NUMBER_ID>", fallbackLanguage: "en_US", });
await client.phoneNumbers.businessProfile.update({ phoneNumberId: "<PHONE_NUMBER_ID>", about: "My Shop", websites: ["https://example.com"], });
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
const response = await client.fetch("https://files.example/resource", { headers: { Accept: "image/*" }, });
```

## Typed responses

- All helpers return typed payloads (e.g., `SendMessageResponse`, `MediaUploadResponse`, etc.).
- You can also call the low-level client with typing:

```ts
const response = await client.request<MyType>("GET", "<path>", { responseType: "json", });
```

## Error handling

When a response is not OK, the client throws an `Error` whose message includes the HTTP status and response text, e.g.:

```
Meta API request failed with status 400: {"error":{...}}
```

## License

MIT
