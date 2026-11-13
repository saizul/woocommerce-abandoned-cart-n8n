import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNodeReferences, validateRepository, validateWorkflow } from '../scripts/validate-workflows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'workflows');
const files = fs.readdirSync(dir).sort().map((d) => path.join(dir, d, 'workflow.json'));
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

for (const file of files) {
  const label = path.basename(path.dirname(file));

  test(`${label}: passes validation`, () => {
    const { errors } = validateWorkflow(load(file), label);
    assert.deepEqual(errors, []);
  });

  test(`${label}: Code nodes are syntactically valid JavaScript`, () => {
    for (const n of load(file).nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      assert.doesNotThrow(() => new AsyncFunction('$input', '$', '$getWorkflowStaticData', n.parameters.jsCode), n.name);
    }
  });

  test(`${label}: every expression has balanced braces`, () => {
    const walk = (v) => {
      if (typeof v === 'string' && v.startsWith('=')) {
        assert.equal((v.match(/\{\{/g) || []).length, (v.match(/\}\}/g) || []).length, v.slice(0, 80));
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(load(file));
  });
}

test('detects a connection to a missing node', () => {
  const wf = load(files[0]);
  wf.connections['Config'].main[0][0].node = 'Does not exist';
  assert.ok(validateWorkflow(wf).errors.some((e) => e.includes('missing node')));
});

test('detects an orphan node', () => {
  const wf = load(files[0]);
  wf.nodes.push({ id: 'x1', name: 'Lonely', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [0, 0], parameters: {} });
  assert.ok(validateWorkflow(wf).errors.some((e) => e.includes('orphan')));
});

test('detects secret-looking strings', () => {
  const wf = load(files[3]);
  wf.nodes.find((n) => n.name === 'Send to Telegram').parameters.chatId = '123456789:' + 'A'.repeat(35);
  assert.ok(validateWorkflow(wf).errors.some((e) => e.includes('Telegram bot token')));
});

test('rejects real-looking credential ids', () => {
  const wf = load(files[0]);
  wf.nodes.find((n) => n.credentials).credentials[Object.keys(wf.nodes.find((n) => n.credentials).credentials)[0]].id = 'aB3dE5gH7jK9mN1p';
  assert.ok(validateWorkflow(wf).errors.some((e) => e.includes('placeholder')));
});

const errorsOf = (wf) => validateWorkflow(wf).errors;
const node = (wf, name) => wf.nodes.find((n) => n.name === name);

test('requires a credential name', () => {
  const wf = load(files[0]);
  delete node(wf, 'Email reminder 1').credentials.smtp.name;
  assert.ok(errorsOf(wf).some((e) => e.includes('credential "smtp" needs a descriptive "name"')));
});

test('rejects unpinned typeVersion values', () => {
  const wf = load(files[0]);
  node(wf, 'Config').typeVersion = 0;
  assert.ok(errorsOf(wf).some((e) => e.includes('pinned')));
});

test('detects expressions and Code nodes that reference a missing node', () => {
  const wf = load(files[0]);
  node(wf, 'Email reminder 1').parameters.toEmail = "={{ $('Normalise order').first().json.email }}";
  node(wf, 'Reminder 1 sent').parameters.jsCode = "const o = $node[\"Old name\"].json;\nreturn [{ json: o }];";
  const errors = errorsOf(wf);
  assert.ok(errors.some((e) => e.includes('references missing node "Normalise order"')));
  assert.ok(errors.some((e) => e.includes('references missing node "Old name"')));
});

test('detects references to sticky notes', () => {
  const wf = load(files[4]);
  node(wf, 'Send to Telegram').parameters.text = "={{ $('Setup notes').first().json.content }}";
  assert.ok(errorsOf(wf).some((e) => e.includes('sticky note "Setup notes"')));
});

test('finds node references in all supported forms', () => {
  assert.deepEqual(findNodeReferences(`$('A').first(); $("B b").item; $node['C'].json; $(\`D\`)`).sort(), ['A', 'B b', 'C', 'D']);
  assert.deepEqual(findNodeReferences('$(`Node ${i}`)'), []);
  assert.deepEqual(findNodeReferences('price: $5 (incl. tax)'), []);
});

test('detects unbalanced expression braces', () => {
  const wf = load(files[3]);
  node(wf, 'Send to Telegram').parameters.text = '={{ $json.message }';
  assert.ok(errorsOf(wf).some((e) => e.includes('unbalanced {{ }}')));
});

test('detects credentials embedded in URLs', () => {
  const wf = load(files[3]);
  const http = node(wf, 'Get today orders');
  http.parameters.url = 'https://admin:hunter2@your-store.example/wp-json/wc/v3/orders';
  assert.ok(errorsOf(wf).some((e) => e.includes('embedded username and password')));
  http.parameters.url = 'https://your-store.example/wp-json/wc/v3/orders?consumer_key=abc123&consumer_secret=def456';
  const errors = errorsOf(wf);
  assert.ok(errors.some((e) => e.includes('"consumer_key" carries a literal secret')));
  assert.ok(errors.some((e) => e.includes('"consumer_secret" carries a literal secret')));
  http.parameters.url = 'https://your-store.example/wp-json/wc/v3/orders?consumer_key=REPLACE_WITH_KEY';
  assert.deepEqual(errorsOf(wf), []);
});

test('detects literal secrets in HTTP query and header parameters', () => {
  const wf = load(files[3]);
  const params = node(wf, 'Get today orders').parameters;
  params.queryParameters.parameters.push({ name: 'consumer_secret', value: 'not-a-real-one' });
  params.headerParameters = { parameters: [{ name: 'Authorization', value: 'Basic abc' }, { name: 'X-Trace', value: 'ok' }] };
  const errors = errorsOf(wf);
  assert.ok(errors.some((e) => e.includes('queryParameters "consumer_secret" has a literal value')));
  assert.ok(errors.some((e) => e.includes('headerParameters "Authorization" has a literal value')));
  assert.ok(!errors.some((e) => e.includes('X-Trace')));
  params.queryParameters.parameters.at(-1).value = "={{ $('Config').first().json.siteUrl }}";
  params.headerParameters.parameters[0].value = 'REPLACE_WITH_TOKEN';
  assert.deepEqual(errorsOf(wf), []);
});

// Repository-level rules
const entries = () =>
  files.map((f) => ({
    label: path.basename(path.dirname(f)),
    wf: load(f),
    readme: fs.readFileSync(path.join(path.dirname(f), 'README.md'), 'utf8'),
  }));

test('repository: all workflows pass the cross-workflow checks', () => {
  assert.deepEqual(validateRepository(entries()).errors, []);
});

test('repository: every workflow needs a README with setup and Bangla summary', () => {
  const list = entries();
  list[0].readme = null;
  list[1].readme = list[1].readme.replace('## বাংলা সারসংক্ষেপ', '## Summary');
  list[2].readme = list[2].readme.replace('## Setup', '## Install');
  const { errors } = validateRepository(list);
  assert.ok(errors.some((e) => e.startsWith(`${list[0].label}: README.md is missing`)));
  assert.ok(errors.some((e) => e.startsWith(`${list[1].label}: README.md needs a "## বাংলা সারসংক্ষেপ"`)));
  assert.ok(errors.some((e) => e.startsWith(`${list[2].label}: README.md needs a "## Setup"`)));
});

test('repository: folder names must be numbered and unique', () => {
  const list = entries();
  list[1].label = list[0].label.slice(0, 3) + 'copy';
  list[2].label = 'My Workflow';
  const { errors } = validateRepository(list);
  assert.ok(errors.some((e) => e.includes('is already used by')));
  assert.ok(errors.some((e) => e.startsWith('My Workflow: folder name')));
});

test('repository: workflow names, webhook paths and webhook ids must be unique', () => {
  const list = entries();
  list[1].wf.name = list[0].wf.name;
  const hook = (i) => list[i].wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  const copy = { ...hook(0), parameters: { ...hook(0).parameters, path: '/woo-checkout-recovery/' }, name: 'Copy', webhookId: 'other-id' };
  list[3].wf.nodes.push(copy);
  list[4].wf.nodes.find((n) => n.webhookId).webhookId = hook(0).webhookId;
  const { errors } = validateRepository(list);
  assert.ok(errors.some((e) => e.includes(`workflow name "${list[0].wf.name}"`)));
  assert.ok(errors.some((e) => e.includes('webhook "POST woo-checkout-recovery"')));
  assert.ok(errors.some((e) => e.includes('webhookId of')));
});

test('repository: same path with a different HTTP method is allowed', () => {
  const list = entries();
  const cod = list[1].wf.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
  assert.equal(new Set(cod.map((n) => n.parameters.path)).size, 1);
  assert.deepEqual(validateRepository(list).errors, []);
});
