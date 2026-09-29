#!/usr/bin/env node
// MCP control panel on http://localhost/ : setup (.env), profiles (profiles/*.env), switch, chat.
// No dependencies, Node 18+.
// Usage: node setup/server.js [setup|profile|switch|swift|chat] [--agent <id>] [--no-open]
//        node setup/server.js reset [--yes]   (delete .env, profiles/, chats/ and their MCP registrations)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); // Notepad may add a BOM
const CONFIG = JSON.parse(readText(path.join(ROOT, 'mcp.json')));
const ENV_FILE = path.join(ROOT, CONFIG.output?.file || '.env');
const ENV_EXAMPLE = path.join(ROOT, CONFIG.output?.example || '.env.example');
const PROFILE_DIR = path.join(ROOT, CONFIG.profiles?.dir || 'profiles');
const PORTS = [CONFIG.ui?.port ?? 80, CONFIG.ui?.fallbackPort ?? 4610];
const IDLE_MS = (CONFIG.ui?.idleMinutes ?? 60) * 60 * 1000;
const IS_WIN = process.platform === 'win32';
const APP_ID = 'mcp-control-panel';

const ROUTES = { setup: 'setup', profile: 'profiles', profiles: 'profiles', switch: 'switch', swift: 'switch', chat: 'chat' };
const route = ROUTES[process.argv.slice(2).find((a) => !a.startsWith('--')) || ''] || '';

const log = (type, data) => console.log(`MCP_EVENT ${JSON.stringify({ type, ...data })}`);

// ---------- projects ----------

function projectKey(dir) {
  const k = path.basename(dir).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return k || 'P_' + crypto.createHash('md5').update(dir).digest('hex').slice(0, 6).toUpperCase();
}

function scanProjects() {
  const ws = CONFIG.workspace || {};
  const base = path.resolve(ROOT, ws.root || '..');
  const detect = ws.detect || ['.git', 'package.json'];
  const exclude = new Set((ws.exclude || []).map((s) => s.toLowerCase()));
  let entries = [];
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !exclude.has(e.name.toLowerCase()))
    .map((e) => path.join(base, e.name))
    .filter((dir) => path.resolve(dir) !== ROOT)
    .filter((dir) => detect.some((f) => { try { return fs.existsSync(path.join(dir, f)); } catch { return false; } }))
    .map((dir) => ({ path: dir, name: path.basename(dir), key: projectKey(dir) }));
}

// ---------- env files (.env and profiles/*.env share one format) ----------

function parseEnv(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1).replace(/\\"/g, '"');
    vars[m[1]] = v;
  }
  return vars;
}

function quoteEnv(v) {
  v = String(v ?? '');
  return /[\s#"'=]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v;
}

// { profile, projects: { KEY: {key,path,role,services,fields} } }
function readEnvFile(file) {
  let vars = {};
  try { vars = parseEnv(readText(file)); } catch { return null; }
  const projects = {};
  for (const [k, v] of Object.entries(vars)) {
    const m = k.match(/^(.+)_PATH$/);
    if (m && v && m[1] !== 'MCP') projects[m[1]] = { key: m[1], path: v };
  }
  for (const p of Object.values(projects)) {
    p.role = vars[`${p.key}_ROLE`] || '';
    p.services = (vars[`${p.key}_SERVICES`] || '').split(',').map((s) => s.trim()).filter(Boolean);
    p.fields = {};
    for (const [sid, svc] of Object.entries(CONFIG.services)) {
      p.fields[sid] = {};
      for (const f of Object.keys(svc.fields)) p.fields[sid][f] = vars[`${p.key}_${sid.toUpperCase()}_${f.toUpperCase()}`] ?? '';
    }
  }
  const chat = vars.MCP_CHAT_SESSION
    ? { session: vars.MCP_CHAT_SESSION, agent: vars.MCP_CHAT_AGENT || 'claude', agentSession: vars.MCP_CHAT_AGENT_SESSION || '', cwd: vars.MCP_CHAT_CWD || '', dirs: (vars.MCP_CHAT_DIRS || vars.MCP_CHAT_CWD || '').split(';').filter(Boolean), mode: vars.MCP_CHAT_MODE || 'read', updated: vars.MCP_CHAT_UPDATED || '' }
    : null;
  return { profile: vars.MCP_PROFILE || '', chat, projects };
}

function projectLines(p, withValues) {
  const val = (v) => (withValues ? quoteEnv(v) : '');
  const lines = [`# ===== ${p.path} =====`,
    `${p.key}_PATH=${val(p.path)}`,
    `${p.key}_ROLE=${val(p.role)}`,
    `${p.key}_SERVICES=${val(p.services.join(','))}`];
  for (const sid of p.services) {
    for (const f of Object.keys(CONFIG.services[sid].fields)) {
      lines.push(`${p.key}_${sid.toUpperCase()}_${f.toUpperCase()}=${val(p.fields[sid]?.[f])}`);
    }
  }
  return lines.join('\n');
}

function writeEnvFile(file, data, title) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const c = data.chat;
  const head = `# ${title} - contains secrets, do not share or commit\nMCP_PROFILE=${quoteEnv(data.profile || '')}\n`
    + `\n# ===== chat (web chat session - resume in MCP_CHAT_CWD with the tool in MCP_CHAT_AGENT, id MCP_CHAT_AGENT_SESSION) =====\n`
    + `MCP_CHAT_SESSION=${quoteEnv(c?.session)}\nMCP_CHAT_AGENT=${quoteEnv(c?.agent)}\nMCP_CHAT_AGENT_SESSION=${quoteEnv(c?.agentSession)}\nMCP_CHAT_CWD=${quoteEnv(c?.cwd)}\nMCP_CHAT_DIRS=${quoteEnv((c?.dirs || []).join(';'))}\n`
    + `MCP_CHAT_MODE=${quoteEnv(c?.mode)}\nMCP_CHAT_UPDATED=${quoteEnv(c?.updated)}\n`;
  const body = Object.values(data.projects).map((p) => projectLines(p, true)).join('\n\n');
  fs.writeFileSync(file, head + '\n' + body + '\n', 'utf8');
}

function writeExample(data) {
  const head = '# Example of .env (values removed) - safe to share. Run "run mcp" to create the real .env\nMCP_PROFILE=\n'
    + 'MCP_CHAT_SESSION=\nMCP_CHAT_AGENT=\nMCP_CHAT_AGENT_SESSION=\nMCP_CHAT_CWD=\nMCP_CHAT_DIRS=\nMCP_CHAT_MODE=\nMCP_CHAT_UPDATED=\n';
  const body = Object.values(data.projects).map((p) => projectLines(p, false)).join('\n\n');
  fs.writeFileSync(ENV_EXAMPLE, head + '\n' + body + '\n', 'utf8');
}

const readActive = () => readEnvFile(ENV_FILE) || { profile: '', chat: null, projects: {} };

// ---------- profiles ----------

