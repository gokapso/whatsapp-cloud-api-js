import { z } from "zod";
import type { WhatsAppClient } from "../client";
import {
  BusinessProfileGetResponse,
  BusinessProfileUpdateResponse,
  PhoneNumberDeregisterResponse,
  PhoneNumberRegisterResponse,
  PhoneNumberRequestCodeResponse,
  PhoneNumberSettingsResponse,
  PhoneNumberSettingsUpdateResponse,
  PhoneNumberVerifyCodeResponse
} from "../types";

const requestCodeSchema = z.object({
  phoneNumberId: z.string().min(1),
  codeMethod: z.enum(["SMS", "VOICE"]),
  language: z.string().min(2)
});

const verifyCodeSchema = z.object({
  phoneNumberId: z.string().min(1),
  code: z.string().min(1)
});

const registerSchema = z.object({
  phoneNumberId: z.string().min(1),
  pin: z.string().min(1),
  dataLocalizationRegion: z.string().optional()
});

const deregisterSchema = z.object({ phoneNumberId: z.string().min(1) });

const settingsGetSchema = z.object({
  phoneNumberId: z.string().min(1),
  includeSipCredentials: z.boolean().optional()
});

const callingWeeklyHoursSchema = z.object({
  dayOfWeek: z.string().min(1),
  openTime: z.string().min(1),
  closeTime: z.string().min(1)
});

const callingHolidayScheduleSchema = z.object({
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1)
});

const callingHoursSchema = z.object({
  status: z.string().optional(),
  timezoneId: z.string().optional(),
  weeklyOperatingHours: z.array(callingWeeklyHoursSchema).optional(),
  holidaySchedule: z.array(callingHolidayScheduleSchema).optional()
});

const callingSipServerSchema = z.object({
  hostname: z.string().min(1),
  port: z.number().int().optional(),
  requestUriUserParams: z.record(z.string(), z.string()).optional(),
  sipUserPassword: z.string().optional()
});

const callingSipSchema = z.object({
  status: z.string().optional(),
  servers: z.array(callingSipServerSchema).optional()
});

const callingSettingsSchema = z.object({
  status: z.string().optional(),
  callIconVisibility: z.string().optional(),
  callHours: callingHoursSchema.optional(),
  callbackPermissionStatus: z.string().optional(),
  sip: callingSipSchema.optional()
});

const settingsUpdateSchema = z
  .object({
    phoneNumberId: z.string().min(1),
    fallbackLanguage: z.string().optional(),
    calling: callingSettingsSchema.optional()
  })
  .passthrough();

const businessProfileGetSchema = z.object({ phoneNumberId: z.string().min(1) });

const businessProfileUpdateSchema = z
  .object({
    phoneNumberId: z.string().min(1),
    about: z.string().optional(),
    address: z.string().optional(),
    description: z.string().optional(),
    email: z.string().min(1).optional(),
    profilePictureUrl: z.string().url().optional(),
    websites: z.array(z.string().url()).optional(),
    vertical: z.string().optional()
  })
  .refine((v) => Object.keys(v).length > 1, { message: "At least one field to update is required" });

/**
 * Phone-number verification, registration, settings, and business profile.
 * @category Phone Numbers
 */
export class PhoneNumbersResource {
  constructor(private readonly client: Pick<WhatsAppClient, "request">) {}

  async requestCode(input: z.infer<typeof requestCodeSchema>): Promise<PhoneNumberRequestCodeResponse> {
    const parsed = requestCodeSchema.parse(input);
    return this.client.request<PhoneNumberRequestCodeResponse>("POST", `${parsed.phoneNumberId}/request_code`, {
      body: { codeMethod: parsed.codeMethod, language: parsed.language },
      responseType: "json"
    });
  }

  async verifyCode(input: z.infer<typeof verifyCodeSchema>): Promise<PhoneNumberVerifyCodeResponse> {
    const parsed = verifyCodeSchema.parse(input);
    return this.client.request<PhoneNumberVerifyCodeResponse>("POST", `${parsed.phoneNumberId}/verify_code`, {
      body: { code: parsed.code },
      responseType: "json"
    });
  }

  async register(input: z.infer<typeof registerSchema>): Promise<PhoneNumberRegisterResponse> {
    const parsed = registerSchema.parse(input);
    const body: Record<string, unknown> = { messagingProduct: "whatsapp", pin: parsed.pin };
    if (parsed.dataLocalizationRegion) body.dataLocalizationRegion = parsed.dataLocalizationRegion;
    return this.client.request<PhoneNumberRegisterResponse>("POST", `${parsed.phoneNumberId}/register`, {
      body,
      responseType: "json"
    });
  }

  async deregister(input: z.infer<typeof deregisterSchema>): Promise<PhoneNumberDeregisterResponse> {
    const parsed = deregisterSchema.parse(input);
    return this.client.request<PhoneNumberDeregisterResponse>("POST", `${parsed.phoneNumberId}/deregister`, {
      responseType: "json"
    });
  }

  readonly settings = {
    get: async (input: z.infer<typeof settingsGetSchema>): Promise<PhoneNumberSettingsResponse> => {
      const parsed = settingsGetSchema.parse(input);
      const query = parsed.includeSipCredentials ? { includeSipCredentials: true } : undefined;
      return this.client.request<PhoneNumberSettingsResponse>("GET", `${parsed.phoneNumberId}/settings`, {
        query,
        responseType: "json"
      });
    },
    update: async (input: z.infer<typeof settingsUpdateSchema>): Promise<PhoneNumberSettingsUpdateResponse> => {
      const { phoneNumberId, ...rest } = settingsUpdateSchema.parse(input);
      return this.client.request<PhoneNumberSettingsUpdateResponse>("POST", `${phoneNumberId}/settings`, {
        body: rest,
        responseType: "json"
      });
    }
  };

  readonly businessProfile = {
    get: async (input: z.infer<typeof businessProfileGetSchema>): Promise<BusinessProfileGetResponse> => {
      const parsed = businessProfileGetSchema.parse(input);
      return this.client.request<BusinessProfileGetResponse>("GET", `${parsed.phoneNumberId}/whatsapp_business_profile`, {
        responseType: "json"
      });
    },
    update: async (input: z.infer<typeof businessProfileUpdateSchema>): Promise<BusinessProfileUpdateResponse> => {
      const { phoneNumberId, ...rest } = businessProfileUpdateSchema.parse(input);
      return this.client.request<BusinessProfileUpdateResponse>("POST", `${phoneNumberId}/whatsapp_business_profile`, {
        body: { messagingProduct: "whatsapp", ...rest },
        responseType: "json"
      });
    }
  };
}
