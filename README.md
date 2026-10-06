# Sales Dashboard

A password-protected dashboard of **booked** sales orders and **invoiced** revenue from Odoo,
with month / quarter / year snapshots (calendar or financial year) and progress against three goals.

## What the numbers mean

| Figure | Source in Odoo |
|---|---|
| **Booked** | Confirmed sales orders (`sale.order`, state Sales Order), dated by confirmation date |
| **Invoiced** | Posted customer invoices (`account.move`), dated by invoice date, net of credit notes |
| **Ready to invoice** | Orders booked in the period whose invoice status is *To Invoice* |
| **Open orders** | Every confirmed order not yet fully invoiced, any date |

Amounts are untaxed and in the company currency by default (foreign-currency orders are converted at the order's rate).
Goals are annual; quarter and month views show the goal ÷ 4 and ÷ 12.

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
   | `GOALS` | `140000,175000,240000` |
   | `FY_START_MONTH` | `1` = January, `4` = April, `7` = July … |
   | `TIMEZONE` | e.g. `America/Los_Angeles` |

   Optional: `AMOUNT_BASIS=total` to include tax, `INCLUDE_CREDIT_NOTES=false`, `DEMO_MODE=true` for fake data.
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