const PROFILE_NAME = /^[^<>:"/\\|?*\x00-\x1f]{1,40}$/;
const profileFile = (name) => path.join(PROFILE_DIR, `${name}.env`);

function validName(name) {
  name = String(name || '').trim();
  return PROFILE_NAME.test(name) && !/^\.+$/.test(name) ? name : null;
}

function listProfiles() {
  let files = [];
  try { files = fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith('.env')); } catch { return []; }
  return files.map((f) => {
    const name = f.slice(0, -4);
    const d = readEnvFile(path.join(PROFILE_DIR, f)) || { projects: {} };
    const st = fs.statSync(path.join(PROFILE_DIR, f));
    return { name, updated: st.mtime.toISOString(), projects: summarize(d.projects), chat: d.chat || null };
  }).sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

function readProfile(name) {
  const n = validName(name);
  return n ? readEnvFile(profileFile(n)) : null;
}

// ---------- sanitizing (never send tokens to the page) ----------

function summarize(projects) {
  return Object.values(projects).map((p) => ({ path: p.path, name: path.basename(p.path), role: p.role, services: p.services }));
}

function sanitize(projects) {
  return Object.values(projects).map((p) => {
    const fields = {};
    for (const [sid, fv] of Object.entries(p.fields)) {
      fields[sid] = {};
      for (const [f, v] of Object.entries(fv)) {
        const secret = CONFIG.services[sid]?.fields[f]?.secret;
        fields[sid][f] = secret ? '' : v;
        if (secret && v) fields[sid].hasToken = true;
      }
    }
    return { path: p.path, name: path.basename(p.path), key: p.key, role: p.role, services: p.services, fields };
  });
}

function sourceData(src) {
  if (src?.kind === 'active') return readActive();
  if (src?.kind === 'profile') return readProfile(src.name) || { profile: '', projects: {} };
  return { profile: '', projects: {} };
}

// ---------- MCP registration ----------

function fill(tpl, fields) {
  const site = (() => { try { return new URL(fields.url).hostname.split('.')[0]; } catch { return ''; } })();
  const sub = (s) => String(s).replace(/\{\{url:site\}\}/g, site).replace(/\{\{(\w+)\}\}/g, (_, k) => fields[k] ?? '');
  return JSON.parse(JSON.stringify(tpl), (_, v) => (typeof v === 'string' ? sub(v) : v));
}

function serverSpec(sid, fields) {
  const s = CONFIG.services[sid].server;
  const tpl = s.whenToken || s.whenNoToken ? (fields.token ? s.whenToken : s.whenNoToken) : s;
  return fill(tpl, fields);
}

function cmdQuote(a) {
  a = String(a);
  if (!IS_WIN) return "'" + a.replace(/'/g, "'\\''") + "'";
  return /[\s"&|<>^%]/.test(a) || a === '' ? '"' + a.replace(/"/g, '""') + '"' : a;
}

function claude(args, cwd) {
  const r = spawnSync(['claude', ...args].map(cmdQuote).join(' '), { cwd, shell: true, encoding: 'utf8' });
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

let claudeCached = null;
function hasClaude() {
  if (claudeCached === null) {
    claudeCached = spawnSync(IS_WIN ? 'where claude' : 'command -v claude', { shell: true, encoding: 'utf8' }).status === 0;
  }
  return claudeCached;
}

function unregister(dir) {
  if (!fs.existsSync(dir)) return;
  for (const sid of Object.keys(CONFIG.services)) claude(['mcp', 'remove', sid, '-s', 'local'], dir);
}

function register(p) {
  const results = [];
  unregister(p.path);
  for (const sid of p.services) {
    const spec = serverSpec(sid, p.fields[sid] || {});
    const args = spec.type === 'http' || spec.type === 'sse'
      ? ['mcp', 'add', sid, '-s', 'local', '--transport', spec.type, spec.url]
      : ['mcp', 'add', sid, '-s', 'local',
        ...Object.entries(spec.env || {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
        '--', spec.command, ...(spec.args || [])];
    const r = claude(args, p.path);
    results.push({ service: sid, ok: r.ok, message: r.ok ? 'registered' : r.out.split('\n').pop() });
  }
  return results;
}

// Make `next` the active config: write .env, unregister projects that left, register the rest
function applyActive(next) {
  const prev = readActive();
  writeEnvFile(ENV_FILE, next, 'Active MCP config (generated by mcp/setup)');
  writeExample(next);
  const nextPaths = new Set(Object.values(next.projects).map((p) => p.path.toLowerCase()));
  const canRegister = hasClaude();
  const removed = [];
  if (canRegister) {
    for (const p of Object.values(prev.projects)) {
      if (!nextPaths.has(p.path.toLowerCase())) { unregister(p.path); removed.push(p.path); }
    }
  }
  const results = Object.values(next.projects).map((p) => ({
    path: p.path, role: p.role, services: p.services, mcp: canRegister ? register(p) : [],
  }));
  return { registered: canRegister, removed, results };
}

// ---------- connection tests ----------

// Fields marked "normalize": "origin" keep only scheme + host, so a pasted board link
// (https://x.atlassian.net/jira/software/projects/KAN/boards/1) becomes https://x.atlassian.net
function normalizeField(sid, f, v) {
  if (!v || CONFIG.services[sid]?.fields?.[f]?.normalize !== 'origin') return v;
  try { return new URL(v).origin; } catch { return v; }
}

// Read a JSON body; a web page (HTML) instead of JSON means the url points to a page, not the API
async function jsonOrNull(r) {
  const type = r.headers.get('content-type') || '';
  if (!type.includes('json')) return null;
  try { return await r.json(); } catch { return null; }
}

async function testService(sid, f) {
  const signal = AbortSignal.timeout(15000);
  if (sid === 'jira') {
    const url = normalizeField('jira', 'url', String(f.url || '').trim()).replace(/\/+$/, '');
    if (!/^https:\/\/[^/]+$/.test(url)) return { ok: false, message: 'url ต้องเป็นแบบ https://<ชื่อ>.atlassian.net' };
    const auth = Buffer.from(`${f.email}:${f.token}`).toString('base64');
    const r = await fetch(`${url}/rest/api/3/myself`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, signal });
    if (r.status === 401 || r.status === 403) return { ok: false, message: `Jira ตอบกลับ ${r.status} — email หรือ token ไม่ถูกต้อง (token หมดอายุ → สร้างใหม่)` };
    if (r.status === 404) return { ok: false, message: `ไม่พบ Jira ที่ ${url} — เช็กชื่อ site` };
    if (!r.ok) return { ok: false, message: `Jira ตอบกลับ ${r.status} — เช็ก url / email / token` };
    const me = await jsonOrNull(r);
    if (!me) return { ok: false, message: `${url} ไม่ได้ตอบเป็น Jira API (ได้หน้าเว็บกลับมา) — ใส่ url แค่ https://<ชื่อ>.atlassian.net` };
    return { ok: true, message: `เชื่อมต่อได้ — ${me.displayName}${url !== String(f.url || '').trim().replace(/\/+$/, '') ? ` (ใช้ url ${url})` : ''}` };
  }
  if (sid === 'figma') {
    if (!f.token) return { ok: true, message: 'ไม่มี token — จะล็อกอินผ่านเบราว์เซอร์ (OAuth) หลังลงทะเบียน' };
    const r = await fetch('https://api.figma.com/v1/me', { headers: { 'X-Figma-Token': f.token }, signal });
    if (!r.ok) return { ok: false, message: `Figma ตอบกลับ ${r.status} — เช็ก token` };
    const me = await jsonOrNull(r);
    if (!me) return { ok: false, message: 'Figma ไม่ได้ตอบเป็น JSON — ลองใหม่อีกครั้ง' };
    return { ok: true, message: `เชื่อมต่อได้ — ${me.handle || me.email}` };
  }
  return { ok: true, message: 'ไม่มีวิธีทดสอบสำหรับบริการนี้' };
}

// ---------- building projects from the form ----------

// Blank secret = keep: first from the same project in the target file, then from copySource
function buildProjects(input, existing) {
  const errors = [];
  const projects = {};
  for (const raw of input || []) {
    const dir = path.resolve(String(raw.path || ''));
    const key = projectKey(dir);
    const name = path.basename(dir);
    const p = { key, path: dir, role: raw.role, services: (raw.services || []).filter((s) => CONFIG.services[s]), fields: {} };
    if (!fs.existsSync(dir)) errors.push(`${dir}: ไม่พบโฟลเดอร์`);
    if (!CONFIG.roles[p.role]) errors.push(`${name}: ยังไม่ได้เลือก Role`);
    if (!p.services.length) errors.push(`${name}: ยังไม่ได้เลือกรูปแบบ`);
    for (const sid of p.services) {
      p.fields[sid] = {};
      const given = raw.fields?.[sid] || {};
      for (const [f, def] of Object.entries(CONFIG.services[sid].fields)) {
        let v = normalizeField(sid, f, String(given[f] ?? '').trim());
        if (!v && def.secret) v = existing.projects[key]?.fields?.[sid]?.[f] || '';
        if (!v && def.secret && given.copyFrom) v = existing.projects[projectKey(given.copyFrom)]?.fields?.[sid]?.[f] || '';
        if (!v && def.default) v = def.default;
        p.fields[sid][f] = v;
        if (def.required && !v) errors.push(`${name} · ${sid}.${f}: ต้องกรอก`);
        if (v && f === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors.push(`${name} · ${sid}.email: รูปแบบไม่ถูกต้อง`);
        if (v && f === 'url' && !/^https:\/\//.test(v)) errors.push(`${name} · ${sid}.url: ต้องขึ้นต้นด้วย https://`);
      }
    }
    projects[key] = p;
  }
  if (!Object.keys(projects).length) errors.push('ยังไม่ได้เลือกโปรเจกต์');
  return { errors, projects };
}

// ---------- chat (any AI command-line tool, streamed to the page) ----------
// Adapters: claude (Claude Code), codex (OpenAI Codex CLI), gemini (Gemini CLI), text (any CLI that prints text)

const CHAT_DIR = path.join(ROOT, CONFIG.chat?.dir || 'chats');
// Permission level the user picks when starting a chat
const CHAT_MODES = {
  read: { label: 'อ่านอย่างเดียว' },
  edit: { label: 'แก้ไฟล์ได้ (ไม่รันคำสั่ง)' },
  auto: { label: 'เต็มรูปแบบ — รันคำสั่งได้ (auto)' },
};
const CLAUDE_TOOLS = {
  read: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'TodoWrite'],
  edit: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'TodoWrite', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
};
const CLAUDE_PERMISSION = { read: 'default', edit: 'acceptEdits', auto: 'auto' };
// read / edit: no shell at all (Claude Code would otherwise auto-allow read-only commands)
const CHAT_DENY = ['Bash', 'PowerShell', 'Monitor', 'BashOutput', 'KillShell', 'KillBash'];
// auto: Claude Code's auto mode decides each command; README rule 5 still applies
const CHAT_DENY_AUTO = ['Monitor',
  ...['git push', 'git reset', 'git merge', 'git rebase', 'git clean', 'git branch -D']
    .flatMap((cmd) => [`Bash(${cmd}:*)`, `PowerShell(${cmd}:*)`])];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const running = new Map(); // session -> child process
const streams = new Map(); // session -> { events, done, listeners } of the latest reply

// Hot reload (see supervise) waits for running chats: the supervisor asks, we exit when idle
let reloadPending = false;
function reloadIfIdle() {
  if (reloadPending && running.size === 0) { console.log('no running chats - reloading now'); process.exit(0); }
}
process.on('message', (m) => {
  if (!m?.reload) return;
  reloadPending = true;
  if (running.size) console.log(`reload waits for ${running.size} running chat(s) to finish`);
  reloadIfIdle();
  setTimeout(() => process.exit(0), 15 * 60 * 1000).unref(); // never wait forever
});

const DEFAULT_AGENTS = {
  claude: { type: 'claude', label: 'Claude Code (Anthropic)', command: 'claude' },
  codex: { type: 'codex', label: 'Codex (OpenAI / GPT)', command: 'codex' },
  gemini: { type: 'gemini', label: 'Gemini (Google)', command: 'gemini' },
  opencode: { type: 'opencode', label: 'OpenCode', command: 'opencode' },
};
const AGENTS = { ...DEFAULT_AGENTS, ...(CONFIG.agents || {}) };

// Live reload: edits to mcp.json (roles, permissions, services, agents, statuses) apply to the next
// request / chat message without restarting. Paths and ports stay as they were at startup.
fs.watchFile(path.join(ROOT, 'mcp.json'), { interval: 1000 }, () => {
  try {
    const fresh = JSON.parse(readText(path.join(ROOT, 'mcp.json')));
    for (const k of Object.keys(CONFIG)) delete CONFIG[k];
    Object.assign(CONFIG, fresh);
    for (const k of Object.keys(AGENTS)) delete AGENTS[k];
    Object.assign(AGENTS, DEFAULT_AGENTS, CONFIG.agents || {});
    console.log('mcp.json reloaded');
  } catch (e) {
    console.log(`mcp.json not reloaded (invalid JSON: ${e.message}) — keeping the previous settings`);
  }
});
const VSCODE_URI = {
  claude: 'vscode://anthropic.claude-code/open?session={agentSession}',
  codex: 'vscode://openai.chatgpt/local/{agentSession}',
};

// Resolve a CLI to something spawnable without a shell (no quoting problems with Thai text / tokens):
// Windows npm shims (*.cmd) point at an .exe or a .js run by node
const binCache = {};
function resolveBin(command) {
  if (binCache[command]) return binCache[command];
  let bin = null;
  if (path.isAbsolute(command) && fs.existsSync(command)) bin = { cmd: command, pre: [] };
  else if (IS_WIN) {
    const w = spawnSync(`where ${command}`, { shell: true, encoding: 'utf8' });
    const hits = (w.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const exe = hits.find((h) => /\.exe$/i.test(h));
    const shim = hits.find((h) => /\.cmd$/i.test(h));
    if (exe) bin = { cmd: exe, pre: [] };
    else if (shim) {
      const txt = readText(shim);
      const e = txt.match(/"%dp0%\\([^"]+\.exe)"/i);
      const j = txt.match(/"%dp0%\\([^"]+\.js)"/i);
      if (e && fs.existsSync(path.join(path.dirname(shim), e[1]))) bin = { cmd: path.join(path.dirname(shim), e[1]), pre: [] };
      else if (j && fs.existsSync(path.join(path.dirname(shim), j[1]))) bin = { cmd: process.execPath, pre: [path.join(path.dirname(shim), j[1])] };
      else bin = { cmd: shim, pre: [], shell: true };
    }
  } else if (spawnSync(`command -v ${command}`, { shell: true }).status === 0) bin = { cmd: command, pre: [] };
  binCache[command] = bin;
  return bin;
}
const agentOf = (id) => AGENTS[id] || AGENTS.claude;
const agentInstalled = (id) => !!(AGENTS[id] && resolveBin(AGENTS[id].command));

// Which AI ran "run mcp"? --agent <id> / MCP_AGENT win; otherwise walk up the process tree
// (claude.exe, codex.exe, opencode.exe, node …gemini.js) and finally look at env hints
function matchAgent(name, cmdline) {
  const n = String(name || '').toLowerCase().replace(/\.exe$/, '');
  const cl = String(cmdline || '').toLowerCase();
  for (const [id, a] of Object.entries(AGENTS)) {
    const cmd = path.basename(String(a.command || id)).toLowerCase().replace(/\.(exe|cmd)$/, '');
    if (n === cmd) return id;
    if (n === 'node' && new RegExp(`[\\\\/@]${cmd}([\\\\/.-]|$)`).test(cl)) return id;
  }
  return null;
}
function detectLauncher() {
  const argIdx = process.argv.indexOf('--agent');
  const explicit = argIdx > 0 ? process.argv[argIdx + 1] : process.env.MCP_AGENT;
  if (explicit && AGENTS[explicit]) return { id: explicit, via: 'argument' };
  try {
    let procs = [];
    if (IS_WIN) {
      const ps = spawnSync('powershell', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'],
      { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 * 1024 });
      procs = JSON.parse(ps.stdout || '[]').map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name, cmd: p.CommandLine }));
    } else {
      const ps = spawnSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' });
      procs = (ps.stdout || '').split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)).filter(Boolean)
        .map((m) => ({ pid: +m[1], ppid: +m[2], name: path.basename(m[3]), cmd: m[4] }));
    }
    const byPid = new Map(procs.map((p) => [p.pid, p]));
    let cur = byPid.get(process.ppid);
    for (let i = 0; cur && i < 12; i++) {
      const id = matchAgent(cur.name, cur.cmd);
      if (id) return { id, via: 'process' };
      cur = byPid.get(cur.ppid);
    }
  } catch { /* fall through to env hints */ }
  const env = process.env;
  const hint = env.CLAUDECODE ? 'claude' : env.GEMINI_CLI ? 'gemini'
    : Object.keys(env).some((k) => k.startsWith('OPENCODE')) ? 'opencode'
      : Object.keys(env).some((k) => k.startsWith('CODEX_')) ? 'codex' : null;
  return hint && AGENTS[hint] ? { id: hint, via: 'env' } : null;
}
let launcher = null; // set at startup; a later "run mcp" from another AI updates it

