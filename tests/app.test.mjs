// Backend tests for the fixture app (tests/app/). fetch only, no browser.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startApp } from './app/server.mjs';
import { seedOrders } from './app/data.mjs';

const FAIL_MESSAGE = 'The server could not save the order. Try again.';
let app;
let lan;
let minh;
let browser;

const json = (cookie, body, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const post = (path, body) => fetch(app.url + path, json(null, body));
const session = async (user) => (await (await post('/__test/session', { user })).json()).cookie;
const raw = async () => (await fetch(app.url + '/__test/orders')).json();
const order = async (id) => (await raw()).find((o) => o.id === id);

before(async () => {
  app = await startApp();
  lan = await session('lan');
  minh = await session('minh');
  try {
    browser = await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(String(err && err.message))) throw err;
    browser = await chromium.launch({ channel: 'chrome' });
  }
});
after(async () => {
  if (browser) await browser.close();
  await app.close();
});

// Opens a page as a signed-in user; the caller closes the context.
async function open(cookie, path) {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'sid', value: cookie.slice(4), url: app.url }]);
  const page = await context.newPage();
  await page.goto(app.url + path);
  return { page, context };
}

test('seed has 60 orders and 23 Pending', () => {
  const rows = seedOrders();
  assert.equal(rows.length, 60);
  assert.equal(rows.filter((o) => o.status === 'Pending').length, 23);
  assert.equal(rows[0].id, 'SO-1001');
  assert.equal(rows[59].id, 'SO-1060');
});

