# Contributing

Improvements and new workflows are welcome.

## Rules for workflow files

- Export from n8n 1.x, then remove `meta.instanceId`, `pinData`, execution data and any real ids.
- Set `"active": false`.
- Credentials must keep placeholder ids starting with `REPLACE_WITH_`.
- Put every store-specific value in a `Config` node as a placeholder (for example `https://your-store.example`).
- Reference nodes by name in expressions and keep node names unique.
- Put each workflow in its own folder named `NN-short-name` (next free number, lowercase, dashes) as `workflow.json`.
- Add a `README.md` next to the workflow with a `## Setup` section (credentials, trigger configuration) and a `## বাংলা সারসংক্ষেপ` summary.
- Keep workflow names, webhook paths and `webhookId`s unique across the repository.
- Never hard-code keys or tokens in URLs, query parameters or headers; use an n8n credential instead.
- If the workflow has a Code node with real logic, add behaviour tests in `test/` and list the file in the `test` script in `package.json`.

## Checks

```bash
npm run validate
npm test
```

Both must pass before you open a pull request.