function spawnBin(bin, args, opts) {
  if (bin.shell) return spawn([bin.cmd, ...bin.pre, ...args].map(cmdQuote).join(' '), { ...opts, shell: true });
  return spawn(bin.cmd, [...bin.pre, ...args], { ...opts, windowsHide: true });
}

// Claude Code keeps transcripts in ~/.claude/projects/<encoded cwd>/<session>.jsonl
const PROJECTS_DIR = path.join(require('os').homedir(), '.claude', 'projects');
function transcriptFile(session) {
  try {
    const d = fs.readdirSync(PROJECTS_DIR).find((x) => fs.existsSync(path.join(PROJECTS_DIR, x, `${session}.jsonl`)));
    return d ? path.join(PROJECTS_DIR, d, `${session}.jsonl`) : null;
  } catch { return null; }
}
const sessionExists = (session) => !!transcriptFile(session);

// The VS Code extension hides sessions recorded with an SDK entrypoint (sdk-cli / sdk-ts / sdk-py).
// Web chat runs headless, so record it as a normal CLI session, and repair sessions saved before this fix
const CLAUDE_ENV = { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' };
function makeVisibleInVSCode(session) {
  const file = transcriptFile(session);
  if (!file) return false;
  const text = readText(file);
  if (!/"entrypoint":"sdk-(cli|ts|py)"/.test(text)) return false;
  fs.writeFileSync(file, text.replace(/"entrypoint":"sdk-(cli|ts|py)"/g, '"entrypoint":"cli"'), 'utf8');
  return true;
}

const historyFile = (session) => path.join(CHAT_DIR, `${session}.json`);
function readHistory(session) {
  try { return JSON.parse(readText(historyFile(session))); } catch { return []; }
}
function appendHistory(session, entry) {
  fs.mkdirSync(CHAT_DIR, { recursive: true });
  const h = readHistory(session);
  h.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(historyFile(session), JSON.stringify(h, null, 1), 'utf8');
}

const samePath = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const chatProjects = (data, dirs) => dirs.map((d) => Object.values(data.projects).find((p) => samePath(p.path, d))).filter(Boolean);

// One MCP config for every selected project. Same service + same account → one server ("jira");
// different accounts → one per project ("jira_vantive_web")
function chatMcpServers(projects) {
  const servers = {};
  const seen = {};
  for (const p of projects) {
    for (const sid of p.services) {
      const spec = serverSpec(sid, p.fields[sid] || {});
      const sig = JSON.stringify(spec);
      if (seen[sid]?.some((s) => s.sig === sig)) continue;
      const name = seen[sid] ? `${sid}_${p.key.toLowerCase()}` : sid;
      (seen[sid] = seen[sid] || []).push({ sig, name, project: p.path });
      servers[name] = spec.type ? { type: spec.type, url: spec.url } : { command: spec.command, args: spec.args || [], env: spec.env || {} };
    }
  }
  const owners = Object.values(seen).flat().map((s) => ({ name: s.name, project: s.project }));
  return { servers, owners };
}

// Windows: tools that spawn MCP servers without a shell cannot run npm shims (npx) directly
const winWrap = (s) => (IS_WIN && s.command && !/\.(exe|bat|cmd)$/i.test(s.command)
  ? { ...s, command: 'cmd', args: ['/c', s.command, ...(s.args || [])] } : s);

function chatPrompt(agent, profileName, projects, cwd, owners) {
  const line = (p) => `- ${p.path}${samePath(p.path, cwd) ? ' (โฟลเดอร์หลัก)' : ''} · Role: ${p.role || '-'} · MCP: ${
    owners.filter((o) => samePath(o.project, p.path)).map((o) => o.name).join(', ') || p.services.join(', ') || '-'}`;
  return [
    `คุณกำลังคุยกับผู้ใช้ผ่านหน้าเว็บ MCP Control Panel (http://localhost/) ผ่าน ${agent.label} ตอบเป็นภาษาไทย`,
    `โปรไฟล์: ${profileName}`,
    'โปรเจกต์ในแชทนี้ (อ่าน/ค้นหาได้ทุกอัน — ระบุ path เต็มเมื่ออ้างถึงไฟล์):',
    ...projects.map(line),
    'ถ้า MCP ชื่อเดียวกันถูกใช้หลายโปรเจกต์ แปลว่าใช้บัญชีเดียวกัน · ถ้ามีชื่อต่อท้าย เช่น jira_vantive_web ให้ใช้ตัวที่ตรงกับโปรเจกต์ที่ทำงานอยู่',
    ...(agent.inlineRules ?? agent.type === 'opencode'
      // tools that may not read outside the project get the rules inline instead of a path
      ? ['กติกาการทำงานตาม Role (ทำตาม โดยใช้ Role ของโปรเจกต์ที่กำลังทำงานอยู่ — ไม่ต้องเปิดไฟล์นอกโปรเจกต์):',
        `[สิทธิ์ของแต่ละ Role]\n${JSON.stringify(CONFIG.roles)}`,
        `[README.md]\n${(() => { try { return readText(path.join(ROOT, 'README.md')); } catch { return '-'; } })()}`]
      : [`กติกาการทำงานตาม Role อยู่ที่ ${path.join(ROOT, 'README.md')} และสิทธิ์ของแต่ละ Role อยู่ที่ ${path.join(ROOT, 'mcp.json')} (roles) — อ่านและทำตาม โดยใช้ Role ของโปรเจกต์ที่กำลังทำงานอยู่`]),
    'ก่อนสร้าง/แก้ข้อมูลใน Jira หรือแก้ไฟล์ ให้สรุปสิ่งที่จะทำแล้วถามผู้ใช้ให้ตอบ Y ก่อนเสมอ',
    'หน้าเว็บนี้ไม่มีหน้าจอขออนุญาต: เครื่องมือที่ไม่ได้รับอนุญาตจะถูกปฏิเสธอัตโนมัติ — ถ้าจำเป็นต้องใช้ ให้บอกผู้ใช้พิมพ์ "เปิดโปรเจค" เพื่อคุยต่อในเครื่องมือเต็มรูปแบบด้วย session เดิม',    'ห้ามแสดง token หรือค่าลับจากไฟล์ .env',
    `ถ้า git ขอชื่อผู้ใช้ / รหัสผ่าน (เช่น "could not read Username", "terminal prompts disabled") อย่าพยายามใส่รหัสเอง — บอกผู้ใช้ให้เปิดหน้า Git ของหน้าเว็บนี้ http://localhost/#/git (ปุ่ม "เปิด Chrome สร้าง token" → กรอกชื่อผู้ใช้ + token → บันทึกและทดสอบ) เสร็จแล้วค่อย pull ใหม่`,
  ].join('\n');
}

// Tools without a system-prompt flag get the instructions in front of the first message
const withInstructions = (instructions, text) => `[คำสั่งจากระบบ MCP Control Panel]\n${instructions}\n\n[ข้อความผู้ใช้]\n${text}`;

// ---- adapters: build(ctx) → { args, env, stdin }, parse(line, emit, st), resume(c) → terminal command ----
const ADAPTERS = {
  claude: {
    build(ctx) {
      const { c, servers, instructions, extraDirs } = ctx;
      const promptFile = path.join(CHAT_DIR, `${c.session}.prompt.txt`);
      const mcpFile = path.join(CHAT_DIR, `${c.session}.mcp.json`); // has tokens: chats/ is gitignored like .env
      fs.writeFileSync(promptFile, instructions, 'utf8');
      fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: servers }, null, 1), 'utf8');
      const first = !sessionExists(c.session);
      return {
        args: ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
          ...(first ? ['--session-id', c.session] : ['--resume', c.session]),
          '--permission-mode', CLAUDE_PERMISSION[c.mode] || 'default',
          '--mcp-config', mcpFile, '--strict-mcp-config', // MCP of every selected project, nothing else
          '--allowedTools', ...(c.mode === 'auto' ? [] : CLAUDE_TOOLS[c.mode] || CLAUDE_TOOLS.read), ...Object.keys(servers).map((s) => `mcp__${s}`),
          '--disallowedTools', ...(c.mode === 'auto' ? CHAT_DENY_AUTO : CHAT_DENY), // deny wins over the user's settings
          '--add-dir', ...extraDirs,
          '--append-system-prompt-file', promptFile],
        env: CLAUDE_ENV,
        stdin: ctx.text,
        agentSession: c.session,
      };
    },
    parse(ev, emit, st) {
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
        emit.text(ev.event.delta.text);
      } else if (ev.type === 'assistant') {
        for (const blk of ev.message?.content || []) {
          if (blk.type === 'tool_use') emit.tool(blk.id, blk.name, blk.input);
          else if (blk.type === 'text') emit.gap();
        }
      } else if (ev.type === 'user') {
        for (const blk of ev.message?.content || []) if (blk.type === 'tool_result') emit.toolResult(blk.tool_use_id, !!blk.is_error);
      } else if (ev.type === 'result') {
        emit.done(ev.subtype === 'success' && !ev.is_error, (ev.permission_denials || []).map((d) => d.tool_name));
      }
    },
    resume: (c, others) => `claude --resume ${c.session}${others.map((d) => ` --add-dir "${d}"`).join('')}`,
  },

  codex: {
    build(ctx) {
      const { c, servers, instructions, extraDirs } = ctx;
      const toml = (v) => JSON.stringify(v); // JSON strings/arrays are valid TOML values
      const mcp = Object.entries(servers).flatMap(([n, s0]) => {
        const s = winWrap(s0);
        if (s.url) return ['-c', `mcp_servers.${n}.url=${toml(s.url)}`];
        const env = Object.entries(s.env || {}).map(([k, v]) => `${k}=${toml(v)}`).join(', ');
        return ['-c', `mcp_servers.${n}.command=${toml(s.command)}`, '-c', `mcp_servers.${n}.args=${toml(s.args || [])}`,
          ...(env ? ['-c', `mcp_servers.${n}.env={ ${env} }`] : [])];
      });
      // Windows: the default (elevated) sandbox needs a one-time admin setup and otherwise blocks every command;
      // the unelevated sandbox works out of the box and still enforces read-only / workspace-write
      const sandbox = ['-c', `sandbox_mode=${toml(c.mode === 'read' ? 'read-only' : 'workspace-write')}`, '-c', 'approval_policy="never"',
        ...(IS_WIN ? ['-c', `windows.sandbox=${toml(ctx.agent.windowsSandbox || 'unelevated')}`] : []),
        ...(c.mode !== 'read' ? ['-c', `sandbox_workspace_write.writable_roots=${toml(extraDirs.slice(1))}`] : [])];
      const first = !c.agentSession;
      const prompt = first ? withInstructions(instructions, ctx.text) : ctx.text;
      return {
        args: first
          ? ['exec', '--json', '--skip-git-repo-check', ...sandbox, ...mcp, '-']
          : ['exec', 'resume', '--json', '--skip-git-repo-check', ...sandbox, ...mcp, c.agentSession, '-'],
        env: process.env,
        stdin: prompt,
      };
    },
    parse(ev, emit, st) {
      const it = ev.item || {};
      if (ev.type === 'thread.started' && ev.thread_id) st.agentSession = ev.thread_id;
      else if (ev.type === 'item.started' && it.type && it.type !== 'agent_message' && it.type !== 'reasoning') {
        emit.tool(it.id, it.type === 'mcp_tool_call' ? `mcp__${it.server}__${it.tool}` : it.type === 'command_execution' ? `shell: ${it.command}` : it.type, it.arguments || {});
      } else if (ev.type === 'item.completed') {
        if (it.type === 'agent_message') { emit.gap(); emit.text(it.text || ''); }
        else if (it.type === 'error') emit.error(it.message || 'error');
        else if (it.type !== 'reasoning') emit.toolResult(it.id, it.status === 'failed' || (it.exit_code ?? 0) !== 0 || !!it.error);
      } else if (ev.type === 'turn.completed') emit.done(true);
      else if (ev.type === 'turn.failed') { emit.error(ev.error?.message || 'turn failed'); emit.done(false); }
      else if (ev.type === 'error') emit.error(ev.message || 'error');
    },
    resume: (c, others) => (c.agentSession ? `codex resume ${c.agentSession}${others.map((d) => ` --add-dir "${d}"`).join('')}` : null),
  },

  gemini: {
    build(ctx) {
      const { c, servers, instructions, extraDirs } = ctx;
      const settings = { mcpServers: {} };
      for (const [n, s0] of Object.entries(servers)) {
        const s = winWrap(s0);
        settings.mcpServers[n] = s.url ? { httpUrl: s.url, trust: true } : { command: s.command, args: s.args || [], env: s.env || {}, trust: true };
      }
      const settingsFile = path.join(CHAT_DIR, `${c.session}.gemini-settings.json`); // has tokens
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 1), 'utf8');
      const first = !c.agentSession;
      const others = extraDirs.slice(1);
      return {
        args: ['-p', first ? withInstructions(instructions, ctx.text) : ctx.text, '--output-format', 'stream-json', '--skip-trust',
          '--approval-mode', c.mode === 'read' ? 'default' : 'auto_edit', // Gemini has no command classifier: auto = auto_edit
          ...(first ? ['--session-id', c.session] : ['--resume', c.agentSession]),
          ...(Object.keys(servers).length ? ['--allowed-mcp-server-names', ...Object.keys(servers)] : []),
          ...(others.length ? ['--include-directories', others.join(',')] : [])],
        env: { ...process.env, GEMINI_CLI_SYSTEM_SETTINGS_PATH: settingsFile },
      };
    },
    parse(ev, emit, st) {
      if (ev.type === 'init' && ev.session_id) st.agentSession = ev.session_id;
      else if (ev.type === 'message' && ev.role === 'assistant') emit.text(ev.content || '');
      else if (ev.type === 'tool_use') emit.tool(ev.tool_id, ev.tool_name, ev.parameters);
      else if (ev.type === 'tool_result') emit.toolResult(ev.tool_id, ev.status === 'error');
      else if (ev.type === 'error') emit.error(ev.message || 'error');
      else if (ev.type === 'result') { if (ev.status === 'error') emit.error(ev.error?.message || 'error'); emit.done(ev.status !== 'error'); }
    },
    resume: (c, others) => (c.agentSession ? `gemini --resume ${c.agentSession}${others.length ? ` --include-directories "${others.join(',')}"` : ''}` : null),
  },

  // OpenCode: free tier refuses runs with injected config, so no MCP/permission injection —
  // read mode uses the built-in read-only "plan" agent, edit mode the default agent
  opencode: {
    build(ctx) {
      const { c, instructions } = ctx;
      const first = !c.agentSession;
      return {
        args: ['run', '--standalone', '--format', 'json',
          ...(c.mode !== 'read' ? [] : ['--agent', ctx.agent.readAgent || 'plan']),
          ...(first ? [] : ['--session', c.agentSession]),
          first ? withInstructions(instructions, ctx.text) : ctx.text],
        env: process.env,
        doneOnExit: true,
      };
    },
    parse(ev, emit, st) {
      if (ev.sessionID) st.agentSession = ev.sessionID;
      const p = ev.part || {};
      if (ev.type === 'text') { emit.gap(); emit.text(p.text || ''); }
      else if (ev.type === 'tool_use') {
        emit.tool(p.callID || p.id, p.tool, p.state?.input || {});
        if (p.state?.status === 'completed' || p.state?.status === 'error') emit.toolResult(p.callID || p.id, p.state.status === 'error');
      } else if (ev.type === 'error') emit.error(ev.error?.message || 'error');
    },
    resume: (c) => (c.agentSession ? `opencode -s ${c.agentSession}` : null),
  },

  // Any CLI that takes a prompt and prints the answer. No session of its own: recent turns are replayed.
  // mcp.json → agents.<id> = { type: "text", label, command, args: ["...", "{prompt}"], resume: "optional terminal command" }
  text: {
    build(ctx) {
      const { c, instructions, agent } = ctx;
      const past = readHistory(c.session).slice(-(agent.historyTurns ?? 10) * 2)
        .map((m) => `${m.role === 'user' ? 'ผู้ใช้' : 'AI'}: ${m.text}`).join('\n\n');
      const prompt = `${instructions}\n\n${past ? `[บทสนทนาก่อนหน้า]\n${past}\n\n` : ''}[ข้อความผู้ใช้]\n${ctx.text}`;
      const args = (agent.args || ['{prompt}']);
      const usesArg = args.some((a) => a.includes('{prompt}'));
      return { args: args.map((a) => a.replace('{prompt}', prompt).replace('{cwd}', c.cwd)), env: process.env, stdin: usesArg ? '' : prompt, raw: true };
    },
    resume: (c, others, agent) => agent.resume || null,
  },
};

