// Fixture app: a tiny authenticated orders app with a disposable in-memory
// backend. Dev-only; never deployed. Node built-ins only, no network access.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { STATUSES, USERS, seedOrders } from './data.mjs';
import { editPage, ordersPage } from './pages.mjs';

export const VARIANTS = ['reference', 'loses-input', 'no-permission-check', 'page-only-select-all'];
export const FAIL_MESSAGE = 'The server could not save the order. Try again.';
const MAX_BODY = 64 * 1024;
const PAGE_SIZE = 20;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
body{margin:0;font:14px/20px system-ui,sans-serif;color:#1f2937;background:#f9fafb}
header{display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:#fff;border-bottom:1px solid #d1d5db}
header a{color:#1d4ed8}
header button{height:32px;padding:0 12px;background:#fff;color:#1d4ed8;border-color:#9ca3af}
main{padding:24px;max-width:1100px;margin:0 auto}
label{display:block;font-weight:600;margin-bottom:4px}
input,select,textarea{font:inherit;padding:8px;border:1px solid #6b7280;border-radius:4px}
button{font:inherit;padding:8px 16px;border:1px solid #1d4ed8;border-radius:4px;background:#1d4ed8;color:#fff;cursor:pointer}
`;

/** Wrap content in a full HTML document. */
export function renderDocument({ title, body, head = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style>${head}</head><body>${body}</body></html>`;
}

/**
 * Page shell for signed-in pages: header with the identity, then <main>.
 * Task 3 passes the page content as `main` (and optional `head` for styles/scripts).
 */
export function renderShell({ user, title, main = '', head = '', variant = 'reference' }) {
  const body = `<header><strong>Order admin</strong>
<span>Signed in as ${esc(user.name)} · ${esc(user.roleLabel)}</span>
<form method="post" action="/logout"><button type="submit">Sign out</button></form></header>
<main data-variant="${esc(variant)}">${main}</main>`;
  return renderDocument({ title, body, head });
}

function loginPage(next, error) {
  const body = `<main><h1>Sign in</h1>${error ? `<p role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}">
<p><label for="username">Username</label><input id="username" name="username" autocomplete="username"></p>
<p><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password"></p>
<button type="submit">Sign in</button></form></main>`;
  return renderDocument({ title: 'Sign in', body });
}

// Same-site paths only: no //host, no backslash (browsers read it as /), no control characters.
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(n) ? n : '/orders');
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const userNamed = (name) => (typeof name === 'string' && Object.hasOwn(USERS, name) ? USERS[name] : null);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};
  let data;
  try { data = JSON.parse(text); } catch { throw badRequest('Invalid JSON'); }
  if (!isObject(data)) throw badRequest('Body must be a JSON object');
  return data;
}

export async function startApp({ port = 0, variant = 'reference' } = {}) {
  if (!VARIANTS.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
  let orders = seedOrders();
  let failures = [];
  const sessions = new Map();

  const send = (res, status, type, text, headers = {}) => {
    res.writeHead(status, { 'content-type': type, ...headers });
    res.end(text);
  };
  const sendJson = (res, status, data) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(data));
  const sendHtml = (res, status, html) => send(res, status, 'text/html; charset=utf-8', html);
  const redirect = (res, to, headers = {}) => { res.writeHead(302, { location: to, ...headers }); res.end(); };
  const cookie = (sid) => `sid=${sid}; HttpOnly; Path=/; SameSite=Lax`;

  const userOf = (req) => {
    const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
    return m ? sessions.get(m[1]) || null : null;
  };

  const match = (o, { status, q }) =>
    (!status || o.status === status) &&
    (!q || `${o.id} ${o.customer}`.toLowerCase().includes(String(q).toLowerCase()));

  const canWrite = (user) => variant === 'no-permission-check' || user.role === 'admin';

  const takeFailure = (method, path) => {
    const f = failures.find((x) => x.method === method && x.path === path && x.times > 0);
    if (!f) return false;
    f.times -= 1;
    return true;
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const method = req.method;

    if (path.startsWith('/__test/')) {
      if (method === 'POST' && path === '/__test/reset') {
        orders = seedOrders();
        failures = [];
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && path === '/__test/fail') {
        const { method: m, path: p, times = 1 } = await readJson(req);
        failures.push({ method: String(m).toUpperCase(), path: p, times });
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'GET' && path === '/__test/orders') return sendJson(res, 200, orders);
      if (method === 'POST' && path === '/__test/session') {
        const { user } = await readJson(req);
        if (!userNamed(user)) return sendJson(res, 400, { message: 'Unknown user' });
        const sid = randomUUID();
        sessions.set(sid, userNamed(user));
        return sendJson(res, 200, { cookie: `sid=${sid}` });
      }
      return sendJson(res, 404, { message: 'Not found' });
    }

    if (path === '/login' && method === 'GET') return sendHtml(res, 200, loginPage(safeNext(url.searchParams.get('next')), ''));
    if (path === '/login' && method === 'POST') {
      const text = await readBody(req);
      let form;
      if ((req.headers['content-type'] || '').includes('json')) {
        try { form = JSON.parse(text || '{}'); } catch { throw badRequest('Invalid JSON'); }
        if (!isObject(form)) throw badRequest('Body must be a JSON object');
      } else form = Object.fromEntries(new URLSearchParams(text));
      const user = userNamed(form.username);
      const next = safeNext(form.next);
      if (!user || user.password !== form.password) return sendHtml(res, 401, loginPage(next, 'Wrong username or password.'));
      const sid = randomUUID();
      sessions.set(sid, user);
      return redirect(res, next, { 'set-cookie': cookie(sid) });
    }
    if (path === '/logout' && method === 'POST') {
      const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
      if (m) sessions.delete(m[1]);
      return redirect(res, '/login', { 'set-cookie': 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
    }

    const editMatch = /^\/orders\/([^/]+)\/edit$/.exec(path);
    if (method === 'GET' && (path === '/orders' || editMatch)) {
      const user = userOf(req);
      if (!user) return redirect(res, `/login?next=${encodeURIComponent(path)}`);
      if (!editMatch) return sendHtml(res, 200, renderShell({ user, variant, title: 'Orders', ...ordersPage({ user, variant }) }));
      let id;
      try { id = decodeURIComponent(editMatch[1]); } catch { return sendHtml(res, 400, renderShell({ user, variant, title: 'Bad request', main: '<h1>Bad request</h1>' })); }
      const order = orders.find((o) => o.id === id);
      if (!order) return sendHtml(res, 404, renderShell({ user, variant, title: 'Not found', main: '<h1>Order not found</h1><p><a href="/orders">Back to orders</a></p>' }));
      return sendHtml(res, 200, renderShell({ user, variant, title: `Edit order ${order.id}`, ...editPage({ user, variant, order }) }));
    }

    if (path.startsWith('/api/')) {
      const user = userOf(req);
      if (!user) return sendJson(res, 401, { message: 'Sign in required' });
      try { decodeURIComponent(path); } catch { return sendJson(res, 400, { message: 'Malformed path' }); }

      if (method === 'GET' && path === '/api/orders') {
        const size = Math.max(1, Number(url.searchParams.get('size')) || PAGE_SIZE);
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const hits = orders.filter((o) => match(o, { status: url.searchParams.get('status'), q: url.searchParams.get('q') }));
        return sendJson(res, 200, { rows: hits.slice((page - 1) * size, page * size), total: hits.length });
      }

      if (method === 'POST' && path === '/api/orders/bulk-cancel') {
        const body = await readJson(req);
        if (!canWrite(user)) return sendJson(res, 403, { message: 'You do not have permission to cancel orders.' });
        if (!Array.isArray(body.ids) && !isObject(body.filter)) return sendJson(res, 400, { message: 'Send ids or a filter.' });
        const hits = Array.isArray(body.ids)
          ? orders.filter((o) => body.ids.includes(o.id))
          : orders.filter((o) => match(o, body.filter));
        let changed = 0;
        for (const o of hits) {
          if (o.status === 'Cancelled') continue;
          o.status = 'Cancelled';
          o.version += 1;
          changed += 1;
        }
        return sendJson(res, 200, { changed });
      }

      const put = /^\/api\/orders\/([^/]+)$/.exec(path);
      if (put && method === 'PUT') {
        const body = await readJson(req);
        if (!canWrite(user)) return sendJson(res, 403, { message: 'You do not have permission to edit orders.' });
        if (takeFailure('PUT', path)) return sendJson(res, 500, { message: FAIL_MESSAGE });
        const o = orders.find((x) => x.id === decodeURIComponent(put[1]));
        if (!o) return sendJson(res, 404, { message: 'Order not found' });
        const errors = {};
        if (typeof body.customer !== 'string' || !body.customer.trim()) errors.customer = 'Enter a customer name.';
        if (!STATUSES.includes(body.status)) errors.status = 'Choose a valid status.';
        if (body.note != null && typeof body.note !== 'string') errors.note = 'Note must be text.';
        if (Object.keys(errors).length) return sendJson(res, 400, { errors });
        if (body.version !== o.version) return sendJson(res, 409, { message: 'This order was changed by someone else. Reload and try again.' });
        o.customer = body.customer.trim();
        o.note = body.note || '';
        o.status = body.status;
        o.version += 1;
        return sendJson(res, 200, o);
      }
    }

    return sendJson(res, 404, { message: 'Not found' });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, err.status || 500, { message: err.message });
      else res.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

// Standalone: node tests/app/server.mjs [--variant v] [--port n]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const app = await startApp({ port: Number(arg('--port')) || 0, variant: arg('--variant') || 'reference' });
  console.log(app.url);
}
