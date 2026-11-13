#!/usr/bin/env node
// Dependency-free validator for the n8n workflow exports in this repository.
// Usage: node scripts/validate-workflows.mjs [dir-or-file ...]   (defaults to ./workflows)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SECRET_PATTERNS = [
  [/\bck_[a-f0-9]{30,}\b/i, 'WooCommerce consumer key'],
  [/\bcs_[a-f0-9]{30,}\b/i, 'WooCommerce consumer secret'],
  [/\bEAA[A-Za-z0-9]{20,}/, 'Meta access token'],
  [/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, 'Telegram bot token'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i, 'Bearer token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, 'JWT'],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/, 'Google API key'],
  [/\bsk-[A-Za-z0-9]{20,}\b/, 'API secret key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b[a-f0-9]{40,}\b/i, 'long hex string'],
  [/\b1[A-Za-z0-9_-]{43}\b/, 'Google spreadsheet id (use a placeholder)'],
];

const TRIGGER = /(trigger|webhook)$/i;
const NOTE_TYPE = 'n8n-nodes-base.stickyNote';
const PLACEHOLDER_ID = /^(REPLACE|YOUR|PLACEHOLDER)/i;
const WEBHOOK_TYPE = 'n8n-nodes-base.webhook';
const BANGLA_SUMMARY = '## বাংলা সারসংক্ষেপ';
const WORKFLOW_DIR = /^(\d{2})-[a-z0-9]+(-[a-z0-9]+)*$/;

// Query or header parameters that must come from a credential, never from a literal value.
const SECRET_PARAM = /^(consumer_key|consumer_secret|access_token|api[_-]?key|apikey|token|secret|client_secret|password|authorization|x-api-key)$/i;
// Literal secrets inside URLs: https://user:pass@host and ?consumer_secret=...
const URL_USERINFO = /\bhttps?:\/\/[^\s/:@"'{}()]+:[^\s/@"'{}()]+@/i;
const URL_SECRET_QUERY = /[?&](consumer_key|consumer_secret|access_token|api_?key|token|client_secret|password)=([^&#\s"'{}()+]+)/gi;

// $('Node name') and $node["Node name"] references in expressions and Code nodes.
const NODE_REFS = [/\$\(\s*(['"`])((?:(?!\1).)+?)\1\s*\)/g, /\$node\[\s*(['"])((?:(?!\1).)+?)\1\s*\]/g];

const isPlaceholder = (v) => PLACEHOLDER_ID.test(String(v)) || /^<[^>]+>$/.test(String(v));

export function findNodeReferences(text) {
  const names = new Set();
  for (const re of NODE_REFS) {
    for (const m of String(text).matchAll(re)) {
      if (!m[2].includes('${')) names.add(m[2]);
    }
  }
  return [...names];
}

function collectFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(target, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : collectFiles(p);
    return e.name.endsWith('.json') ? [p] : [];
  });
}

function walkStrings(value, visit, trail = '') {
  if (typeof value === 'string') visit(value, trail);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, visit, `${trail}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, visit, trail ? `${trail}.${k}` : k);
  }
}

const has = (obj, ...keys) => keys.every((k) => obj && obj[k] !== undefined && obj[k] !== '');

// Type-specific minimum parameters.
const REQUIRED_PARAMS = {
  'n8n-nodes-base.webhook': ['httpMethod', 'path'],
  'n8n-nodes-base.wait': ['resume'],
  'n8n-nodes-base.httpRequest': ['url'],
  'n8n-nodes-base.if': ['conditions'],
  'n8n-nodes-base.code': ['jsCode'],
  'n8n-nodes-base.googleSheets': ['documentId', 'sheetName'],
  'n8n-nodes-base.telegram': ['chatId'],
  'n8n-nodes-base.emailSend': ['fromEmail', 'toEmail', 'subject'],
  'n8n-nodes-base.scheduleTrigger': ['rule'],
  'n8n-nodes-base.wooCommerceTrigger': ['event'],
  'n8n-nodes-base.respondToWebhook': ['respondWith'],
};

export function validateWorkflow(wf, label = 'workflow') {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`${label}: ${m}`);

  if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return { errors: [`${label}: root must be an object`], warnings };
  if (typeof wf.name !== 'string' || !wf.name.trim()) err('missing "name"');
  if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) { err('"nodes" must be a non-empty array'); return { errors, warnings }; }
  if (!wf.connections || typeof wf.connections !== 'object' || Array.isArray(wf.connections)) err('"connections" must be an object');
  if (wf.active === true) warnings.push(`${label}: exported with "active": true (should be false in a template)`);
  if (wf.meta && wf.meta.instanceId) err('"meta.instanceId" must be removed (identifies your n8n instance)');
  if (wf.pinData && Object.keys(wf.pinData).length > 0) err('"pinData" must be empty (may contain real customer data)');
  if (wf.settings?.executionOrder !== 'v1') warnings.push(`${label}: settings.executionOrder should be "v1"`);

  const byName = new Map();
  const ids = new Set();

  wf.nodes.forEach((n, i) => {
    const tag = `nodes[${i}]${n && n.name ? ` "${n.name}"` : ''}`;
    for (const f of ['id', 'name', 'type']) {
      if (typeof n[f] !== 'string' || !n[f]) err(`${tag}: missing string field "${f}"`);
    }
    if (typeof n.typeVersion !== 'number') err(`${tag}: "typeVersion" must be a number`);
    if (!Array.isArray(n.position) || n.position.length !== 2 || !n.position.every(Number.isFinite)) err(`${tag}: "position" must be [x, y]`);
    if (!n.parameters || typeof n.parameters !== 'object' || Array.isArray(n.parameters)) err(`${tag}: "parameters" must be an object`);
    if (typeof n.type === 'string' && !/^(n8n-nodes-base|@n8n\/n8n-nodes-langchain)\.[A-Za-z0-9]+$/.test(n.type)) {
      err(`${tag}: unexpected node type "${n.type}"`);
    }
    if (n.id) { if (ids.has(n.id)) err(`${tag}: duplicate node id "${n.id}"`); ids.add(n.id); }
    if (n.name) { if (byName.has(n.name)) err(`${tag}: duplicate node name`); byName.set(n.name, n); }

    for (const key of REQUIRED_PARAMS[n.type] ?? []) {
      if (!has(n.parameters, key)) err(`${tag}: parameter "${key}" is required for ${n.type}`);
    }
    if (n.type === 'n8n-nodes-base.webhook' && n.parameters?.responseMode === 'responseNode') {
      // needs a Respond to Webhook node somewhere; checked below
    }
    if (n.typeVersion !== undefined && typeof n.typeVersion === 'number' && !(n.typeVersion >= 1)) {
      err(`${tag}: "typeVersion" must be pinned to a released version (>= 1)`);
    }
    if (n.credentials !== undefined && (!n.credentials || typeof n.credentials !== 'object' || Array.isArray(n.credentials))) {
      err(`${tag}: "credentials" must be an object`);
    } else if (n.credentials) {
      for (const [ctype, c] of Object.entries(n.credentials)) {
        if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !PLACEHOLDER_ID.test(c.id)) {
          err(`${tag}: credential "${ctype}" id must be a placeholder starting with REPLACE/YOUR/PLACEHOLDER`);
        }
        if (!c || typeof c.name !== 'string' || !c.name.trim()) {
          err(`${tag}: credential "${ctype}" needs a descriptive "name" so it can be matched after import`);
        }
      }
    }
    if (n.type === 'n8n-nodes-base.httpRequest') checkHttpSecrets(n.parameters ?? {}, (m) => err(`${tag}: ${m}`));
  });

  // connections reference existing nodes
  const incoming = new Map([...byName.keys()].map((k) => [k, 0]));
  const outgoing = new Map([...byName.keys()].map((k) => [k, []]));
  for (const [from, conn] of Object.entries(wf.connections ?? {})) {
    if (!byName.has(from)) { err(`connections: source node "${from}" does not exist`); continue; }
    if (!conn || typeof conn !== 'object') { err(`connections["${from}"] must be an object`); continue; }
    for (const [kind, outputs] of Object.entries(conn)) {
      if (!Array.isArray(outputs)) { err(`connections["${from}"].${kind} must be an array of arrays`); continue; }
      outputs.forEach((targets, oi) => {
        if (!Array.isArray(targets)) { err(`connections["${from}"].${kind}[${oi}] must be an array`); return; }
        for (const t of targets) {
          if (!t || typeof t.node !== 'string' || typeof t.type !== 'string' || !Number.isInteger(t.index)) {
            err(`connections["${from}"].${kind}[${oi}]: target needs {node, type, index}`);
          } else if (!byName.has(t.node)) {
            err(`connections["${from}"] points to missing node "${t.node}"`);
          } else {
            incoming.set(t.node, incoming.get(t.node) + 1);
            outgoing.get(from).push(t.node);
          }
        }
      });
    }
  }

  // triggers, orphans, reachability
  const active = [...byName.values()].filter((n) => n.type !== NOTE_TYPE);
  const triggers = active.filter((n) => TRIGGER.test(n.type));
  if (triggers.length === 0) err('workflow has no trigger node');
  for (const n of active) {
    const inc = incoming.get(n.name) ?? 0;
    const out = outgoing.get(n.name)?.length ?? 0;
    if (inc === 0 && out === 0) err(`orphan node "${n.name}" (no connections)`);
  }
  const seen = new Set();
  const queue = triggers.map((t) => t.name);
  while (queue.length) {
    const cur = queue.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    queue.push(...(outgoing.get(cur) ?? []));
  }
  for (const n of active) {
    if (!seen.has(n.name) && (incoming.get(n.name) ?? 0) + (outgoing.get(n.name)?.length ?? 0) > 0) {
      err(`node "${n.name}" is not reachable from any trigger`);
    }
  }
  const usesResponseNode = active.some((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters?.responseMode === 'responseNode');
  if (usesResponseNode && !active.some((n) => n.type === 'n8n-nodes-base.respondToWebhook')) {
    err('a webhook uses responseMode "responseNode" but there is no Respond to Webhook node');
  }

  // expressions and node references
  wf.nodes.forEach((n, i) => {
    if (!n || n.type === NOTE_TYPE) return;
    const tag = `nodes[${i}]${n.name ? ` "${n.name}"` : ''}`;
    walkStrings(n.parameters ?? {}, (s, trail) => {
      if (s.startsWith('=')) {
        const open = (s.match(/\{\{/g) || []).length;
        const close = (s.match(/\}\}/g) || []).length;
        if (open !== close) err(`${tag}: unbalanced {{ }} in expression at parameters.${trail}`);
      }
      if (s.startsWith('=') || n.type === 'n8n-nodes-base.code') {
        for (const ref of findNodeReferences(s)) {
          if (!byName.has(ref)) err(`${tag}: references missing node "${ref}" at parameters.${trail}`);
          else if (byName.get(ref).type === NOTE_TYPE) err(`${tag}: references sticky note "${ref}" at parameters.${trail}`);
        }
      }
    });
  });

  // secret-looking strings
  walkStrings(wf, (s, trail) => {
    for (const [re, what] of SECRET_PATTERNS) {
      if (re.test(s)) err(`possible ${what} at ${trail}`);
    }
    if (URL_USERINFO.test(s)) err(`URL with embedded username and password at ${trail} (use a credential)`);
    for (const m of s.matchAll(URL_SECRET_QUERY)) {
      if (!isPlaceholder(m[2])) err(`URL query parameter "${m[1]}" carries a literal secret at ${trail} (use a credential)`);
    }
  });

  return { errors, warnings };
}

// HTTP Request nodes must not carry keys or tokens as literal query or header values.
function checkHttpSecrets(params, report) {
  for (const group of ['queryParameters', 'headerParameters', 'bodyParameters']) {
    for (const p of params[group]?.parameters ?? []) {
      if (!p || typeof p.name !== 'string' || !SECRET_PARAM.test(p.name.trim())) continue;
      const v = p.value;
      if (typeof v === 'string' && v !== '' && !v.startsWith('=') && !isPlaceholder(v)) {
        report(`${group} "${p.name}" has a literal value (move it to a credential)`);
      }
    }
  }
}

// Checks that span several workflows: folder naming, README per workflow, unique names and webhook paths.
// entries: [{ label, wf, readme }] where readme is the README.md text or null when it is missing.
export function validateRepository(entries) {
  const errors = [];
  const names = new Map();
  const numbers = new Map();
  const paths = new Map();
  const webhookIds = new Map();

  for (const { label, wf, readme } of entries) {
    const dir = WORKFLOW_DIR.exec(label);
    if (!dir) errors.push(`${label}: folder name must look like "NN-short-name" (lowercase, dashes)`);
    else if (numbers.has(dir[1])) errors.push(`${label}: number ${dir[1]} is already used by ${numbers.get(dir[1])}`);
    else numbers.set(dir[1], label);

    if (typeof readme !== 'string') errors.push(`${label}: README.md is missing next to workflow.json`);
    else {
      if (!/^# \S/m.test(readme)) errors.push(`${label}: README.md needs a "# " title`);
      if (!readme.includes('## Setup')) errors.push(`${label}: README.md needs a "## Setup" section`);
      if (!readme.includes(BANGLA_SUMMARY)) errors.push(`${label}: README.md needs a "${BANGLA_SUMMARY}" section`);
    }

    if (!wf || !Array.isArray(wf.nodes)) continue;
    if (typeof wf.name === 'string' && wf.name.trim()) {
      if (names.has(wf.name)) errors.push(`${label}: workflow name "${wf.name}" is also used by ${names.get(wf.name)}`);
      else names.set(wf.name, label);
    }
    for (const n of wf.nodes) {
      if (!n || typeof n !== 'object') continue;
      if (n.type === WEBHOOK_TYPE && typeof n.parameters?.path === 'string') {
        const key = `${(n.parameters.httpMethod || 'GET').toUpperCase()} ${n.parameters.path.replace(/^\/+|\/+$/g, '')}`;
        if (paths.has(key)) errors.push(`${label}: webhook "${key}" in "${n.name}" clashes with ${paths.get(key)}`);
        else paths.set(key, `${label} "${n.name}"`);
      }
      if (typeof n.webhookId === 'string') {
        if (webhookIds.has(n.webhookId)) errors.push(`${label}: webhookId of "${n.name}" is also used by ${webhookIds.get(n.webhookId)}`);
        else webhookIds.set(n.webhookId, `${label} "${n.name}"`);
      }
    }
  }
  return { errors };
}

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) targets.push(path.join(root, 'workflows'));
  const files = targets.flatMap(collectFiles).sort();
  if (files.length === 0) { console.error('No workflow files found.'); process.exit(1); }

  let failed = 0;
  const entries = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file) || file;
    let wf;
    try {
      wf = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`FAIL ${rel}\n  invalid JSON: ${e.message}`);
      failed++;
      continue;
    }
    const label = path.basename(path.dirname(file));
    const readmePath = path.join(path.dirname(file), 'README.md');
    // Folder and README rules apply to the repository layout (workflows/NN-name/workflow.json).
    if (path.basename(file) === 'workflow.json') entries.push({ label, wf, readme: fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : null });
    const { errors, warnings } = validateWorkflow(wf, label);
    const nodeCount = Array.isArray(wf.nodes) ? wf.nodes.length : 0;
    if (errors.length) {
      failed++;
      console.error(`FAIL ${rel} (${nodeCount} nodes)`);
      errors.forEach((e) => console.error(`  - ${e}`));
    } else {
      console.log(`OK   ${rel} (${nodeCount} nodes)`);
    }
    warnings.forEach((w) => console.warn(`  warn: ${w}`));
  }
  const repo = validateRepository(entries);
  if (repo.errors.length) {
    console.error('FAIL repository checks');
    repo.errors.forEach((e) => console.error(`  - ${e}`));
  }
  console.log(`\n${files.length - failed}/${files.length} workflows valid`);
  process.exit(failed || repo.errors.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
