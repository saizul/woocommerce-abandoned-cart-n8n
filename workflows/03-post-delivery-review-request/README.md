# 3. Post-delivery review request

Asks customers for a review a few days after their order is completed.

## Flow

1. **Order updated** (WooCommerce Trigger, `order.updated`).
2. **Order completed?** continues only for status `completed`.
3. **Normalize order** skips orders already marked with `_review_request_scheduled` or `_review_requested`, formats the phone number and builds the message and review link.
4. **Mark scheduled** writes the order meta `_review_request_scheduled` immediately, so later updates of the same order do not start a second wait.
5. **Wait N days** (Config `waitDays`, default 7).
6. **Re-check order** and **Still completed?** (skips refunded or changed orders).
7. **Use WhatsApp?** sends a template or an email.
8. **Mark requested** sets `_review_requested` and **Add order note** records it on the order.

## Setup

- Credentials: WooCommerce API, HTTP Basic Auth, HTTP Header Auth (WhatsApp), SMTP.
- Config: `siteUrl`, `channel`, `defaultCountryCode`, `waPhoneNumberId`, `waLanguage`, `waTemplateReview`, `fromEmail`, `waitDays`. Leave `reviewUrl` empty to link to the first product's review section, or set a Google Reviews / Facebook link.
- WhatsApp template `review_request` with body variables `{{1}}` name, `{{2}}` product, `{{3}}` link.
- The WooCommerce Trigger registers its webhook automatically on activation. Delivery is considered "completed" when the order status changes to `completed` in WooCommerce.

## Tips

- Use the trigger event `order.updated`. Orders edited many times only produce one request thanks to the meta check.
- Set `waitDays` to the usual delivery plus use time of your product (for example 7 days for fashion, 14 days for electronics).

## বাংলা সারসংক্ষেপ

অর্ডারের স্ট্যাটাস `completed` হলে ওয়ার্কফ্লোটি নির্দিষ্ট দিন (ডিফল্ট ৭ দিন) অপেক্ষা করে। এরপর অর্ডারটি এখনো completed আছে কি না দেখে গ্রাহককে হোয়াটসঅ্যাপ বা ইমেইলে রিভিউ লেখার লিংক পাঠায়। একই অর্ডারে দুইবার মেসেজ যাওয়া ঠেকাতে অর্ডার মেটা ডেটা (`_review_requested`) ব্যবহার করা হয় এবং অর্ডার নোটে রেকর্ড থাকে।
