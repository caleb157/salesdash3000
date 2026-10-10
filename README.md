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

### Revenue projection

A top-line number for the **current** calendar year and financial year (toggle between them):

| Part | Source in Odoo |
|---|---|
| **Already in — invoiced** | Posted customer invoices minus credit notes, untaxed, by invoice date |
| **Already in — other bank income** | Posted bank/cash journal items booked straight to income accounts (drawbacks, export incentives, interest…), by date |
| **Not in yet** | For every confirmed order not fully invoiced: untaxed total minus what's already been invoiced |
| **Projected** | Already in + Not in yet |

"Not in yet" covers all open orders whatever their date, on the assumption they'll be invoiced this year.
Other income only appears if the bank line was matched directly to an income account; income first booked to a
receivable (or posted in a miscellaneous journal) isn't picked up.

Everything is shown **before tax, in INR**. Orders in other currencies (e.g. USD) are converted at
**Odoo's own exchange rate on the order date** (the order's `currency_rate`). The USD goals are converted at the
**live rate** (frankfurter.dev / ECB, with open.er-api.com as backup, refreshed hourly), shown at the bottom of the page.

Odoo Online rate-limits API traffic, so the dashboard makes its few calls one at a time, retries on HTTP 429,
caches each load for 10 minutes, and falls back to the last good load if Odoo is briefly unavailable.

Goals are annual (Goal 1 ₹1 crore, Goal 2 $175k, Goal 3 $240k). Quarter and month views show goal ÷ 4 and ÷ 12.
The financial year runs April → March.

## Container tracker (`/containers`)

Paste container numbers or bills of lading (one or many) and see where each box is now, on a map.
It's behind the same password as the dashboard, and the **Containers** button in the header opens it.

**Where the location comes from.** Containers don't carry GPS. The tracker combines:

1. **The shipping line's own milestones**: last port/terminal, gate-in/out, loaded, discharged, next port, ETA.
2. **The live AIS position of the ship the box is on**, while it's at sea: lat/lon, speed, course, and how many minutes old the position is.

In port or on land, the pin sits at the last port or terminal the carrier reported.

**Data source: [JSONCargo](https://jsoncargo.com)**. It's pay-as-you-go with no contract, and one key covers container tracking,
bill of lading → containers, and live vessel AIS. Plans start at a few euros a month. The page shows how many API requests are left.
Supported lines: Maersk, MSC, CMA CGM, COSCO, Hapag-Lloyd, ONE, Evergreen, HMM, Yang Ming, ZIM and PIL.

**Free features (no key needed):**
- ISO 6346 check-digit validation, which catches typos in container numbers
- Shipping line auto-detected from the container prefix or B/L prefix
- A link to each carrier's official free tracking page
- MarineTraffic / VesselFinder links for the ship
- OpenStreetMap maps

**What it costs in requests:**
- One request per container per refresh. Results are cached for 2 h (`TRACK_CACHE_MINUTES`).
- A B/L costs one request, plus one per container on it.
- The ship's position costs one request per 15 min (`VESSEL_CACHE_MINUTES`).
- Looking up the ship's IMO costs one request, then it's cached for 30 days.
- Ports not in the built-in list cost one geocoding request, then they're cached for 30 days.
- **Refresh** pulls fresh data straight away.

**Upload documents:** click **Upload PDF**, or drop bills of lading and invoices onto the form, and the container and B/L numbers are pulled out.
You can also paste a whole document's text. Container numbers must pass the ISO 6346 check digit, and B/L numbers must carry a known carrier prefix or sit next to an "MBL" / "Master B/L" label.
The filename becomes the shipment's note. Reading a document spends no API requests.
Scanned or photographed PDFs have no text to read, so type those numbers in.
A forwarder's house bill or MTD (e.g. Xhipment's `XHPUS…`) can't be tracked at the carrier, so its container number is used instead.

**Setup:** add `JSONCARGO_API_KEY` in Vercel. Without it, every number shows made-up **demo** tracking.
For leased boxes (TCNU, TGHU, CAIU, SEGU…), the prefix doesn't say which line is carrying them, so pick the shipping line yourself.

The watch list (numbers + notes) is saved in the browser, so it doesn't sync between devices.

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
   | `JSONCARGO_API_KEY` | (optional) container tracker API key from jsoncargo.com |

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
