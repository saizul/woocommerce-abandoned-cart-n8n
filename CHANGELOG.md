# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Workflow 5: low-stock alert to Telegram from WooCommerce `product.updated`, with a configurable threshold and per-product deduplication (alerts once per level until the stock recovers).
- Behavioural tests for the workflow 5 Code node.
- Workflow 6: win-back of lapsed customers. A weekly schedule loads the last year of orders, finds customers whose last paid order is older than `lapsedDays` (90) and who have no newer order, and sends each one a WhatsApp template or email with a coupon code. A per-customer cooldown (180 days), an opt-out list and a per-run cap keep it from over-messaging. Every message is logged to Google Sheets.
- Behavioural tests for the workflow 6 Code nodes.
- Validator: `$('Node name')` and `$node["Node name"]` references must point to existing nodes, expression braces must be balanced, credentials need a name, `typeVersion` must be a released version.
- Validator: rejects URLs with embedded `user:password@` or literal secret query values, and HTTP Request query or header parameters such as `Authorization` or `consumer_secret` with hard-coded values.
- Validator: repository checks for `NN-short-name` folder names, a `README.md` with Setup and Bangla summary sections per workflow, and unique workflow names, webhook method and path pairs and `webhookId`s.

### Changed

- CI runs on Node.js 20, 22 and 24 (Node.js 18 is end-of-life); `engines` now requires Node.js 20 or newer.
- `npm test` lists the test files explicitly instead of relying on a shell glob.

## [1.0.0] - 2026-11-09

### Added

- Workflow 1: abandoned checkout recovery with two reminders and Google Sheets log.
- Workflow 2: COD confirmation call queue, WhatsApp reply buttons and order updates.
- Workflow 3: post-delivery review request.
- Workflow 4: daily revenue summary to Telegram.
- Dependency-free validator, tests and GitHub Actions workflow.
