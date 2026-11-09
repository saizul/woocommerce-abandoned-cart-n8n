# 1. Abandoned checkout recovery

Recovers unpaid online-payment orders (status `pending` or `failed`).

## Flow

1. **WooCommerce order webhook** receives order created / updated events.
2. **Config** holds your settings.
3. **Normalize order** keeps only `pending` or `failed` non-COD orders that have a phone or email, formats the phone number (default country code `880`), builds the payment link and the reminder messages. Each order is processed once (tracked in workflow static data for 7 days).
4. **Wait before check 1** (default 60 minutes).
5. **Re-check order (1)** calls `GET /wp-json/wc/v3/orders/{id}`.
6. **Still unpaid?** If the order is now paid, a row is written to the sheet ("Paid before reminder") and the flow stops.
7. **Use WhatsApp?** sends the WhatsApp template through the Cloud API, otherwise sends an email.
8. **Log reminder 1** appends a row to Google Sheets.
9. **Wait before check 2** (default 24 hours), repeat steps 5 to 8 for the second reminder.

```
Webhook > Config > Normalize > Wait > Re-check > Unpaid? -- yes > WhatsApp / Email > Log > Wait > Re-check > Unpaid? > WhatsApp / Email > Log
                                                   `-- no  > Log recovered
```

## Setup

### 1. Credentials

- **HTTP Basic Auth** for WooCommerce: consumer key as user, consumer secret as password (WooCommerce > Settings > Advanced > REST API, Read/Write). Assign to both "Re-check order" nodes.
- **HTTP Header Auth** for WhatsApp: header `Authorization`, value `Bearer <token>`. Assign to both WhatsApp nodes.
- **Google Sheets OAuth2** for the three log nodes.
- **SMTP** for the two email nodes (only needed when `channel` is `email` or customers have no phone).

### 2. Config node

| Field | Meaning |
| --- | --- |
| `siteUrl` | Store URL without trailing slash |
| `channel` | `whatsapp` or `email` |
| `defaultCountryCode` | Used to normalize local numbers (`880` for Bangladesh) |
| `waPhoneNumberId` | WhatsApp Cloud API phone number id |
| `waLanguage` | Template language code, for example `en` or `bn` |
| `waTemplateReminder1`, `waTemplateReminder2` | Approved template names |
| `fromEmail` | Sender address for emails |
| `firstWaitMinutes`, `secondWaitMinutes` | Delays (60 and 1440 by default) |

### 3. WhatsApp templates

Create two utility templates with three body variables: `{{1}}` customer name, `{{2}}` order total, `{{3}}` checkout link. Example body: `Hi {{1}}, your order of {{2}} is saved. Complete payment here: {{3}}`.

### 4. Google Sheet

Create a spreadsheet with a tab named `Recovery Log` and this header row:

`Order ID | Customer | Phone | Email | Total | Reminder | Channel | Status | Timestamp`

Put the spreadsheet id in the three Google Sheets nodes.

### 5. WooCommerce webhooks

In WooCommerce > Settings > Advanced > Webhooks > Add webhook:

| Field | Value |
| --- | --- |
| Name | n8n checkout recovery (created) |
| Status | Active |
| Topic | Order created |
| Delivery URL | The workflow **Production URL** (Webhook node, path `woo-checkout-recovery`) |
| Secret | Any random string (optional) |
| API version | WP REST API Integration v3 |

Add a second webhook with topic **Order updated** to catch orders that move from pending to failed. Activate the workflow before saving the webhooks so the delivery test succeeds.

## Tips

- Orders that are paid, cancelled or completed during the wait are skipped automatically.
- Set WooCommerce > Settings > Products > Inventory > "Hold stock (minutes)" longer than your wait times, otherwise WooCommerce cancels unpaid orders first.
- Test with `firstWaitMinutes` set to `1`.

## বাংলা সারসংক্ষেপ

এই ওয়ার্কফ্লো `pending` বা `failed` হয়ে থাকা অনলাইন পেমেন্ট অর্ডার ধরে। নির্দিষ্ট সময় (ডিফল্ট ১ ঘণ্টা) অপেক্ষা করে WooCommerce REST API দিয়ে আবার দেখে অর্ডারটি এখনো পেমেন্ট হয়নি কি না। এখনো বাকি থাকলে গ্রাহককে হোয়াটসঅ্যাপ (Cloud API টেমপ্লেট) বা ইমেইলে পেমেন্ট লিংকসহ রিমাইন্ডার পাঠায়, ২৪ ঘণ্টা পর দ্বিতীয় রিমাইন্ডার দেয়, আর প্রতিটি ধাপ Google Sheets-এ লগ করে। ০১XXXXXXXXX ফরম্যাটের নম্বর নিজে থেকে ৮৮০ ফরম্যাটে রূপান্তর হয়।
