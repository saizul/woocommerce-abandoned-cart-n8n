import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorkflow } from '../scripts/validate-workflows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'workflows');
const files = fs.readdirSync(dir).map((d) => path.join(dir, d, 'workflow.json'));
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
