# 2. COD order confirmation

Confirms Cash on Delivery orders before you ship them, and keeps a call list for the ones that need a phone call.

## Flow

**Branch A: new order**

1. **New WooCommerce order** (WooCommerce Trigger, `order.created`).
2. **Is COD order?** continues only when `payment_method` is `cod`.
3. **Normalize COD order** formats the phone number and builds the WhatsApp payload.
4. **Add to call queue** appends a row to the `COD Queue` sheet with status `Awaiting confirmation`.
5. **WhatsApp confirmation buttons** sends a template with two quick-reply buttons: Confirm and Cancel.

**Branch B: customer reply**

1. **WhatsApp replies (POST)** receives Meta webhook events.
2. **Parse reply** reads the button payload (`CONFIRM|<orderId>` or `CANCEL|<orderId>`); status callbacks are ignored.
3. **Confirmed:** order set to `processing`, an order note is added, the sheet row is updated, a thank-you message is sent.
4. **Cancelled:** order set to `cancelled`, a note is added, the sheet row is updated, a message is sent.

A second webhook (**WhatsApp verify (GET)**) answers Meta's one-time verification challenge.

## Setup

### Credentials

WooCommerce API (for the trigger), HTTP Basic Auth (REST calls), HTTP Header Auth (WhatsApp), Google Sheets OAuth2.

### Config nodes

Edit both **Config** and **Config (reply)**: `siteUrl`, `waPhoneNumberId`, and in the first one `defaultCountryCode`, `waLanguage`, `waTemplateConfirm`. In **Verify token matches?** replace `REPLACE_WITH_VERIFY_TOKEN` with a random string of your choice.

### WhatsApp template

Create a utility template named `cod_order_confirmation` with:

- Body variables: `{{1}}` name, `{{2}}` order number, `{{3}}` total. Example: `Hi {{1}}, please confirm your Cash on Delivery order #{{2}} ({{3}}).`
- Two **Quick reply** buttons: `Confirm order` and `Cancel order`.

### WhatsApp webhook (Meta)

In Meta for Developers > WhatsApp > Configuration:

| Field | Value |
| --- | --- |
| Callback URL | Production URL of the Webhook node (path `whatsapp-cod-reply`) |
| Verify token | The value you put in **Verify token matches?** |
| Webhook fields | Subscribe to `messages` |

### Google Sheet

Tab `COD Queue`, header row:

`Order ID | Customer | Phone | Address | Items | Total | Status | Call result | Created at | Replied at`

Rows still showing `Awaiting confirmation` after a few hours are your call list.

### WooCommerce trigger

The WooCommerce Trigger node registers its own webhook in your store when the workflow is activated, so no manual webhook is needed. If you prefer a manual webhook, replace the node with a Webhook node and use topic **Order created**.

## Notes

- Cancelling is automatic when the customer taps Cancel. Change `status` in the **Order: cancelled** node to `on-hold` if you prefer to review first.
- The status after confirmation is `processing`; adjust it to match your fulfilment flow.

## বাংলা সারসংক্ষেপ

নতুন Cash on Delivery অর্ডার এলে এই ওয়ার্কফ্লো অর্ডারটি Google Sheets-এর "COD Queue"-তে যোগ করে (কল লিস্ট) এবং গ্রাহকের হোয়াটসঅ্যাপে "Confirm" ও "Cancel" বাটনসহ মেসেজ পাঠায়। গ্রাহক বাটনে ট্যাপ করলে অর্ডারের স্ট্যাটাস (processing বা cancelled) ও নোট WooCommerce-এ আপডেট হয়, শিটও আপডেট হয় এবং গ্রাহক ধন্যবাদ বা বাতিলের মেসেজ পান। যাদের উত্তর আসে না, তাদের শিট দেখে ফোন করে কনফার্ম করতে পারবেন।
