# 4. Daily revenue summary to Telegram

Posts a short sales report to a Telegram chat every evening.

## Flow

1. **Every day 21:00** (workflow time zone `Asia/Dhaka`).
2. **Config** sets `siteUrl`, `timezone`, `utcOffset` and `currencySymbol`.
3. **Date range** computes today's start and end as UTC timestamps.
4. **Get today orders** calls `GET /wp-json/wc/v3/orders` with `after`, `before`, `per_page=100` and pagination (up to 20 pages).
5. **Build summary** counts revenue from `processing`, `completed` and `on-hold` orders, splits COD vs prepaid, counts pending, failed and cancelled orders, and lists the top 3 products.
6. **Send to Telegram** posts the HTML message.

Example message:

```
Daily summary - 2026-11-09

Revenue: ৳48,500 from 17 orders
Average order: ৳2,853
COD: 12 (৳33,200)  |  Prepaid: 5 (৳15,300)

Pending payment: 3  |  Failed: 1  |  Cancelled: 2

Top products
1. Cotton Panjabi x 6
...
```

## Setup

1. Create a bot with BotFather and add a **Telegram API** credential.
2. Get the chat id (send a message to the bot or add it to a group, then open `https://api.telegram.org/bot<token>/getUpdates`) and put it in **Send to Telegram**.
3. Add a **HTTP Basic Auth** credential (consumer key and secret) to **Get today orders**.
4. Edit **Config**. Change the time of the Schedule Trigger if you want a different hour.

## Notes

- Revenue is the sum of order totals (including shipping and tax) for the listed statuses.
- Orders are filtered by creation date.
- Refunds are not subtracted in this version.

## বাংলা সারসংক্ষেপ

প্রতিদিন রাত ৯টায় (Asia/Dhaka সময়) ওয়ার্কফ্লোটি WooCommerce REST API থেকে আজকের সব অর্ডার নিয়ে আসে, মোট বিক্রি, অর্ডার সংখ্যা, গড় অর্ডার মূল্য, COD বনাম প্রিপেইড, pending/failed/cancelled সংখ্যা এবং শীর্ষ ৩টি পণ্য হিসাব করে এবং Telegram-এ সারসংক্ষেপ পাঠায়।