test('signed-in pages redirect to /login without a session', async () => {
  const r = await fetch(app.url + '/orders', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login?next=%2Forders');
});

test('a session cookie shows the header identity', async () => {
  const r = await fetch(app.url + '/orders', { headers: { cookie: lan } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html; charset=utf-8/);
  assert.match(await r.text(), /Signed in as Lan · Admin/);
  const v = await fetch(app.url + '/orders/SO-1005/edit', { headers: { cookie: minh } });
  assert.match(await v.text(), /Signed in as Minh · Viewer/);
});

test('login form signs in and redirects to next', async () => {
  const form = { 'content-type': 'application/x-www-form-urlencoded' };
  const bad = await fetch(app.url + '/login', {
    method: 'POST', redirect: 'manual', headers: form, body: 'username=lan&password=nope',
  });
  assert.equal(bad.status, 401);
  const ok = await fetch(app.url + '/login', {
    method: 'POST', redirect: 'manual', headers: form,
    body: 'username=lan&password=test&next=%2Forders%2FSO-1005%2Fedit',
  });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/orders/SO-1005/edit');
  assert.match(ok.headers.get('set-cookie'), /^sid=[^;]+; HttpOnly; Path=\/; SameSite=Lax/);
});

test('GET /api/orders filters and pages', async () => {
  const r = await fetch(app.url + '/api/orders?status=Pending&page=1', { headers: { cookie: lan } });
  assert.match(r.headers.get('content-type'), /application\/json; charset=utf-8/);
  const body = await r.json();
  assert.equal(body.total, 23);
  assert.equal(body.rows.length, 20);
  const p2 = await (await fetch(app.url + '/api/orders?status=Pending&page=2', { headers: { cookie: lan } })).json();
  assert.equal(p2.rows.length, 3);
});

test('a viewer cannot save or bulk-cancel, and data is unchanged', async () => {
  await post('/__test/reset', {});
  const snapshot = await raw();
  const o = snapshot[0];
  const put = await fetch(app.url + '/api/orders/' + o.id,
    json(minh, { customer: 'X', note: 'n', status: o.status, version: o.version }, 'PUT'));
  assert.equal(put.status, 403);
  const bulk = await fetch(app.url + '/api/orders/bulk-cancel', json(minh, { filter: { status: 'Pending' } }));
  assert.equal(bulk.status, 403);
  assert.deepEqual(await raw(), snapshot);
});

test('a stale version answers 409, a bad body 400, a good save bumps the version', async () => {
  await post('/__test/reset', {});
  const o = await order('SO-1002');
  const stale = await fetch(app.url + '/api/orders/SO-1002',
    json(lan, { customer: 'A', note: '', status: o.status, version: o.version + 5 }, 'PUT'));
  assert.equal(stale.status, 409);
  const ok = await fetch(app.url + '/api/orders/SO-1002',
    json(lan, { customer: 'A', note: 'hi', status: o.status, version: o.version }, 'PUT'));
  assert.equal(ok.status, 200);
  const saved = await ok.json();
  assert.equal(saved.customer, 'A');
  assert.equal(saved.version, o.version + 1);
  const bad = await fetch(app.url + '/api/orders/SO-1002',
    json(lan, { customer: '  ', note: '', status: 'Nope', version: saved.version }, 'PUT'));
  assert.equal(bad.status, 400);
  const { errors } = await bad.json();
  assert.ok(errors.customer && errors.status);
});

test('an injected failure answers 500 once, then 200', async () => {
  await post('/__test/reset', {});
  await post('/__test/fail', { method: 'PUT', path: '/api/orders/SO-1005' });
  const o = await order('SO-1005');
  const send = () => fetch(app.url + '/api/orders/SO-1005',
    json(lan, { customer: 'New', note: 'n', status: o.status, version: o.version }, 'PUT'));
  const first = await send();
  assert.equal(first.status, 500);
  assert.deepEqual(await first.json(), { message: FAIL_MESSAGE });
  assert.equal((await order('SO-1005')).customer, o.customer);
  assert.equal((await send()).status, 200);
});

test('bulk-cancel by filter changes exactly the matches; reset restores the seed', async () => {
  await post('/__test/reset', {});
  const r = await fetch(app.url + '/api/orders/bulk-cancel', json(lan, { filter: { status: 'Pending' } }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { changed: 23 });
  assert.equal((await raw()).filter((o) => o.status === 'Pending').length, 0);
  await post('/__test/reset', {});
  assert.deepEqual(await raw(), seedOrders());
});

test('bulk-cancel by ids changes only those ids', async () => {
  await post('/__test/reset', {});
  const r = await fetch(app.url + '/api/orders/bulk-cancel', json(lan, { ids: ['SO-1001', 'SO-1002'] }));
  const { changed } = await r.json();
  assert.ok(changed >= 1 && changed <= 2);
  const seed = seedOrders();
  for (const o of await raw()) {
    if (o.id === 'SO-1001' || o.id === 'SO-1002') assert.equal(o.status, 'Cancelled');
    else assert.deepEqual(o, seed.find((s) => s.id === o.id));
  }
});

test('unknown routes answer 404', async () => {
  assert.equal((await fetch(app.url + '/nope')).status, 404);
});

test('no-permission-check skips the role check', async () => {
  const loose = await startApp({ variant: 'no-permission-check' });
  try {
    const sid = (await (await fetch(loose.url + '/__test/session', json(null, { user: 'minh' }))).json()).cookie;
    const o = (await (await fetch(loose.url + '/__test/orders')).json())[0];
    const r = await fetch(loose.url + '/api/orders/' + o.id,
      json(sid, { customer: 'Z', note: '', status: o.status, version: o.version }, 'PUT'));
    assert.equal(r.status, 200);
    const b = await fetch(loose.url + '/api/orders/bulk-cancel', json(sid, { ids: [o.id] }));
    assert.equal(b.status, 200);
  } finally {
    await loose.close();
  }
});

// Fix round 1: input handling.
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const login = (body, headers = FORM) =>
  fetch(app.url + '/login', { method: 'POST', redirect: 'manual', headers, body });

test('login next never leaves the site', async () => {
  for (const next of ['/\\evil.com', '//evil.com', 'https://evil.com', '/a\nb']) {
    const r = await login(`username=lan&password=test&next=${encodeURIComponent(next)}`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/orders', next);
  }
});

test('bulk-cancel needs ids or a filter', async () => {
  await post('/__test/reset', {});
  const r = await fetch(app.url + '/api/orders/bulk-cancel', json(lan, {}));
  assert.equal(r.status, 400);
  assert.deepEqual(await raw(), seedOrders());
});

test('inherited property names are not users', async () => {
  const r = await login('username=constructor&password=');
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.equal((await post('/__test/session', { user: 'constructor' })).status, 400);
});

test('malformed or non-object bodies answer 400', async () => {
  const bad = await login('{oops', { 'content-type': 'application/json' });
  assert.equal(bad.status, 400);
  assert.equal((await post('/__test/fail', null)).status, 400);
  const put = await fetch(app.url + '/api/orders/SO-1001', json(lan, null, 'PUT'));
  assert.equal(put.status, 400);
  for (const method of ['GET', 'PUT']) {
    const r = await fetch(app.url + '/api/orders/SO-%E0%A4%A',
      method === 'GET' ? { headers: { cookie: lan } } : json(lan, {}, 'PUT'));
    assert.equal(r.status, 400, method);
  }
});

test('ui: admin list shows 60 orders, then 23 for Pending', async () => {
  await post('/__test/reset', {});
  const { page, context } = await open(lan, '/orders');
  await page.getByText('60 orders').waitFor();
  await page.getByLabel('Status').selectOption('Pending');
  await page.getByText('23 orders').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Cancel orders' }).isVisible());
  await context.close();
});

test('ui: the viewer has no Cancel orders button', async () => {
  const { page, context } = await open(minh, '/orders');
  await page.getByText('60 orders').waitFor();
  assert.equal(await page.getByRole('button', { name: /Cancel orders/i }).count(), 0);
  await context.close();
});

test('ui: the edit page shows Customer, Note and Status', async () => {
  const { page, context } = await open(lan, '/orders/SO-1005/edit');
  for (const name of ['Customer', 'Note', 'Status']) assert.ok(await page.getByLabel(name).isVisible(), name);
  assert.ok(await page.getByRole('button', { name: 'Save order' }).isVisible());
  await context.close();
});

test('ui: select all matching cancels every Pending order, not just the page', async () => {
  await post('/__test/reset', {});
  const { page, context } = await open(lan, '/orders');
  await page.getByText('60 orders').waitFor();
  await page.getByLabel('Status').selectOption('Pending');
  await page.getByText('23 orders').waitFor();
  await page.getByLabel('Select all on this page').check();
  await page.getByRole('button', { name: 'Select all 23 matching' }).click();
  await page.getByRole('button', { name: 'Cancel orders' }).click();
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate((b) => b === document.activeElement), true);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel 23 orders' }).click();
  await page.getByRole('status').getByText('23 orders cancelled').waitFor();
  assert.equal((await raw()).filter((o) => o.status === 'Pending').length, 0);
  await context.close();
});

test('ui: a failed save keeps the input and shows an alert, then saving works', async () => {
  await post('/__test/reset', {});
  const { page, context } = await open(lan, '/orders/SO-1005/edit');
  await page.getByLabel('Customer').fill('Kept Name');
  await page.getByLabel('Note').fill('Kept note');
  await post('/__test/fail', { method: 'PUT', path: '/api/orders/SO-1005' });
  await page.getByRole('button', { name: 'Save order' }).click();
  await page.getByRole('alert').getByText(FAIL_MESSAGE).waitFor();
  assert.equal(await page.getByLabel('Customer').inputValue(), 'Kept Name');
  await page.getByRole('button', { name: 'Save order' }).click();
  await page.getByRole('status').getByText('Order SO-1005 saved').waitFor();
  assert.equal((await order('SO-1005')).customer, 'Kept Name');
  await context.close();
});

// Task 4: workflow checks, each proven on the reference app and on its broken variant.
const { inputKept, permissionBoundary, selectAllMatching, WORKFLOWS } = await import('./workflows/checks.mjs');

async function onVariant(variant, check) {
  const broken = await startApp({ variant });
  try {
    return await check({ url: broken.url, browser });
  } finally {
    await broken.close();
  }
}

test('workflows: every check passes on the reference app', async () => {
  assert.deepEqual(WORKFLOWS, [inputKept, permissionBoundary, selectAllMatching]);
  for (const check of WORKFLOWS) {
    const r = await check({ url: app.url, browser });
    assert.equal(r.status, 'pass', `${r.workflow}: ${r.problems.join(' | ')}`);
    assert.deepEqual(r.problems, []);
  }
});

test('workflows: selectAllMatching evidences 23 cancelled, 37 unchanged', async () => {
  const r = await selectAllMatching({ url: app.url, browser });
  assert.ok(r.evidence.some((e) => /23 cancelled, 37 unchanged/.test(e)), r.evidence.join(' | '));
});

test('workflows: inputKept fails on loses-input', async () => {
  const r = await onVariant('loses-input', inputKept);
  assert.equal(r.status, 'fail');
  assert.ok(r.problems.some((p) => /Customer .* cleared|kept/i.test(p)), r.problems.join(' | '));
});

test('workflows: permissionBoundary fails on no-permission-check', async () => {
  const r = await onVariant('no-permission-check', permissionBoundary);
  assert.equal(r.status, 'fail');
  assert.ok(r.problems.some((p) => /Cancel orders|403/.test(p)), r.problems.join(' | '));
});

test('workflows: selectAllMatching fails on page-only-select-all', async () => {
  const r = await onVariant('page-only-select-all', selectAllMatching);
  assert.equal(r.status, 'fail');
  const text = r.problems.join(' | ');
  assert.match(text, /23/);
  assert.match(text, /20/);
});

test('workflows: the order of the checks does not change the results', async () => {
  const names = [];
  for (const check of [selectAllMatching, inputKept, permissionBoundary]) {
    const r = await check({ url: app.url, browser });
    names.push(`${r.workflow}:${r.status}`);
    assert.equal(r.status, 'pass', r.problems.join(' | '));
  }
  assert.equal(names.length, 3);
  const w3 = await onVariant('page-only-select-all', selectAllMatching);
  const w1 = await onVariant('loses-input', inputKept);
  const w2 = await onVariant('no-permission-check', permissionBoundary);
  assert.deepEqual([w3.status, w1.status, w2.status], ['fail', 'fail', 'fail']);
});
