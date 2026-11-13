# 6. Win-back lapsed customers

Finds customers who bought before but have not ordered for a while (default 90 days) and sends each of them one WhatsApp template or email with a comeback coupon. Runs once a week and never messages the same customer twice within the cooldown (default 180 days).

## Flow

1. **Every Monday 10:00** is a Schedule Trigger (store time zone from the workflow settings).
2. **Config** holds the store URL, channel, coupon and the timing rules.
3. **Date range** computes the start of the order window (`lookbackDays`, default 365, always longer than `lapsedDays`).
4. **Get orders** loads every order created in that window from the WooCommerce REST API, 100 per page, up to 50 pages (5,000 orders).
5. **Find lapsed customers** groups orders by billing email (or normalized phone for orders without an email) and keeps a customer only when:
   - they have at least `minOrders` paid orders (`completed`, `processing` or `on-hold`),
   - their last paid order is at least `lapsedDays` old,
   - they have no newer order of any status (a recent pending or failed order means they are still active, workflow 1 handles those),
   - they were not contacted by this workflow in the last `cooldownDays`,
   - their email is not in `excludeEmails`.

   The best customers (highest total spent) go first, capped at `maxPerRun` per run. Contacted emails and phone numbers are stored in the workflow's static data.
6. **Use WhatsApp?** sends the `win_back_offer` template when `channel` is `whatsapp` and a phone number is known, otherwise an email.
7. **Log win-back** appends one row per message to Google Sheets.

## Setup

### 1. Coupon

Create the coupon in WooCommerce > Marketing > Coupons, for example `WELCOMEBACK10` with 10% off, **Usage limit per user** 1 and an expiry date you are happy with. The workflow only sends the code, it does not create coupons. Leave `couponCode` empty to send a plain "we miss you" message.

### 2. Credentials

- **HTTP Basic Auth** for WooCommerce: consumer key as user, consumer secret as password (Read access is enough). Assign to **Get orders**.
- **HTTP Header Auth** for WhatsApp: header `Authorization`, value `Bearer <token>`. Assign to **WhatsApp win-back**.
- **SMTP** for **Email win-back**.
- **Google Sheets OAuth2** for **Log win-back**.

### 3. Config node

| Field | Meaning |
| --- | --- |
| `siteUrl` | Store URL without trailing slash |
| `shopUrl` | Link in the message (defaults to `siteUrl/shop/` when empty) |
| `channel` | `whatsapp` or `email` |
| `defaultCountryCode` | Used to normalize local numbers (`880` for Bangladesh) |
| `waPhoneNumberId` | WhatsApp Cloud API phone number id |
| `waLanguage`, `waTemplateWinback` | Template language and name |
| `fromEmail` | Sender address for emails |
| `couponCode`, `offerText` | Coupon code and how it is described in the email (`10% off your next order`) |
| `lapsedDays` | Days without an order before a customer counts as lapsed (90) |
| `lookbackDays` | How far back orders are loaded (365) |
| `minOrders` | Minimum paid orders in the window (1; use 2 to target repeat buyers only) |
| `cooldownDays` | Days before the same customer can get another win-back message (180) |
| `maxPerRun` | Maximum messages per run (50) |
| `excludeEmails` | Comma-separated emails that must never be contacted (opt-outs) |

### 4. WhatsApp template

Create a **marketing** template named `win_back_offer` with three body variables: `{{1}}` customer name, `{{2}}` coupon code, `{{3}}` shop link. Example body: `Hi {{1}}, we miss you! Use code {{2}} for 10% off your next order: {{3}}`.

### 5. Google Sheet

Create a tab named `Win-back Log` with this header row and put the spreadsheet id in **Log win-back**:

`Customer | Email | Phone | Orders | Total spent | Last order | Days since | Coupon | Channel | Timestamp`

## Notes

- Test with a manual run and `maxPerRun` set to `1`. The contacted list is only saved for active (production) executions, so manual runs do not use up the cooldown.
- A customer is marked as contacted when the message is prepared, so a failed send is not retried next week. Check the execution log or the sheet for failures.
- Stores with more than 5,000 orders per `lookbackDays` should shorten `lookbackDays` or raise `maxRequests` in **Get orders**, otherwise the oldest orders in the window are not loaded.
- Win-back messages are marketing. Only contact customers who agreed to receive marketing from you, honour opt-outs (add them to `excludeEmails`) and follow Meta's messaging policies.

## বাংলা সারসংক্ষেপ

যেসব গ্রাহক আগে কেনাকাটা করেছেন কিন্তু নির্দিষ্ট সময় (ডিফল্ট ৯০ দিন) ধরে আর কোনো অর্ডার করেননি, এই ওয়ার্কফ্লো প্রতি সোমবার তাদের খুঁজে বের করে এবং হোয়াটসঅ্যাপ টেমপ্লেট বা ইমেইলে একটি কুপন কোডসহ "আবার আসুন" বার্তা পাঠায়। সাম্প্রতিক কোনো অর্ডার থাকলে বার্তা যায় না, আর একই গ্রাহককে ১৮০ দিনের মধ্যে দ্বিতীয়বার বার্তা পাঠানো হয় না। প্রতিটি বার্তা Google Sheets-এ লগ হয়।
