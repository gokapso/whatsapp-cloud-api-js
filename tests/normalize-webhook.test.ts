import { describe, expect, it } from "vitest";
import { normalizeWebhook } from "../src/server";

describe("normalizeWebhook", () => {
  it("normalizes Meta webhook payloads into unified structures", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "+1 631-555-8151",
                  phone_number_id: "16315558151"
                },
                contacts: [
                  {
                    profile: { name: "Jane Doe" },
                    wa_id: "15551234567"
                  }
                ],
                messages: [
                  {
                    from: "15551234567",
                    id: "wamid.order",
                    timestamp: "1735689800",
                    type: "order",
                    order: {
                      catalog_id: "CAT123",
                      product_items: [
                        { product_retailer_id: "SKU-1", quantity: "1" }
                      ],
                      text: "Thanks for your order!"
                    }
                  },
                  {
                    from: "15551234567",
                    id: "wamid.sticker",
                    timestamp: "1735689810",
                    type: "sticker",
                    sticker: {
                      id: "STICKER_ID",
                      mime_type: "image/webp",
                      animated: true
                    }
                  },
                  {
                    from: "15551234567",
                    id: "wamid.flow",
                    timestamp: "1735689820",
                    type: "interactive",
                    context: {
                      id: "wamid.original",
                      from: "16315558151",
                      referred_product: {
                        catalog_id: "CATREF",
                        product_retailer_id: "SKU-REF"
                      }
                    },
                    interactive: {
                      type: "nfm_reply",
                      nfm_reply: {
                        name: "feedback_flow",
                        response_json: "{\"flow_token\":\"FT_123\",\"rating\":\"5\",\"comment\":\"Great!\"}"
                      }
                    }
                  }
                ],
                statuses: [
                  {
                    id: "wamid.order",
                    recipient_id: "15551234567",
                    status: "sent",
                    timestamp: "1735689900",
                    conversation: {
                      id: "conv-1",
                      origin: { type: "business_initiated" },
                      expiration_timestamp: "1735693500"
                    }
                  }
                ],
                calls: [
                  {
                    event: "CALL_CONNECT",
                    wacid: "wacid.ABC",
                    direction: "USER_INITIATED",
                    status: "CONNECTED",
                    from: "15551234567",
                    to: "16315558151",
                    start_time: 1735689950
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const normalized = normalizeWebhook(payload);

    expect(normalized.object).toBe("whatsapp_business_account");
    expect(normalized.phoneNumberId).toBe("16315558151");
    expect(normalized.displayPhoneNumber).toBe("+1 631-555-8151");
    expect(normalized.contacts[0]).toMatchObject({ waId: "15551234567" });

    expect(normalized.messages).toHaveLength(3);
    const orderMessage = normalized.messages.find((msg) => msg.id === "wamid.order");
    expect(orderMessage?.order?.catalogId).toBe("CAT123");
    expect(orderMessage?.order?.orderText).toBe("Thanks for your order!");
    expect(orderMessage?.kapso?.orderText).toBe("Thanks for your order!");
    expect(orderMessage?.kapso?.direction).toBe("inbound");

    const stickerMessage = normalized.messages.find((msg) => msg.id === "wamid.sticker");
    expect(stickerMessage?.sticker).toMatchObject({ mimeType: "image/webp", animated: true });

    const flowMessage = normalized.messages.find((msg) => msg.id === "wamid.flow");
    expect(flowMessage?.context?.referredProduct).toMatchObject({
      catalogId: "CATREF",
      productRetailerId: "SKU-REF"
    });
    expect(flowMessage?.kapso?.flowResponse).toMatchObject({ rating: "5", comment: "Great!" });
    expect(flowMessage?.kapso?.flowToken).toBe("FT_123");
    expect(flowMessage?.kapso?.flowName).toBe("feedback_flow");
    expect(flowMessage?.kapso?.direction).toBe("inbound");

    expect(normalized.statuses).toHaveLength(1);
    expect(normalized.statuses[0]).toMatchObject({
      id: "wamid.order",
      status: "sent",
      conversation: { expirationTimestamp: "1735693500" }
    });

    expect(normalized.calls).toHaveLength(1);
    expect(normalized.calls[0]).toMatchObject({
      event: "CALL_CONNECT",
      callId: "wacid.ABC",
      status: "CONNECTED",
      startTime: 1735689950
    });
  });

  it("collects raw payloads for every webhook field and flattens SMB echoes", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            { field: "account_alerts", value: { entity_type: "BUSINESS", entity_id: "123", alert_info: { alert_severity: "WARNING" } } },
            { field: "account_review_update", value: { decision: "APPROVED" } },
            { field: "account_update", value: { event: "ACCOUNT_DELETED" } },
            { field: "business_capability_update", value: { max_daily_conversation_per_phone: 1000 } },
            { field: "history", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "1" }, history: [{ metadata: { phase: 0, chunk_order: 1, progress: 10 }, threads: [] }] } },
            { field: "message_template_components_update", value: { message_template_id: 1, message_template_name: "order_confirmation" } },
            { field: "message_template_quality_update", value: { previous_quality_score: "GREEN", new_quality_score: "YELLOW" } },
            { field: "message_template_status_update", value: { event: "APPROVED", message_template_id: 2 } },
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "1" },
                messages: [
                  { from: "111", id: "wamid.msg", timestamp: "1", type: "text", text: { body: "hi" } }
                ],
                message_echoes: [
                  { from: "BUSINESS", to: "222", id: "wamid.echo", timestamp: "2", type: "text", text: { body: "hello" } }
                ],
                statuses: [
                  { id: "wamid.msg", status: "delivered", timestamp: "3" }
                ],
                calls: [
                  { event: "CALL_STATUS", wacid: "wacid.DEF", status: "RINGING" }
                ]
              }
            },
            { field: "partner_solutions", value: { event: "SOLUTION_CREATED", solution_id: "SOL" } },
            { field: "payment_configuration_update", value: { configuration_name: "razorpay", status: "Needs Testing" } },
            { field: "phone_number_name_update", value: { display_phone_number: "123", decision: "APPROVED" } },
            { field: "phone_number_quality_update", value: { event: "UPGRADE", current_limit: "TIER_1K" } },
            { field: "security", value: { event: "PIN_RESET_REQUEST" } },
            { field: "smb_app_state_sync", value: { state_sync: [{ type: "contact", action: "add", contact: { full_name: "Pablo", phone_number: "333" } }] } },
            { field: "smb_message_echoes", value: { message_echoes: [{ from: "BUSINESS", to: "444", id: "wamid.echo2", timestamp: "4", type: "text", text: { body: "echo2" } }] } },
            { field: "template_category_update", value: { message_template_id: 3, new_category: "MARKETING" } },
            { field: "user_preferences", value: { contacts: [{ wa_id: "555" }], user_preferences: [{ wa_id: "555", value: "stop" }] } }
          ]
        }
      ]
    };

    const normalized = normalizeWebhook(payload);

    expect(normalized.raw.accountAlerts?.[0]).toMatchObject({ entityType: "BUSINESS" });
    expect(normalized.raw.accountReviewUpdate?.[0]).toMatchObject({ decision: "APPROVED" });
    expect(normalized.raw.accountUpdate?.[0]).toMatchObject({ event: "ACCOUNT_DELETED" });
    expect(normalized.raw.businessCapabilityUpdate?.[0]).toMatchObject({ maxDailyConversationPerPhone: 1000 });
    expect(normalized.raw.history?.[0]).toMatchObject({ messagingProduct: "whatsapp" });
    expect(normalized.raw.messageTemplateComponentsUpdate?.[0]).toMatchObject({ messageTemplateId: 1 });
    expect(normalized.raw.messageTemplateQualityUpdate?.[0]).toMatchObject({ newQualityScore: "YELLOW" });
    expect(normalized.raw.messageTemplateStatusUpdate?.[0]).toMatchObject({ event: "APPROVED" });
    expect(normalized.raw.partnerSolutions?.[0]).toMatchObject({ event: "SOLUTION_CREATED" });
    expect(normalized.raw.paymentConfigurationUpdate?.[0]).toMatchObject({ configurationName: "razorpay" });
    expect(normalized.raw.phoneNumberNameUpdate?.[0]).toMatchObject({ decision: "APPROVED" });
    expect(normalized.raw.phoneNumberQualityUpdate?.[0]).toMatchObject({ currentLimit: "TIER_1K" });
    expect(normalized.raw.security?.[0]).toMatchObject({ event: "PIN_RESET_REQUEST" });
    expect(normalized.raw.smbAppStateSync?.[0]).toMatchObject({ stateSync: [{ type: "contact" }] });
    expect(normalized.raw.templateCategoryUpdate?.[0]).toMatchObject({ newCategory: "MARKETING" });
    expect(normalized.raw.userPreferences?.[0]).toMatchObject({ userPreferences: [{ value: "stop" }] });

    // message_echoes from both direct payload and SMB variant should appear in normalized messages
    const ids = normalized.messages.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["wamid.msg", "wamid.echo", "wamid.echo2"]));
    const echoMessage = normalized.messages.find((m) => m.id === "wamid.echo2");
    expect(echoMessage?.kapso?.direction).toBe("outbound");
    expect(echoMessage?.kapso?.source).toBe("smb_message_echo");

    const directEcho = normalized.messages.find((m) => m.id === "wamid.echo");
    expect(directEcho?.kapso?.direction).toBe("outbound");

    const inboundMsg = normalized.messages.find((m) => m.id === "wamid.msg");
    expect(inboundMsg?.kapso?.direction).toBe("inbound");

    // statuses/calls captured
    expect(normalized.statuses).toEqual(expect.arrayContaining([expect.objectContaining({ id: "wamid.msg", status: "delivered" })]));
    expect(normalized.calls).toEqual(expect.arrayContaining([expect.objectContaining({ callId: "wacid.DEF", status: "RINGING" })]));
  });

  it("handles empty or malformed payloads", () => {
    expect(normalizeWebhook(undefined)).toMatchObject({ messages: [], statuses: [], calls: [] });
    expect(normalizeWebhook({})).toMatchObject({ messages: [], statuses: [], calls: [] });
  });
});
