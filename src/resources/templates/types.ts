export interface TemplateLanguage {
  code: string;
  policy?: "deterministic";
}

type NamedTemplateParameter = { parameter_name?: string };

export type TemplateHeaderParameter =
  | ({ type: "text"; text: string } & NamedTemplateParameter & Record<string, unknown>)
  | ({ type: "image"; image: { id?: string; link?: string } } & Record<string, unknown>)
  | ({ type: "video"; video: { id?: string; link?: string } } & Record<string, unknown>)
  | ({ type: "document"; document: { id?: string; link?: string } } & Record<string, unknown>)
  | ({
      type: "location";
      location: {
        latitude: number | string;
        longitude: number | string;
        name?: string;
        address?: string;
      };
    } & Record<string, unknown>);

export type TemplateBodyParameter =
  | ({ type: "text"; text: string } & NamedTemplateParameter & Record<string, unknown>)
  | ({
      type: "currency";
      currency: {
        fallbackValue?: string;
        fallback_value?: string;
        code: string;
        amount1000?: number;
        amount_1000?: number;
      };
    } & NamedTemplateParameter & Record<string, unknown>)
  | ({
      type: "date_time";
      dateTime?: { fallbackValue?: string };
      date_time?: { fallback_value?: string };
    } & NamedTemplateParameter & Record<string, unknown>);

export interface TemplateHeaderComponent {
  type: "header";
  parameters: [TemplateHeaderParameter];
}

export interface TemplateBodyComponent {
  type: "body";
  parameters: TemplateBodyParameter[];
}

export type TemplateButtonParameterQuickReply = { type: "payload"; payload: string } & NamedTemplateParameter;
export type TemplateButtonParameterText = { type: "text"; text: string } & NamedTemplateParameter;
export type TemplateButtonParameterFlow = {
  type: "action";
  action: { flow_token?: string; flow_action_data?: Record<string, unknown> };
};

export interface TemplateButtonQuickReplyComponent {
  type: "button";
  subType: "quick_reply";
  index: number | string;
  parameters: TemplateButtonParameterQuickReply[];
}

export interface TemplateButtonUrlComponent {
  type: "button";
  subType: "url";
  index: number | string;
  parameters: TemplateButtonParameterText[];
}

export interface TemplateButtonPhoneComponent {
  type: "button";
  subType: "phone_number";
  index: number | string;
  parameters?: TemplateButtonParameterText[];
}

export interface TemplateButtonCopyCodeComponent {
  type: "button";
  subType: "copy_code";
  index: number | string;
  parameters: TemplateButtonParameterText[];
}

export interface TemplateButtonFlowComponent {
  type: "button";
  subType: "flow";
  index: number | string;
  parameters?: TemplateButtonParameterFlow[];
}

export interface TemplateButtonCatalogComponent {
  type: "button";
  subType: "catalog";
  index: number | string;
  parameters?: Array<Record<string, unknown>>;
}

export type TemplateButtonComponent =
  | TemplateButtonQuickReplyComponent
  | TemplateButtonUrlComponent
  | TemplateButtonPhoneComponent
  | TemplateButtonCopyCodeComponent
  | TemplateButtonFlowComponent
  | TemplateButtonCatalogComponent;

export type TemplateComponent = TemplateHeaderComponent | TemplateBodyComponent | TemplateButtonComponent;

export interface TemplateSendPayload {
  name: string;
  language: TemplateLanguage;
  components?: TemplateComponent[];
}
