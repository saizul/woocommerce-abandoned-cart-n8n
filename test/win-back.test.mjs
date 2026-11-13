import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflows/06-win-back-lapsed-customers/workflow.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const compile = (name) => new AsyncFunction('$input', '$', '$getWorkflowStaticData', wf.nodes.find((n) => n.name === name).parameters.jsCode);
const rangeCode = compile('Date range');
const findCode = compile('Find lapsed customers');

const configNode = wf.nodes.find((n) => n.name === 'Config');
const defaults = Object.fromEntries(configNode.parameters.assignments.assignments.map((a) => [a.name, a.value]));
const DAY = 24 * 3600 * 1000;
const daysAgo = (d) => new Date(Date.now() - d * DAY).toISOString().replace(/\.\d+Z$/, '');

let nextId = 1;
const order = (email, days, over = {}) => ({
  id: nextId++,
  status: 'completed',
  total: '1000.00',
  currency: 'BDT',
  currency_symbol: '৳',
  date_created_gmt: daysAgo(days),
  billing: { first_name: 'Rahim', email, phone: '01711000000' },
  ...over,
});

// Runs Date range and Find lapsed customers like n8n would, sharing static data between runs.
function makeRunner(over = {}) {
  const cfg = { ...defaults, ...over };
  const state = {};
  const call = async (orders) => {
    const nodes = { Config: [{ json: cfg }] };
    const $ = (name) => ({ first: () => nodes[name][0] });
    nodes['Date range'] = await rangeCode({ all: () => [] }, $, () => state);
    return findCode({ all: () => orders.map((json) => ({ json })) }, $, () => state);
  };
  return { call, state };
}
const unique = (o, phone) => ({ ...o, billing: { ...o.billing, phone } });

test('Config ships with safe defaults', () => {
  assert.equal(defaults.lapsedDays, 90);
  assert.equal(defaults.cooldownDays, 180);
  assert.ok(defaults.lookbackDays > defaults.lapsedDays);
  assert.equal(defaults.excludeEmails, '');
});

test('Date range always reaches further back than lapsedDays', async () => {
  const cfg = { ...defaults, lapsedDays: 400, lookbackDays: 30 };
  const $ = () => ({ first: () => ({ json: cfg }) });
  const [{ json }] = await rangeCode({ all: () => [] }, $, () => ({}));
  assert.equal(json.lookbackDays, 401);
  assert.ok(Date.now() - Date.parse(json.after) >= 400 * DAY);
});

test('picks a customer whose last paid order is older than lapsedDays', async () => {
  const { call } = makeRunner();
  const res = await call([order('a@x.test', 120), order('a@x.test', 200)]);
  assert.equal(res.length, 1);
  const c = res[0].json;
  assert.equal(c.email, 'a@x.test');
  assert.equal(c.phone, '8801711000000');
  assert.equal(c.channel, 'whatsapp');
  assert.equal(c.orders, 2);
  assert.equal(c.totalSpent, '৳2000.00');
  assert.ok(c.daysSinceLastOrder >= 119 && c.daysSinceLastOrder <= 120);
  assert.equal(c.waMessage.template.name, 'win_back_offer');
  assert.deepEqual(c.waMessage.template.components[0].parameters.map((p) => p.text), ['Rahim', 'WELCOMEBACK10', 'https://your-store.example/shop/']);
  assert.match(c.emailHtml, /<b>WELCOMEBACK10<\/b>/);
});

test('skips customers with a recent order of any status', async () => {
  const { call } = makeRunner();
  assert.deepEqual(await call([order('a@x.test', 120), order('a@x.test', 10)]), []);
  assert.deepEqual(await call([order('b@x.test', 120), order('b@x.test', 5, { status: 'failed' })]), []);
});

test('a recent order matched only by phone also counts as active', async () => {
  const { call } = makeRunner();
  const recentGuest = order('', 3, { status: 'pending' });
  assert.deepEqual(await call([order('a@x.test', 150), recentGuest]), []);
});

test('ignores unpaid orders and respects minOrders', async () => {
  const { call } = makeRunner();
  assert.deepEqual(await call([order('a@x.test', 120, { status: 'cancelled' })]), []);
  const repeat = makeRunner({ minOrders: 2 });
  assert.deepEqual(await repeat.call([order('a@x.test', 120)]), []);
  assert.equal((await repeat.call([order('a@x.test', 120), order('a@x.test', 300)])).length, 1);
});

test('does not contact the same customer again within cooldownDays', async () => {
  const { call, state } = makeRunner();
  const orders = [order('a@x.test', 120)];
  assert.equal((await call(orders)).length, 1);
  assert.ok(state.contacted['a@x.test']);
  assert.ok(state.contacted['8801711000000']);
  assert.deepEqual(await call(orders), []);
  state.contacted['a@x.test'] = Date.now() - 181 * DAY;
  state.contacted['8801711000000'] = Date.now() - 181 * DAY;
  assert.equal((await call(orders)).length, 1);
});

test('honours excludeEmails, case-insensitively', async () => {
  const { call } = makeRunner({ excludeEmails: 'Opt.Out@x.test; other@x.test' });
  assert.deepEqual(await call([order('opt.out@X.test', 120)]), []);
});

test('caps messages per run and prefers the biggest spenders', async () => {
  const { call } = makeRunner({ maxPerRun: 2 });
  const res = await call([
    unique(order('small@x.test', 120, { total: '100' }), '01711000001'),
    unique(order('big@x.test', 120, { total: '9000' }), '01711000002'),
    unique(order('mid@x.test', 120, { total: '500' }), '01711000003'),
  ]);
  assert.deepEqual(res.map((r) => r.json.email), ['big@x.test', 'mid@x.test']);
});

test('falls back to email without a phone, and skips customers with no contact', async () => {
  const { call } = makeRunner();
  const res = await call([unique(order('a@x.test', 120), '')]);
  assert.equal(res[0].json.channel, 'email');
  assert.deepEqual(await makeRunner({ channel: 'email' }).call([unique(order('', 120), '01711000009')]), []);
});

test('works without a coupon and escapes customer names', async () => {
  const { call } = makeRunner({ couponCode: '' });
  const res = await call([order('a@x.test', 120, { billing: { first_name: '<i>Evil</i>', email: 'a@x.test', phone: '' } })]);
  const c = res[0].json;
  assert.ok(!c.emailHtml.includes('<i>Evil</i>'));
  assert.match(c.emailHtml, /&lt;i&gt;Evil&lt;\/i&gt;/);
  assert.ok(!c.emailHtml.includes('Use code'));
  assert.equal(c.emailSubject, 'We miss you, <i>Evil</i>');
});

test('ignores empty pages and malformed orders', async () => {
  const { call } = makeRunner();
  assert.deepEqual(await call([{}, { id: 9, billing: {} }, order('a@x.test', 120, { date_created_gmt: 'nope' })]), []);
});