// b: { profile, dirs: [paths], cwd: main path, mode, agent, resume }
function startChat(b) {
  const name = validName(b.profile);
  const data = name && readProfile(name);
  if (!data) return { status: 404, body: { errors: ['ไม่พบโปรไฟล์'] } };
  const all = Object.values(data.projects);
  if (!all.length) return { status: 400, body: { errors: ['โปรไฟล์นี้ยังไม่มีโปรเจกต์'] } };
  const agent = AGENTS[b.agent] ? b.agent : 'claude';
  if (!agentInstalled(agent)) return { status: 400, body: { errors: [`ไม่พบ ${AGENTS[agent].label} ในเครื่อง — ติดตั้งก่อน`] } };
  let projects = chatProjects(data, Array.isArray(b.dirs) ? b.dirs : [b.cwd]);
  if (!projects.length) return { status: 400, body: { errors: ['เลือกโปรเจกต์อย่างน้อย 1 อัน'] } };
  const main = projects.find((p) => samePath(p.path, b.cwd)) || projects[0];
  projects = [main, ...projects.filter((p) => p !== main)];
  const mode = CHAT_MODES[b.mode] ? b.mode : 'read';
  const reuse = b.resume && data.chat?.session && samePath(data.chat.cwd, main.path) && (data.chat.agent || 'claude') === agent;
  const chat = {
    session: reuse ? data.chat.session : crypto.randomUUID(),
    agent, agentSession: reuse ? data.chat.agentSession || '' : '',
    cwd: main.path, dirs: projects.map((p) => p.path), mode, updated: new Date().toISOString(),
  };

  let switched = null;
  if (readActive().profile !== name) switched = applyActive({ profile: name, chat, projects: data.projects });
  saveChat(name, chat);
  log('chat-started', { profile: name, agent, session: chat.session, cwd: chat.cwd, dirs: chat.dirs, resumed: !!reuse });
  return { status: 200, body: { ok: true, profile: name, ...chat, resumed: !!reuse, switched, history: readHistory(chat.session) } };
}

