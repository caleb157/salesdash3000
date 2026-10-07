import "server-only";
import type { Config } from "./config";

type Domain = unknown[];

export class OdooError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Survives between requests on a warm serverless instance, so we don't re-authenticate every load.
const uidCache = new Map<string, number>();

/** Minimal Odoo JSON-RPC client (works with API keys on Odoo Online / .sh / self-hosted). */
export class Odoo {
  constructor(private cfg: Config["odoo"]) {}

  private get cacheKey() {
    return `${this.cfg.url}|${this.cfg.db}|${this.cfg.login}`;
  }

  private async call(service: string, method: string, args: unknown[]) {
    // Odoo Online throttles bursts (HTTP 429); back off and retry a few times.
    let res: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`${this.cfg.url}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: Date.now(), params: { service, method, args } }),
        cache: "no-store",
      });
      if (!RETRYABLE.has(res.status) || attempt === 3) break;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Math.min(10_000, retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
    }
    if (!res) throw new OdooError("No response from Odoo");
    if (!res.ok) throw new OdooError(`Odoo HTTP ${res.status} ${res.statusText}`, res.status);
    const body = await res.json();
    if (body.error) {
      const msg = body.error.data?.message || body.error.message || "Unknown Odoo error";
      throw new OdooError(msg);
    }
    return body.result;
  }

  async authenticate() {
    const cached = uidCache.get(this.cacheKey);
    if (cached) return cached;
    const { db, login, apiKey } = this.cfg;
    const uid = await this.call("common", "authenticate", [db, login, apiKey, {}]);
    if (!uid) throw new OdooError("Odoo rejected the login / API key / database name.");
    uidCache.set(this.cacheKey, uid as number);
    return uid as number;
  }

  async execute<T = unknown>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    const uid = await this.authenticate();
    const { db, apiKey } = this.cfg;
    return (await this.call("object", "execute_kw", [db, uid, apiKey, model, method, args, kwargs])) as T;
  }

  searchRead<T>(model: string, domain: Domain, fields: string[], order?: string) {
    return this.execute<T[]>(model, "search_read", [domain], { fields, ...(order ? { order } : {}) });
  }
}
