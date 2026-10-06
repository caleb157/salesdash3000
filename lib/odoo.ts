import "server-only";
import type { Config } from "./config";

type Domain = unknown[];

export class OdooError extends Error {}

/** Minimal Odoo JSON-RPC client (works with API keys on Odoo Online / .sh / self-hosted). */
export class Odoo {
  private uid: number | null = null;
  constructor(private cfg: Config["odoo"]) {}

  private async call(service: string, method: string, args: unknown[]) {
    const res = await fetch(`${this.cfg.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: Date.now(), params: { service, method, args } }),
      cache: "no-store",
    });
    if (!res.ok) throw new OdooError(`Odoo HTTP ${res.status} ${res.statusText}`);
    const body = await res.json();
    if (body.error) {
      const msg = body.error.data?.message || body.error.message || "Unknown Odoo error";
      throw new OdooError(msg);
    }
    return body.result;
  }

  async authenticate() {
    if (this.uid) return this.uid;
    const { db, login, apiKey } = this.cfg;
    const uid = await this.call("common", "authenticate", [db, login, apiKey, {}]);
    if (!uid) throw new OdooError("Odoo rejected the login / API key / database name.");
    this.uid = uid as number;
    return this.uid;
  }

  async execute<T = unknown>(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    const uid = await this.authenticate();
    const { db, apiKey } = this.cfg;
    return (await this.call("object", "execute_kw", [db, uid, apiKey, model, method, args, kwargs])) as T;
  }

  searchRead<T>(model: string, domain: Domain, fields: string[], order?: string) {
    return this.execute<T[]>(model, "search_read", [domain], { fields, ...(order ? { order } : {}) });
  }

  async hasField(model: string, field: string) {
    const fields = await this.execute<Record<string, unknown>>(model, "fields_get", [[field]], { attributes: ["type"] });
    return field in fields;
  }
}