// Write the chat block to both the active .env and the profile file, and keep the chat list entry up to date
function saveChat(profileName, chat) {
  const p = readProfile(profileName);
  if (p) writeEnvFile(profileFile(profileName), { ...p, profile: profileName, chat }, `MCP profile "${profileName}"`);
  const a = readActive();
  writeEnvFile(ENV_FILE, { ...a, profile: profileName, chat }, 'Active MCP config (generated by mcp/setup)');
  writeChatMeta(profileName, chat);
}

// ---- chat list (chats/<session>.meta.json): old chats can be reopened or deleted ----
const metaFile = (session) => path.join(CHAT_DIR, `${session}.meta.json`);
function writeChatMeta(profileName, chat) {
  fs.mkdirSync(CHAT_DIR, { recursive: true });
  let prev = {};
  try { prev = JSON.parse(readText(metaFile(chat.session))); } catch { /* new chat */ }
  const h = readHistory(chat.session);
  const firstUser = h.find((m) => m.role === 'user');
  const meta = {
    session: chat.session, profile: profileName, agent: chat.agent || 'claude', agentSession: chat.agentSession || '',
    cwd: chat.cwd, dirs: chat.dirs || [chat.cwd], mode: chat.mode,
    title: prev.title || (firstUser ? firstUser.text.replace(/\s+/g, ' ').slice(0, 80) : ''),
    messages: h.length, created: prev.created || new Date().toISOString(), updated: chat.updated || new Date().toISOString(),
  };
  fs.writeFileSync(metaFile(chat.session), JSON.stringify(meta, null, 1), 'utf8');
}
function listChats() {
  const a0 = readActive();
  if (a0.chat?.session && a0.profile && !fs.existsSync(metaFile(a0.chat.session))) writeChatMeta(a0.profile, a0.chat); // chats from before the list existed
  let files = [];
  try { files = fs.readdirSync(CHAT_DIR).filter((f) => f.endsWith('.meta.json')); } catch { return []; }
  const active = readActive().chat?.session;
  return files.map((f) => { try { return JSON.parse(readText(path.join(CHAT_DIR, f))); } catch { return null; } })
    .filter((m) => m && UUID.test(m.session) && (m.messages > 0 || m.session === active))
    .map((m) => ({ ...m, active: m.session === active }))
    .sort((x, y) => String(y.updated).localeCompare(String(x.updated)));
}
// Reopen an old chat: switch to its profile if needed and make it the active chat in .env
function reopenChat(session) {
  if (!UUID.test(String(session))) return { status: 400, body: { errors: ['session ไม่ถูกต้อง'] } };
  let m;
  try { m = JSON.parse(readText(metaFile(session))); } catch { return { status: 404, body: { errors: ['ไม่พบแชทนี้'] } }; }
  const data = readProfile(m.profile);
  if (!data) return { status: 404, body: { errors: [`ไม่พบโปรไฟล์ "${m.profile}" ของแชทนี้แล้ว`] } };
  const chat = { session: m.session, agent: m.agent, agentSession: m.agentSession, cwd: m.cwd, dirs: m.dirs, mode: m.mode, updated: m.updated };
  let switched = null;
  if (readActive().profile !== m.profile) switched = applyActive({ profile: m.profile, chat, projects: data.projects });
  saveChat(m.profile, chat);
  log('chat-reopened', { session: m.session, profile: m.profile, agent: m.agent });
  return { status: 200, body: { ok: true, profile: m.profile, ...chat, resumed: true, switched, history: readHistory(m.session) } };
}
// Delete an old chat from the panel (history, meta, temp files). The AI tool's own transcript is left alone.
function deleteChat(session) {
  if (!UUID.test(String(session))) return { status: 400, body: { errors: ['session ไม่ถูกต้อง'] } };
  if (running.has(session)) stopChat(session);
  let removed = 0;
  try {
    for (const f of fs.readdirSync(CHAT_DIR)) {
      if (f.startsWith(`${session}.`)) { fs.rmSync(path.join(CHAT_DIR, f), { force: true }); removed++; }
    }
  } catch { /* no chats dir */ }
  const a = readActive();
  if (a.chat?.session === session) {
    writeEnvFile(ENV_FILE, { ...a, chat: null }, 'Active MCP config (generated by mcp/setup)');
    const p = a.profile && readProfile(a.profile);
    if (p && p.chat?.session === session) writeEnvFile(profileFile(a.profile), { ...p, chat: null }, `MCP profile "${a.profile}"`);
  }
  log('chat-deleted', { session, files: removed });
  return { status: 200, body: { ok: true, removed } };
}

function currentChat(session) {
  const a = readActive();
  if (!a.chat || a.chat.session !== session) return null;
  return { ...a.chat, agent: a.chat.agent || 'claude', profile: a.profile, data: a };
}

