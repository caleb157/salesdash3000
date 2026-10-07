# Sales Dashboard

A password-protected dashboard of **booked** sales orders and **invoiced** revenue from Odoo,
with month / quarter / year snapshots (calendar or financial year) and progress against three goals.

## What the numbers mean

| Figure | Source in Odoo |
|---|---|
| **Booked** | Confirmed sales orders, dated by confirmation date |
| **Fully invoiced** | Orders booked in the period whose invoice status is now *Fully Invoiced* |
| **To invoice** | Orders booked in the period that aren't fully invoiced yet |
| **Open orders** | Every confirmed order not yet fully invoiced, any date |

Fully invoiced + To invoice always equals Booked for the selected period.

Everything is shown **before tax, in INR**. Orders in other currencies (e.g. USD) are converted at
**Odoo's own exchange rate on the order date** (the order's `currency_rate`). The USD goals are converted at the
**live rate** (frankfurter.dev / ECB, with open.er-api.com as backup, refreshed hourly), shown at the bottom of the page.

Odoo Online rate-limits API traffic, so the dashboard makes its few calls one at a time, retries on HTTP 429,
caches each load for 10 minutes, and falls back to the last good load if Odoo is briefly unavailable.

Goals are annual (Goal 1 ₹1 crore, Goal 2 $175k, Goal 3 $240k). Quarter and month views show goal ÷ 4 and ÷ 12.
The financial year runs April → March.

## Deploy to Vercel

1. In Vercel: **Add New → Project → Import** this GitHub repo. Framework preset: Next.js (auto-detected).
2. Add these **Environment Variables** (Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `ODOO_URL` | `https://parableventures.odoo.com` |
   | `ODOO_DB` | `parableventures` (Odoo → Settings → bottom of the page shows the database name if this is wrong) |
   | `ODOO_LOGIN` | `parker@parable-ventures.com` |
   | `ODOO_API_KEY` | your Odoo API key (Odoo → My Profile → Account Security → New API Key) |
   | `DASHBOARD_PASSWORD` | the password you'll type to open the dashboard |
   | `AUTH_SECRET` | any long random string, e.g. output of `openssl rand -hex 32` |

   Optional (defaults shown): `GOALS=10000000 INR,175000 USD,240000 USD`, `FY_START_MONTH=4`,
   `TIMEZONE=Asia/Kolkata`, `USD_INR_RATE=88` (only used if live rates are unreachable), `DEMO_MODE=true` for fake data.
3. Deploy. Open the URL, enter the password.

Without `ODOO_API_KEY` the app runs on demo data (a yellow **Demo data** badge shows in the header).

Data is cached for 10 minutes; the **Refresh** button pulls fresh numbers immediately.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

## Notes

- Odoo Online only allows external API access on the **Custom** plan.
- Uses Odoo's JSON-RPC API (`/jsonrpc`) with an API key, so it works with Odoo 14 through 19.
- The API key stays on the server; the browser only ever sees the computed numbers and order lists.
