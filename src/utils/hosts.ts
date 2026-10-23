/** Match the domain itself or a DNS subdomain, never a lookalike suffix. */
export function isKapsoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "kapso.ai" || host.endsWith(".kapso.ai");
}