// Streams NDJSON lines to the page: {t:'text'|'tool'|'tool-result'|'done'|'error', ...}
function sendChat(req, res, b) {
  const c = currentChat(b.session);
  if (!c) return send(res, 409, { errors: ['session นี้ไม่ได้ใช้งานอยู่ — เริ่มแชทใหม่อีกครั้ง'] });
  if (running.has(c.session)) return send(res, 409, { errors: ['AI ยังตอบข้อความก่อนหน้าไม่เสร็จ'] });
  const text = String(b.text || '').trim();
  if (!text) return send(res, 400, { errors: ['ข้อความว่าง'] });
  const agent = agentOf(c.agent);
  const adapter = ADAPTERS[agent.type] || ADAPTERS.text;
  const bin = resolveBin(agent.command);
  if (!bin) return send(res, 400, { errors: [`ไม่พบ ${agent.label} ในเครื่อง`] });

  fs.mkdirSync(CHAT_DIR, { recursive: true });
  const projects = chatProjects(c.data, c.dirs?.length ? c.dirs : [c.cwd]);
  const { servers, owners } = chatMcpServers(projects);
  const instructions = chatPrompt(agent, c.profile, projects, c.cwd, owners);
  const extraDirs = [ROOT, ...projects.map((p) => p.path).filter((p) => !samePath(p, c.cwd))];
  const run = adapter.build({ c, servers, instructions, extraDirs, text, agent });

  appendHistory(c.session, { role: 'user', text });
  const child = spawnBin(bin, run.args, { cwd: c.cwd, env: run.env });
  running.set(c.session, child);
  child.stdin.on('error', () => {});
  child.stdin.end(run.stdin || '');

  // The run belongs to the server, not to the page: every event is buffered so a page that navigated
  // away (or was reloaded) can re-attach with /api/chat/stream and see the reply continue live
  const stream = { events: [], done: false, listeners: new Set() };
  streams.set(c.session, stream);
  const out = (o) => {
    touch();
    stream.events.push(o);
    const line = JSON.stringify(o) + '\n';
    for (const l of stream.listeners) if (!l.writableEnded) l.write(line);
  };
  attachStream(res, stream, stream.events.length);
  let reply = '';
  const tools = [];
  let errText = '';
  let done = false;
  const st = { agentSession: run.agentSession || c.agentSession || '' };
  const emit = {
    text: (d) => { if (!d) return; reply += d; out({ t: 'text', d }); },
    gap: () => { if (reply && !reply.endsWith('\n\n')) { reply += '\n\n'; out({ t: 'text', d: '\n\n' }); } },
    tool: (id, name, input) => { tools.push(name); out({ t: 'tool', id, name, input }); },
    toolResult: (id, error) => out({ t: 'tool-result', id, error }),
    error: (message) => out({ t: 'error', message }),
    done: (ok, denied = []) => { done = true; out({ t: 'done', ok, denied }); },
  };

  let buf = '';
  const dec = new (require('string_decoder').StringDecoder)('utf8');
  child.stdout.on('data', (chunk) => {
    const s = dec.write(chunk);
    if (run.raw) return emit.text(s);
    buf += s;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try { adapter.parse(JSON.parse(line), emit, st); } catch { /* not an event line */ }
    }
  });
  child.stderr.on('data', (d) => { errText += d.toString('utf8'); });
  child.on('error', (e) => { errText += e.message; });
  child.on('close', (code) => {
    running.delete(c.session);
    appendHistory(c.session, { role: 'assistant', text: reply.trim(), tools, agent: c.agent });
    if ((run.raw || run.doneOnExit) && !done && !child.stoppedByUser && code === 0) emit.done(true);
    if (!done) out({ t: 'error', message: child.stoppedByUser || code === null ? 'หยุดแล้ว' : (errText.trim().split('\n').pop() || `${agent.command} ออกด้วยรหัส ${code}`) });
    const a = readActive();
    if (a.chat?.session === c.session) {
      saveChat(a.profile, { ...a.chat, agentSession: st.agentSession || a.chat.agentSession || '', updated: new Date().toISOString() });
    }
    stream.done = true;
    for (const l of stream.listeners) l.end();
    stream.listeners.clear();
    setTimeout(() => { if (streams.get(c.session) === stream) streams.delete(c.session); }, 5 * 60 * 1000);
    reloadIfIdle();
  });
  // Leaving the page no longer stops the AI — use the "หยุด" button to stop it
}

// Send buffered events from `from`, then keep the response open for live events until the run ends
function attachStream(res, stream, from) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  for (const o of stream.events.slice(from)) res.write(JSON.stringify(o) + '\n');
  if (stream.done) { res.end(); return; }
  stream.listeners.add(res);
  res.on('close', () => stream.listeners.delete(res));
}

function stopChat(session) {
  const child = running.get(session);
  if (!child) return false;
  child.stoppedByUser = true;
  if (IS_WIN) spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true });
  else child.kill('SIGTERM');
  return true;
}

function openTerminal(cwd, command, title) {
  if (IS_WIN) {
    spawn('cmd', ['/c', 'start', `"${title}"`, '/D', `"${cwd}"`, 'cmd', '/k', command || 'echo.'],
      { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  } else if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\"')}${command ? ` && ${command.replace(/"/g, '\\"')}` : ''}"`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('x-terminal-emulator', ['-e', `bash -lc 'cd "${cwd}"${command ? ` && ${command}` : ''}; exec bash'`], { detached: true, stdio: 'ignore' }).unref();
  }
}

// Open the project in VS Code (several projects → one multi-root workspace, main folder first)
function openVSCode(c, others) {
  let target = c.cwd;
  if (others.length) {
    fs.mkdirSync(CHAT_DIR, { recursive: true });
    target = path.join(CHAT_DIR, `${c.session}.code-workspace`);
    fs.writeFileSync(target, JSON.stringify({ folders: [c.cwd, ...others].map((p) => ({ path: p })) }, null, 2), 'utf8');
  }
  const hasCode = spawnSync(IS_WIN ? 'where code' : 'command -v code', { shell: true }).status === 0;
  if (hasCode) spawn(`code ${cmdQuote(target)}`, { shell: true, detached: true, stdio: 'ignore' }).unref();
  return hasCode;
}

// Hand the same session to the full tool so the conversation continues there
function openProject(b) {
  const c = currentChat(b.session);
  if (!c) return { status: 409, body: { errors: ['session นี้ไม่ได้ใช้งานอยู่'] } };
  if (!UUID.test(c.session)) return { status: 400, body: { errors: ['session ไม่ถูกต้อง'] } };
  if (running.has(c.session)) return { status: 409, body: { errors: ['รอให้ AI ตอบเสร็จก่อน แล้วค่อยเปิดโปรเจค'] } };
  const agent = agentOf(c.agent);
  const adapter = ADAPTERS[agent.type] || ADAPTERS.text;
  const others = (c.dirs || []).filter((d) => !samePath(d, c.cwd));
  const resumeCmd = adapter.resume(c, others, agent);
  if (agent.type !== 'text' && !resumeCmd) return { status: 409, body: { errors: ['ยังไม่มี session ของ AI ตัวนี้ — ส่งข้อความอย่างน้อย 1 ครั้งก่อน'] } };
  const base = { ok: true, agent: c.agent, cwd: c.cwd, dirs: c.dirs, command: resumeCmd };

  if (b.target === 'terminal') {
    openTerminal(c.cwd, resumeCmd, agent.label);
    log('chat-opened', { target: 'terminal', agent: c.agent, session: c.session, cwd: c.cwd });
    return { status: 200, body: { ...base, target: 'terminal' } };
  }

  const hasCode = openVSCode(c, others);
  // VS Code extension deep link that opens this conversation (mcp.json → agents.<id>.vscodeUri):
  //   Claude Code: vscode://anthropic.claude-code/open?session={agentSession}
  //   Codex:       vscode://openai.chatgpt/local/{agentSession}
  const tpl = agent.vscodeUri ?? VSCODE_URI[agent.type];
  const agentSession = agent.type === 'claude' ? c.session : c.agentSession;
  if (tpl && agentSession) {
    const repaired = agent.type === 'claude' ? makeVisibleInVSCode(c.session) : false;
    const uri = tpl.replace('{agentSession}', encodeURIComponent(agentSession)).replace('{session}', encodeURIComponent(c.session));
    // Send the URI once, after the new window has had time to load and focus
    setTimeout(() => openUri(uri), hasCode ? (CONFIG.chat?.vscodeDelayMs ?? 8000) : 0);
    log('chat-opened', { target: 'vscode', agent: c.agent, session: c.session, cwd: c.cwd });
    return { status: 200, body: { ...base, target: 'vscode', uri, openedFolder: hasCode, repaired } };
  }
  // Other tools have no VS Code deep link: open the project in VS Code and the resumed session in a terminal
  if (resumeCmd) openTerminal(c.cwd, resumeCmd, agent.label);
  log('chat-opened', { target: 'vscode+terminal', agent: c.agent, session: c.session, cwd: c.cwd });
  return { status: 200, body: { ...base, target: 'vscode+terminal', openedFolder: hasCode } };
}

// ---------- git login (page "Git"): test repo access, open Chrome on the token page, store the token ----------

const NO_PROMPT = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

function gitRepos() {
  return scanProjects().filter((p) => fs.existsSync(path.join(p.path, '.git'))).map((p) => {
    const r = spawnSync('git', ['-C', p.path, 'remote', 'get-url', 'origin'], { encoding: 'utf8', windowsHide: true });
    const url = (r.stdout || '').trim();
    let host = '';
    try { host = /^https?:/i.test(url) ? new URL(url).host : ''; } catch { /* not a URL */ }
    return { name: p.name, path: p.path, url: url.replace(/\/\/[^@/]+@/, '//'), host, ssh: !!url && !host };
  });
}

