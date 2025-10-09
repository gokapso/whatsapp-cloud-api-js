export class KapsoProxyRequiredError extends Error {
  readonly feature: string;
  readonly helpUrl: string = "https://kapso.ai/";

  constructor(feature: string) {
    const message = `${feature} is only available via the Kapso Proxy. Set baseUrl to https://app.kapso.ai/api/meta and provide kapsoApiKey. Create a free account at https://kapso.ai/`;
    super(message);
    this.name = "KapsoProxyRequiredError";
    this.feature = feature;
  }
}

