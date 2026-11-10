# 5. Low-stock alert to Telegram

Sends a Telegram message when a product's stock drops to a threshold or runs out, so you can reorder before customers see "out of stock".

## Flow

1. **Product updated** is a WooCommerce Trigger on `product.updated`. WooCommerce fires it when a product is edited and when stock changes after an order.
2. **Config** sets `siteUrl` and `threshold` (default 5).
3. **Check stock** compares `stock_quantity` with the threshold. It uses the workflow's static data to announce each product once per level (low, then out of stock) and to announce it again only after the stock recovered above the threshold. Updates that do not need an alert end here.
4. **Send to Telegram** posts an HTML message with the product name, SKU, remaining stock and an edit link.

Example message:

```
Low stock: Cotton Panjabi
SKU: PAN-001
Stock left: 4 (alert at 5 or less)
Edit product
```

## Setup

1. Create a bot with BotFather and add a **Telegram API** credential; put the chat id in **Send to Telegram** (see workflow 4 for how to find it).
2. Add a **WooCommerce API** credential to **Product updated**. The node registers its own webhook in your store.
3. Edit **Config**: your store URL and the threshold.
4. Activate the workflow. The remembered state is only kept for active (production) executions, so a manual test run alerts every time.

## Notes

- Only products with **Manage stock** enabled have a quantity. Products without it only alert when their status becomes `outofstock`.
- For variable products the alert follows the parent product's stock. Variation-level stock changes do not fire `product.updated` on every store, so check your own setup with a test order.
- The remembered list is capped at 2,000 products.
- Messages are HTML-escaped, so product names cannot break the formatting.

## বাংলা সারসংক্ষেপ

কোনো পণ্যের স্টক নির্ধারিত সীমায় (ডিফল্ট ৫) নেমে এলে বা শেষ হয়ে গেলে এই ওয়ার্কফ্লো Telegram-এ বার্তা পাঠায়। একই পণ্যের জন্য একই স্তরে বারবার বার্তা যায় না; স্টক আবার বাড়লে তবেই নতুন করে সতর্কতা আসে। পণ্যে "Manage stock" চালু থাকতে হবে।