// ls-remote without any prompt: works only when a stored credential (or SSH key) is usable
function testRepo(repo) {
  return new Promise((resolve) => {
    if (!repo.url) return resolve({ ...repo, ok: false, error: 'ไม่มี remote origin' });
    const child = spawn('git', ['-C', repo.path, 'ls-remote', '--heads', 'origin'], { env: NO_PROMPT, windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', () => {});
    const timer = setTimeout(() => { child.kill(); }, 20000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const last = err.trim().split('\n').pop() || '';
      resolve({ ...repo, ok: code === 0, error: code === 0 ? '' : /could not read Username|terminal prompts disabled|interactivity/i.test(err)
        ? 'ยังไม่ได้ล็อกอิน (ไม่มีรหัสที่บันทึกไว้)' : /401|403|Authentication failed|denied/i.test(err)
          ? 'รหัส / token ใช้ไม่ได้ หรือไม่มีสิทธิ์ใน repo นี้' : code === null ? 'หมดเวลา (20 วินาที)' : last.slice(0, 160) });
    });
  });
}

function openChrome(url) {
  const chrome = [
    path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ].find((p) => p && fs.existsSync(p));
  if (chrome) spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
  else openUri(url);
  return !!chrome;
}

// Store username + token for https://<host> in the OS credential store (Git Credential Manager on Windows)
function gitSaveLogin(host, username, token) {
  const base = `protocol=https\nhost=${host}\n`;
  spawnSync('git', ['credential', 'reject'], { input: `${base}\n`, env: NO_PROMPT, windowsHide: true });
  const r = spawnSync('git', ['credential', 'approve'], { input: `${base}username=${username}\npassword=${token}\n\n`, env: NO_PROMPT, windowsHide: true, encoding: 'utf8' });
  return r.status === 0 ? null : (r.stderr || 'git credential approve failed').trim();
}

// ---------- reset (web button "ล้างข้อมูลทั้งหมด" and CLI "mcp reset") ----------

const EXAMPLE_TEMPLATE = [
  '# Example of .env (values removed) - safe to share. Run "run mcp" to create the real .env',
  '# Key format: <PROJECT>_<SERVICE>_<FIELD>   e.g. vantive-api -> VANTIVE_API',
  'MCP_PROFILE=', 'MCP_CHAT_SESSION=', 'MCP_CHAT_AGENT=', 'MCP_CHAT_AGENT_SESSION=',
  'MCP_CHAT_CWD=', 'MCP_CHAT_DIRS=', 'MCP_CHAT_MODE=', 'MCP_CHAT_UPDATED=', '',
  '# ===== D:\\<project> =====',
  'PROJECT_PATH=', 'PROJECT_ROLE=', 'PROJECT_SERVICES=',
  'PROJECT_JIRA_EMAIL=', 'PROJECT_JIRA_URL=', 'PROJECT_JIRA_TOKEN=',
  'PROJECT_FIGMA_EMAIL=', 'PROJECT_FIGMA_URL=', 'PROJECT_FIGMA_TOKEN=', '',
].join('\n');

// Removes everything "run mcp" created: per-project MCP registrations, .env, profiles/, chats/.
// Leaves the AI tools' own conversation history (~/.claude, ~/.codex, …) untouched.
function resetAll() {
  for (const session of [...running.keys()]) stopChat(session);
  const sources = [readActive(), ...listProfiles().map((p) => readProfile(p.name) || { projects: {} })];
  const dirs = [...new Map(sources.flatMap((d) => Object.values(d.projects)).map((p) => [p.path.toLowerCase(), p.path])).values()];
  const unregistered = [];
  if (hasClaude()) for (const d of dirs) { if (fs.existsSync(d)) { unregister(d); unregistered.push(d); } }
  const removed = [];
  const profileCount = listProfiles().length;
  for (const [p, label] of [[ENV_FILE, '.env'], [PROFILE_DIR, `profiles/ (${profileCount})`], [CHAT_DIR, 'chats/']]) {
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(label); }
  }
  fs.writeFileSync(ENV_EXAMPLE, EXAMPLE_TEMPLATE, 'utf8');
  return { removed, unregistered };
}

// ---------- HTTP ----------

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(e); } });
  });
}

// Only this machine: Host must be loopback (blocks DNS rebinding), POST Origin must match (blocks CSRF)
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
function allowed(req) {
  if (!LOOPBACK.test(req.headers.host || '')) return false;
  if (req.method === 'GET') return true;
  const origin = req.headers.origin;
  return !!origin && origin === `http://${req.headers.host}`;
}

let idle;
const touch = () => {
  clearTimeout(idle);
  idle = setTimeout(() => { log('stopped', { reason: 'idle' }); process.exit(0); }, IDLE_MS);
};

async function handle(req, res) {
  touch();
  if (!allowed(req)) return send(res, 403, { error: 'forbidden' });
  const url = new URL(req.url, 'http://localhost');
  const r = url.pathname;

  if (req.method === 'GET' && r === '/') {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && r === '/api/ping') {
    let ui = 0;
    try { ui = fs.statSync(path.join(__dirname, 'index.html')).mtimeMs; } catch { /* missing */ }
    return send(res, 200, { app: APP_ID, root: ROOT, ui });
  }

  if (req.method === 'GET' && r === '/api/state') {
    const active = readActive();
    const known = new Map(scanProjects().map((p) => [p.path.toLowerCase(), p]));
    const addKnown = (ps) => Object.values(ps).forEach((p) => {
      if (!known.has(p.path.toLowerCase())) known.set(p.path.toLowerCase(), { path: p.path, name: path.basename(p.path), key: p.key });
    });
    addKnown(active.projects);
    const profiles = listProfiles();
    return send(res, 200, {
      version: CONFIG.version,
      services: CONFIG.services,
      roles: Object.keys(CONFIG.roles),
      projects: [...known.values()],
      active: { profile: active.profile, exists: fs.existsSync(ENV_FILE), chat: active.chat, projects: sanitize(active.projects) },
      chatModes: Object.fromEntries(Object.entries(CHAT_MODES).map(([k, v]) => [k, v.label])),
      agents: Object.entries(AGENTS).map(([id, a]) => ({ id, label: a.label || id, type: a.type || 'text', installed: agentInstalled(id) })),
      launcher: launcher && { ...launcher, label: AGENTS[launcher.id]?.label || launcher.id, installed: agentInstalled(launcher.id) },
      chatRunning: [...running.keys()],
      profiles,
      claude: hasClaude(),
    });
  }

  if (req.method === 'GET' && r === '/api/profile') {
    const d = readProfile(url.searchParams.get('name'));
    if (!d) return send(res, 404, { error: 'ไม่พบโปรไฟล์' });
    return send(res, 200, { name: url.searchParams.get('name'), projects: sanitize(d.projects) });
  }

  if (req.method === 'GET' && r === '/api/chats') return send(res, 200, { chats: listChats() });

  // Re-attach to a reply that is still running (or just finished) after leaving the chat page
  if (req.method === 'GET' && r === '/api/chat/stream') {
    const s = streams.get(url.searchParams.get('session') || '');
    if (!s) return send(res, 200, { idle: true });
    return attachStream(res, s, Math.max(0, parseInt(url.searchParams.get('from') || '0', 10) || 0));
  }

  if (req.method === 'GET' && r === '/api/git/status') {
    const repos = await Promise.all(gitRepos().map(testRepo));
    return send(res, 200, { repos, hosts: [...new Set(repos.map((x) => x.host).filter(Boolean))] });
  }

  if (req.method === 'GET' && r === '/api/chat/history') {
    const s = url.searchParams.get('session') || '';
    return send(res, 200, { session: s, history: UUID.test(s) ? readHistory(s) : [], running: running.has(s) });
  }

  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await readBody(req);

  if (r === '/api/check-path') {
    const p = path.resolve(String(b.path || ''));
    const ok = fs.existsSync(p) && fs.statSync(p).isDirectory();
    return send(res, 200, ok ? { ok, path: p, name: path.basename(p), key: projectKey(p) } : { ok, message: 'ไม่พบโฟลเดอร์นี้' });
  }

  if (r === '/api/test') {
    const src = sourceData(b.source);
    const f = { ...b.fields };
    const saved = src.projects[projectKey(b.copyFrom || b.project || '')]?.fields?.[b.service];
    if (!f.token && saved) f.token = saved.token || '';
    return send(res, 200, await testService(b.service, f).catch((e) => ({ ok: false, message: e.message })));
  }

  // Save the active config (run mcp). Optional: also save it as a profile
  if (r === '/api/save-active') {
    const active = readActive();
    const { errors, projects } = buildProjects(b.projects, active);
    const asProfile = b.saveAsProfile ? validName(b.saveAsProfile) : null;
    if (b.saveAsProfile && !asProfile) errors.push('ชื่อโปรไฟล์ใช้ไม่ได้ (ห้ามมี < > : " / \\ | ? *)');
    if (errors.length) return send(res, 400, { errors });
    const next = { profile: asProfile || active.profile || '', chat: active.chat, projects };
    const result = applyActive(next);
    if (asProfile) writeEnvFile(profileFile(asProfile), { profile: asProfile, chat: readProfile(asProfile)?.chat || active.chat, projects }, `MCP profile "${asProfile}"`);
    log('saved', { target: 'active', profile: next.profile, ...result });
    return send(res, 200, { ok: true, profile: next.profile, ...result });
  }

  // Create / edit a profile (mcp profile). Optional: switch to it right away
  if (r === '/api/save-profile') {
    const name = validName(b.name);
    const oldName = b.oldName ? validName(b.oldName) : null;
    const existing = (oldName && readProfile(oldName)) || (name && readProfile(name)) || (b.copyFromActive ? readActive() : { projects: {} });
    const { errors, projects } = buildProjects(b.projects, existing);
    if (!name) errors.push('ชื่อโปรไฟล์ใช้ไม่ได้ (ห้ามว่าง และห้ามมี < > : " / \\ | ? *)');
    if (name && name !== oldName && fs.existsSync(profileFile(name))) errors.push(`มีโปรไฟล์ชื่อ "${name}" อยู่แล้ว`);
    if (errors.length) return send(res, 400, { errors });
    const chat = oldName || !b.copyFromActive ? existing.chat || null : null;
    writeEnvFile(profileFile(name), { profile: name, chat, projects }, `MCP profile "${name}"`);
    if (oldName && oldName !== name) fs.rmSync(profileFile(oldName), { force: true });
    const active = readActive();
    const renamedActive = oldName && active.profile === oldName && oldName !== name;
    let result = null;
    if (b.apply || active.profile === name || renamedActive) result = applyActive({ profile: name, chat, projects });
    log('saved', { target: 'profile', profile: name, applied: !!result });
    return send(res, 200, { ok: true, name, applied: !!result, ...(result || {}) });
  }

  if (r === '/api/save-active-as-profile') {
    const name = validName(b.name);
    if (!name) return send(res, 400, { errors: ['ชื่อโปรไฟล์ใช้ไม่ได้'] });
    if (fs.existsSync(profileFile(name))) return send(res, 400, { errors: [`มีโปรไฟล์ชื่อ "${name}" อยู่แล้ว`] });
    const active = readActive();
    if (!Object.keys(active.projects).length) return send(res, 400, { errors: ['ยังไม่มีค่าที่ใช้งานอยู่'] });
    writeEnvFile(profileFile(name), { profile: name, chat: active.chat, projects: active.projects }, `MCP profile "${name}"`);
    writeEnvFile(ENV_FILE, { profile: name, chat: active.chat, projects: active.projects }, 'Active MCP config (generated by mcp/setup)');
    log('saved', { target: 'profile', profile: name, fromActive: true });
    return send(res, 200, { ok: true, name });
  }

  if (r === '/api/switch') {
    const d = readProfile(b.name);
    if (!d) return send(res, 404, { errors: ['ไม่พบโปรไฟล์'] });
    const result = applyActive({ profile: b.name, chat: d.chat, projects: d.projects });
    log('switched', { profile: b.name, ...result });
    return send(res, 200, { ok: true, profile: b.name, ...result });
  }

  if (r === '/api/delete-profile') {
    const name = validName(b.name);
    if (!name || !fs.existsSync(profileFile(name))) return send(res, 404, { errors: ['ไม่พบโปรไฟล์'] });
    fs.rmSync(profileFile(name));
    const active = readActive();
    if (active.profile === name) writeEnvFile(ENV_FILE, { profile: '', chat: active.chat, projects: active.projects }, 'Active MCP config (generated by mcp/setup)');
    log('deleted', { profile: name });
    return send(res, 200, { ok: true });
  }

  if (r === '/api/launcher') {
    if (AGENTS[b.agent]) { launcher = { id: b.agent, via: b.via || 'argument' }; process.send?.({ launcher: b.agent }); }
    return send(res, 200, { ok: true, launcher });
  }
  if (r === '/api/chat/start') { const o = startChat(b); return send(res, o.status, o.body); }
  if (r === '/api/git/open-token') {
    const host = String(b.host || 'gitlab.com').replace(/[^a-z0-9.:-]/gi, '');
    const url = /gitlab/i.test(host)
      ? `https://${host}/-/user_settings/personal_access_tokens?name=git-cli-${encodeURIComponent(require('os').hostname())}&scopes=read_repository,write_repository`
      : /github/i.test(host) ? 'https://github.com/settings/tokens/new?scopes=repo&description=git-cli' : `https://${host}/`;
    return send(res, 200, { ok: true, chrome: openChrome(url) });
  }
  if (r === '/api/git/login') {
    const host = String(b.host || '').trim();
    const username = String(b.username || '').trim().replace(/^@/, '');
    const token = String(b.token || '').trim();
    if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return send(res, 400, { errors: ['host ไม่ถูกต้อง เช่น gitlab.com'] });
    if (!username || /[\s\n]/.test(username)) return send(res, 400, { errors: ['กรอกชื่อผู้ใช้ (ไม่มีช่องว่าง)'] });
    if (!token || /[\s\n]/.test(token)) return send(res, 400, { errors: ['กรอก token (ไม่มีช่องว่าง)'] });
    const err = gitSaveLogin(host, username, token);
    if (err) return send(res, 500, { errors: [err] });
    const repos = await Promise.all(gitRepos().filter((x) => x.host === host).map(testRepo));
    log('git-login', { host, username, ok: repos.filter((x) => x.ok).length, fail: repos.filter((x) => !x.ok).length });
    return send(res, 200, { ok: true, repos });
  }

  if (r === '/api/chat/reopen') { const o = reopenChat(b.session); return send(res, o.status, o.body); }
  if (r === '/api/chat/delete') { const o = deleteChat(b.session); return send(res, o.status, o.body); }
  if (r === '/api/chat/send') return sendChat(req, res, b);
  if (r === '/api/chat/stop') return send(res, 200, { ok: stopChat(String(b.session || '')) });
  if (r === '/api/chat/open') { const o = openProject(b); return send(res, o.status, o.body); }

  if (r === '/api/reset') {
    const result = resetAll();
    log('reset', result);
    return send(res, 200, { ok: true, ...result });
  }

  if (r === '/api/shutdown') {
    send(res, 200, { ok: true });
    log('stopped', { reason: 'user' });
    setTimeout(() => process.exit(0), 300);
    return;
  }

  send(res, 404, { error: 'not found' });
}

