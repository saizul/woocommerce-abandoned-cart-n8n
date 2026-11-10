import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflows/05-low-stock-telegram-alert/workflow.json'), 'utf8'));
const code = wf.nodes.find((n) => n.name === 'Check stock').parameters.jsCode;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('$input', '$', '$getWorkflowStaticData', code);

const config = { siteUrl: 'https://shop.example/', threshold: 5 };

// Runs the Code node like n8n would, sharing the same static data between calls.
function makeRunner(cfg = config) {
  const state = {};
  const call = async (product) => {
    const nodes = { Config: [{ json: cfg }], 'Product updated': [{ json: product }] };
    const $ = (name) => ({ first: () => nodes[name][0] });
    return run({ all: () => [] }, $, () => state);
  };
  return { call, state };
}

const product = (over = {}) => ({ id: 42, name: 'Cotton Panjabi', sku: 'PAN-001', manage_stock: true, stock_quantity: 10, stock_status: 'instock', backorders: 'no', ...over });

test('no alert while stock is above the threshold', async () => {
  const { call } = makeRunner();
  assert.deepEqual(await call(product()), []);
});

test('alerts once when stock reaches the threshold', async () => {
  const { call } = makeRunner();
  const first = await call(product({ stock_quantity: 5 }));
  assert.equal(first.length, 1);
  assert.equal(first[0].json.level, 'low');
  assert.match(first[0].json.message, /Low stock<\/b>: Cotton Panjabi/);
  assert.match(first[0].json.message, /Stock left: 5/);
  assert.match(first[0].json.message, /https:\/\/shop\.example\/wp-admin\/post\.php\?post=42&amp;action=edit/);
  assert.deepEqual(await call(product({ stock_quantity: 4 })), []);
});

test('escalates from low to out of stock, then stays quiet', async () => {
  const { call } = makeRunner();
  await call(product({ stock_quantity: 3 }));
  const out = await call(product({ stock_quantity: 0, stock_status: 'outofstock' }));
  assert.equal(out.length, 1);
  assert.equal(out[0].json.level, 'out');
  assert.match(out[0].json.message, /Out of stock<\/b>/);
  assert.deepEqual(await call(product({ stock_quantity: 0, stock_status: 'outofstock' })), []);
});

test('alerts again after stock recovered', async () => {
  const { call, state } = makeRunner();
  await call(product({ stock_quantity: 2 }));
  assert.equal(state.alerted['42'], 'low');
  assert.deepEqual(await call(product({ stock_quantity: 50 })), []);
  assert.equal(state.alerted['42'], undefined);
  assert.equal((await call(product({ stock_quantity: 1 }))).length, 1);
});

test('product without managed stock only alerts when out of stock', async () => {
  const { call } = makeRunner();
  assert.deepEqual(await call(product({ manage_stock: false, stock_quantity: null })), []);
  const out = await call(product({ manage_stock: false, stock_quantity: null, stock_status: 'outofstock' }));
  assert.equal(out[0].json.level, 'out');
});

test('uses the configured threshold and falls back to 5', async () => {
  assert.equal((await makeRunner({ ...config, threshold: 20 }).call(product({ stock_quantity: 15 }))).length, 1);
  assert.equal((await makeRunner({ siteUrl: 'https://shop.example' }).call(product({ stock_quantity: 5 }))).length, 1);
  assert.deepEqual(await makeRunner({ siteUrl: 'https://shop.example' }).call(product({ stock_quantity: 6 })), []);
});

test('escapes HTML in product names and ignores empty payloads', async () => {
  const { call } = makeRunner();
  const res = await call(product({ name: '<b>Evil</b> & "Co"', stock_quantity: 1 }));
  assert.ok(!res[0].json.message.includes('<b>Evil</b>'));
  assert.match(res[0].json.message, /&lt;b&gt;Evil&lt;\/b&gt; &amp; &quot;Co&quot;/);
  assert.deepEqual(await call({}), []);
});

test('remembered products are capped', async () => {
  const { call, state } = makeRunner();
  for (let i = 1; i <= 2005; i++) await call(product({ id: i, stock_quantity: 1 }));
  assert.ok(Object.keys(state.alerted).length <= 2000);
});
