# WooCommerce Abandoned Cart and Order Automation for n8n

[![Validate workflows](https://github.com/saizul/woocommerce-abandoned-cart-n8n/actions/workflows/validate.yml/badge.svg)](https://github.com/saizul/woocommerce-abandoned-cart-n8n/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Four importable [n8n](https://n8n.io) workflows for WooCommerce stores: recover unpaid checkouts, confirm Cash on Delivery orders over WhatsApp, ask for reviews after delivery, and get a daily revenue summary in Telegram. Built for stores where WhatsApp and COD matter (Bangladesh, India, Pakistan, Middle East), with phone number normalization for `+880` numbers out of the box.

## Workflows

| # | Workflow | Trigger | What it does |
| --- | --- | --- | --- |
| 1 | [Abandoned checkout recovery](workflows/01-abandoned-checkout-recovery/README.md) | WooCommerce webhook (order created / updated) | Pending or failed order, wait, re-check via REST, WhatsApp or email reminder, wait, second reminder, log to Google Sheets |
| 2 | [COD order confirmation](workflows/02-cod-order-confirmation/README.md) | WooCommerce trigger (order created) + WhatsApp webhook | Adds COD orders to a call queue sheet, sends Confirm / Cancel buttons, updates order status and note on reply |
| 3 | [Post-delivery review request](workflows/03-post-delivery-review-request/README.md) | WooCommerce trigger (order updated) | When an order is completed, waits N days, then asks for a review via WhatsApp or email |
| 4 | [Daily revenue to Telegram](workflows/04-daily-revenue-telegram/README.md) | Schedule (21:00 daily) | Revenue, order counts, COD vs prepaid and top products for the day |

## Requirements

- n8n 1.x (self-hosted or cloud). Workflows 1 to 3 use Wait nodes, so n8n needs a database (the default SQLite is fine) and must be reachable from the internet for webhooks.
- WooCommerce 7+ with REST API keys (read/write) over HTTPS.
- Optional per workflow: WhatsApp Business Cloud API (Meta) with approved templates, Google Sheets, an SMTP account, a Telegram bot.

## Quick start

1. In n8n choose **Workflows > Import from file** and select a `workflow.json`.
2. Create the credentials listed in the workflow README and assign them to the nodes (imported nodes carry placeholder credential ids).
3. Open the **Config** node and replace every `REPLACE_WITH_*` and `your-store.example` value.
4. Configure the WooCommerce webhook if the workflow uses a webhook trigger.
5. Test with a real order in a staging store, then activate.

## Credentials used

| Credential type | Used for | Notes |
| --- | --- | --- |
| HTTP Basic Auth | WooCommerce REST API | Username is the consumer key, password is the consumer secret |
| HTTP Header Auth | WhatsApp Cloud API | Name `Authorization`, value `Bearer <permanent token>` |
| WooCommerce API | WooCommerce Trigger node | Registers its own webhook in your store |
| Google Sheets OAuth2 | Logs and call queue | |
| SMTP | Email reminders | |
| Telegram API | Daily summary | Token from BotFather |

No keys, tokens or ids are stored in the JSON files. Credentials are referenced by type and a placeholder id only.

## Validate and test

```bash
npm run validate   # structure, connections, orphans, secret scan
npm test           # validator tests and Code node syntax checks
```

The validator has no dependencies. It checks that each file parses, that nodes have the required fields and unique ids/names, that all connections point to existing nodes, that no node is orphaned or unreachable from a trigger, that credential ids are placeholders, and that no string looks like a secret. The same checks run in [GitHub Actions](.github/workflows/validate.yml).

## Notes on WhatsApp

Messages sent outside the 24 hour customer-service window must use pre-approved templates, so reminders and confirmations use template messages. Template names and languages are set in each workflow's Config node. Only message customers who have given you their number during checkout and follow Meta's commerce and messaging policies.

## Author

Saizul Amin, e-commerce web developer and automation specialist from Bangladesh. [saizul.com](https://saizul.com)

## License

[MIT](LICENSE)