// ---------- start (single instance) ----------

const pageUrl = (port) => `http://localhost${port === 80 ? '' : ':' + port}/${route ? '#/' + route : ''}`;

function openBrowser(link) {
  if (!process.argv.includes('--no-open')) openUri(link);
}

function openUri(link) {
  const [cmd, args] = IS_WIN ? ['cmd', ['/c', 'start', '""', link]]
    : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: IS_WIN }).unref();
}

async function findRunning() {
  for (const port of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(800) });
      const j = await r.json();
      if (j.app === APP_ID && path.resolve(j.root) === ROOT) return port;
    } catch { /* not ours / not running */ }
  }
  return null;
}

function listen(server, ports) {
  return new Promise((resolve, reject) => {
    const tryNext = (i) => {
      const port = i < ports.length ? ports[i] : 0;
      server.once('error', (e) => (i < ports.length && ['EADDRINUSE', 'EACCES'].includes(e.code) ? tryNext(i + 1) : reject(e)));
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    };
    tryNext(0);
  });
}

// Hot reload: this process only watches setup/server.js and runs the real panel as a child.
// Saving server.js → syntax check → restart the child on the same port (a file with errors is ignored,
// the running version keeps serving). index.html, README.md and mcp.json are already read live.
function supervise(detected) {
  let child = null;
  let reloading = false;
  let opened = process.argv.includes('--no-open');
  let agent = detected?.id || '';
  const start = () => {
    const args = [__filename, ...process.argv.slice(2).filter((a) => a !== '--no-open'), ...(opened ? ['--no-open'] : [])];
    child = spawn(process.execPath, args, {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, MCP_CHILD: '1', ...(agent ? { MCP_AGENT: agent } : {}) },
    });
    opened = true;
    child.on('message', (m) => { if (m?.launcher) agent = m.launcher; }); // keep "which AI ran run mcp" across reloads
    child.on('exit', (code) => {
      if (reloading) { reloading = false; start(); return; }
      process.exit(code ?? 0); // Shutdown button / idle timeout → stop watching too
    });
  };
  let last = fs.statSync(__filename).mtimeMs;
  fs.watchFile(__filename, { interval: 1000 }, (cur) => {
    if (cur.mtimeMs === last) return;
    last = cur.mtimeMs;
    const check = spawnSync(process.execPath, ['--check', __filename], { encoding: 'utf8' });
    if (check.status !== 0) {
      console.log(`server.js has an error - not reloaded, the running version keeps serving:\n${(check.stderr || '').trim().split('\n').slice(0, 5).join('\n')}`);
      return;
    }
    console.log('server.js changed - reloading (after running chats finish)...');
    reloading = true;
    if (child.connected) child.send({ reload: true }); // child exits when no chat is running
    else child.kill();
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { reloading = false; child?.kill(); process.exit(0); });
  start();
}

(async () => {
  if (process.argv[2] === 'reset') {
    // CLI: mcp reset [--yes]
    if (!process.argv.includes('--yes')) {
      const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
      const ans = await new Promise((r) => rl.question('Delete .env, profiles/, chats/ and the MCP registrations they created? Type Y to confirm: ', r));
      rl.close();
      if (String(ans).trim().toUpperCase() !== 'Y') { console.log('Cancelled.'); return; }
    }
    const r = resetAll();
    console.log(`Removed: ${r.removed.join(', ') || '(nothing)'}`);
    console.log(`MCP unregistered from: ${r.unregistered.join(', ') || '(none)'}`);
    console.log('Reset .env.example to the template. Done.');
    return;
  }
  const detected = detectLauncher();
  const running = process.env.MCP_CHILD === '1' ? null : await findRunning();
  if (running) {
    const link = pageUrl(running);
    if (detected) {
      // tell the running panel which AI issued this "run mcp"
      const base = `http://localhost${running === 80 ? '' : ':' + running}`;
      await fetch(`${base}/api/launcher`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ agent: detected.id, via: detected.via }),
      }).catch(() => {});
    }
    console.log(`MCP control panel already running: ${link}${detected ? ` (AI: ${detected.id})` : ''}`);
    openBrowser(link);
    return;
  }
  if (process.env.MCP_CHILD !== '1' && !process.argv.includes('--no-reload')) return supervise(detected);
  launcher = detected;
  const server = http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { error: e.message })));
  const port = await listen(server, PORTS);
  const link = pageUrl(port);
  console.log(`MCP control panel: ${link}${launcher ? ` (AI: ${launcher.id} via ${launcher.via})` : ''}`);
  console.log(`Stops after ${IDLE_MS / 60000} min idle, or with the Shutdown button on the page.`);
  touch();
  openBrowser(link);
})();
