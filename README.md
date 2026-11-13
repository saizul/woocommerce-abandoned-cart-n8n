# WooCommerce Abandoned Cart and Order Automation for n8n

[![Validate workflows](https://github.com/saizul/woocommerce-abandoned-cart-n8n/actions/workflows/validate.yml/badge.svg)](https://github.com/saizul/woocommerce-abandoned-cart-n8n/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Six importable [n8n](https://n8n.io) workflows for WooCommerce stores: recover unpaid checkouts, confirm Cash on Delivery orders over WhatsApp, ask for reviews after delivery, get a daily revenue summary in Telegram, receive low-stock alerts in Telegram, and win back customers who stopped ordering. Built for stores where WhatsApp and COD matter (Bangladesh, India, Pakistan, Middle East), with phone number normalization for `+880` numbers out of the box.

## Workflows

| # | Workflow | Trigger | What it does |
| --- | --- | --- | --- |
| 1 | [Abandoned checkout recovery](workflows/01-abandoned-checkout-recovery/README.md) | WooCommerce webhook (order created / updated) | Pending or failed order, wait, re-check via REST, WhatsApp or email reminder, wait, second reminder, log to Google Sheets |
| 2 | [COD order confirmation](workflows/02-cod-order-confirmation/README.md) | WooCommerce trigger (order created) + WhatsApp webhook | Adds COD orders to a call queue sheet, sends Confirm / Cancel buttons, updates order status and note on reply |
| 3 | [Post-delivery review request](workflows/03-post-delivery-review-request/README.md) | WooCommerce trigger (order updated) | When an order is completed, waits N days, then asks for a review via WhatsApp or email |
| 4 | [Daily revenue to Telegram](workflows/04-daily-revenue-telegram/README.md) | Schedule (21:00 daily) | Revenue, order counts, COD vs prepaid and top products for the day |
| 5 | [Low-stock alert to Telegram](workflows/05-low-stock-telegram-alert/README.md) | WooCommerce trigger (product updated) | Alerts once when a product reaches the stock threshold and once when it sells out, and again only after it was restocked |
| 6 | [Win-back lapsed customers](workflows/06-win-back-lapsed-customers/README.md) | Schedule (Monday 10:00 weekly) | Finds customers with no order for 90 days, sends one WhatsApp or email coupon per customer with a 180-day cooldown, logs to Google Sheets |

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
| WooCommerce API | WooCommerce Trigger node (workflows 2, 3, 5) | Registers its own webhook in your store |
| Google Sheets OAuth2 | Logs and call queue | |
| SMTP | Email reminders and win-back offers | |
| Telegram API | Daily summary, low-stock alerts | Token from BotFather |

No keys, tokens or ids are stored in the JSON files. Credentials are referenced by type and a placeholder id only.

## Validate and test

```bash
npm run validate   # structure, connections, node references, secret scan, repository layout
npm test           # validator tests, Code node syntax checks and behaviour tests for workflows 5 and 6
```

The validator has no dependencies and needs Node.js 20 or newer. For each workflow it checks that:

- the file parses and every node has the required fields, a pinned `typeVersion` and a unique id and name;
- all connections point to existing nodes and no node is orphaned or unreachable from a trigger;
- every `$('Node name')` or `$node["Node name"]` reference in expressions and Code nodes points to an existing node (catches renamed nodes), and `{{ }}` braces are balanced;
- credentials use a placeholder id and a descriptive name;
- no string looks like a secret, no URL embeds `user:password@` or a literal `consumer_key`, `token` or similar query value, and HTTP Request query and header parameters such as `Authorization` are not hard-coded.

Across the repository it checks that each folder is named `NN-short-name` with a unique number, has a `README.md` with a `## Setup` section and a Bangla summary, and that workflow names, webhook method and path pairs and `webhookId`s are unique, so two imported workflows cannot clash on activation. The same checks run in [GitHub Actions](.github/workflows/validate.yml) on Node.js 20, 22 and 24.

## Notes on WhatsApp

Messages sent outside the 24 hour customer-service window must use pre-approved templates, so reminders and confirmations use template messages. Template names and languages are set in each workflow's Config node. Only message customers who have given you their number during checkout and follow Meta's commerce and messaging policies.

## Author

Saizul Amin, e-commerce web developer and automation specialist from Bangladesh. [saizul.com](https://saizul.com)

## License

[MIT](LICENSE)
