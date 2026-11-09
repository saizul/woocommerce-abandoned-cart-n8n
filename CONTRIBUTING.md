# Contributing

Improvements and new workflows are welcome.

## Rules for workflow files

- Export from n8n 1.x, then remove `meta.instanceId`, `pinData`, execution data and any real ids.
- Set `"active": false`.
- Credentials must keep placeholder ids starting with `REPLACE_WITH_`.
- Put every store-specific value in a `Config` node as a placeholder (for example `https://your-store.example`).
- Reference nodes by name in expressions and keep node names unique.
- Add a `README.md` next to the workflow with setup, credentials, trigger configuration and a Bangla summary.

## Checks

```bash
npm run validate
npm test
```

Both must pass before you open a pull request.
