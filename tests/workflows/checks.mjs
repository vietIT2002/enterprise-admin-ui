// Workflow checks: drive the orders UI the way a person would (Playwright), then verify the backend's state.
// Each check resets the app, makes its own browser context, signs in through /__test/session and closes the context.
// The names, labels and roles they rely on are listed in CONTRACT.md.
const TIMEOUT = 5000;

const postJson = (url, path, body, cookie) =>
  fetch(url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const serverOrders = async (url) => (await fetch(url + '/__test/orders')).json();

const WHO = { lan: 'Lan · Admin', minh: 'Minh · Viewer' };

// ctx.cookie (optional, for tests): use this cookie instead of a fresh /__test/session, e.g. an invalid one.
async function start(ctx, user, s) {
  await postJson(ctx.url, '/__test/reset', {});
  let cookie = ctx.cookie;
  if (!cookie) {
    const res = await postJson(ctx.url, '/__test/session', { user });
    const body = res.ok ? await res.json().catch(() => null) : null;
    if (!body || typeof body.cookie !== 'string' || !body.cookie.includes('=')) throw new Error(`/__test/session answered ${res.status} without a cookie`);
    cookie = body.cookie;
  }
  s.cookie = cookie;
  const at = cookie.indexOf('=');
  s.context = await ctx.browser.newContext();
  await s.context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: ctx.url }]);
  s.page = await s.context.newPage();
  s.page.setDefaultTimeout(TIMEOUT);
}

// Opens a page and verifies where we landed and who is signed in; a mismatch throws a problem naming it.
async function open(page, ctx, path, user) {
  await page.goto(ctx.url + path);
  const landed = new URL(page.url()).pathname;
  if (landed.replace(new RegExp('/$'), '') !== path) {
    throw new Error(landed.startsWith('/login') ? `redirected to ${landed} (not signed in), expected ${path}` : `landed on ${landed}, expected ${path}`);
  }
  const want = 'Signed in as ' + WHO[user];
  let found = true;
  await page.getByText('Signed in as').first().waitFor({ timeout: 3000 }).catch(() => { found = false; });
  const text = await page.locator('body').innerText();
  if (!text.includes(want)) {
    if (!found) throw new Error(`no "Signed in as" text on ${path} after 3 s, expected "${WHO[user]}"`);
    const m = new RegExp("Signed in as .*").exec(text);
    throw new Error(`signed in as "${m ? m[0].replace('Signed in as ', '') : 'nobody'}", expected "${WHO[user]}"`);
  }
}

// The first line of the error plus the first "waiting for ..." line of Playwright's call log, so a missing control is named.
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
function describe(err) {
  const lines = String(err && err.message).replace(ANSI, '').split(String.fromCharCode(10));
  const waiting = lines.find((l) => /waiting for /i.test(l));
  return lines[0] + (waiting ? ' (' + waiting.trim().replace(/^- /, '') + ')' : '');
}

// Runs the body, turns a thrown error (a missing element, a timeout, a lost session) into a failed result, always closes the context.
async function run(workflow, ctx, user, body) {
  const result = { workflow, status: 'pass', problems: [], evidence: [] };
  const s = {};
  try {
    await start(ctx, user, s);
    await body(s, result);
  } catch (err) {
    result.problems.push(`${workflow} could not complete: ${describe(err)}`);
  } finally {
    if (s.context) await s.context.close().catch(() => {});
  }
  if (result.problems.length) result.status = 'fail';
  return result;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// W1: a failed save keeps what the person typed, and saving again works.
export async function inputKept(ctx) {
  return run('input-kept', ctx, 'lan', async ({ page }, r) => {
    const before = (await serverOrders(ctx.url)).find((o) => o.id === 'SO-1005');
    const customer = 'Kept Customer Ltd';
    const note = 'Kept note after a failed save';
    await open(page, ctx, '/orders/SO-1005/edit', 'lan');
    await page.getByLabel('Customer', { exact: true }).fill(customer);
    await page.getByLabel('Note', { exact: true }).fill(note);
    await postJson(ctx.url, '/__test/fail', { method: 'PUT', path: '/api/orders/SO-1005', times: 1 });
    const [res] = await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'PUT' && x.url().endsWith('/api/orders/SO-1005')),
      page.getByRole('button', { name: 'Save order', exact: true }).click(),
    ]);
    const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first();
    await alert.waitFor();
    const alertText = ((await alert.textContent()) || '').trim();
    if (res.status() < 400) r.problems.push(`the injected failure was not returned (status ${res.status()})`);
        const gotCustomer = await page.getByLabel('Customer', { exact: true }).inputValue();
    const gotNote = await page.getByLabel('Note', { exact: true }).inputValue();
    if (gotCustomer !== customer) r.problems.push(`Customer was cleared or changed after the failed save: expected "${customer}", found "${gotCustomer}" (input not kept)`);
    if (gotNote !== note) r.problems.push(`Note was cleared or changed after the failed save: expected "${note}", found "${gotNote}" (input not kept)`);
    const after = (await serverOrders(ctx.url)).find((o) => o.id === 'SO-1005');
    if (!same(after, before)) r.problems.push('the failed save changed the order on the server');
    r.evidence.push(`failed save: status ${res.status()}, alert "${alertText}", Customer "${gotCustomer}", Note "${gotNote}"`);

    // Retry. If the fields were lost, re-fill them so the retry still checks the save path.
    if (gotCustomer !== customer) await page.getByLabel('Customer', { exact: true }).fill(customer);
    if (gotNote !== note) await page.getByLabel('Note', { exact: true }).fill(note);
    await page.getByRole('button', { name: 'Save order', exact: true }).click();
    await page.getByRole('status').getByText('Order SO-1005 saved').waitFor();
    const saved = (await serverOrders(ctx.url)).find((o) => o.id === 'SO-1005');
    if (saved.customer !== customer || saved.note !== note) r.problems.push(`after the retry the server has "${saved.customer}" / "${saved.note}", expected both new values`);
    r.evidence.push(`retry: server has Customer "${saved.customer}" and Note "${saved.note}"; status "Order SO-1005 saved"`);
  });
}

// W2: the viewer has no usable "Cancel orders" button, and the API refuses the viewer's writes.
export async function permissionBoundary(ctx) {
  return run('permission-boundary', ctx, 'minh', async ({ page, cookie }, r) => {
    const before = await serverOrders(ctx.url);
    await open(page, ctx, '/orders', 'minh');
    await page.getByText('60 orders', { exact: true }).first().waitFor();
    // The bulk button is disabled until a row is selected, so select one row first, if the viewer's UI offers selection.
    const box = page.getByRole('checkbox', { name: 'Select SO-1001', exact: true });
    let selected = false;
    if ((await box.count()) > 0 && (await box.first().isEnabled())) {
      await box.first().check();
      selected = true;
      const seen = await page.getByText('1 selected', { exact: true }).waitFor({ timeout: 2000 }).then(() => true, () => false);
      r.evidence.push(`viewer selected row SO-1001; "1 selected" signal ${seen ? 'seen' : 'not seen'}`);
    } else {
      r.evidence.push('viewer has no row selection (no enabled "Select SO-1001" checkbox)');
    }
    // Any bulk-cancel control: "Cancel orders", "Cancel 1 order", "Cancel selected", as a button or a menu item.
    const probe = (role) => page.getByRole(role, { name: /cancel\b.*\border|cancel selected/i });
    const found = async () => {
      const list = [];
      for (const role of ['button', 'menuitem']) {
        const loc = probe(role);
        const n = await loc.count();
        for (let i = 0; i < n; i++) if (await loc.nth(i).isEnabled()) list.push((((await loc.nth(i).textContent()) || '').trim() || (await loc.nth(i).getAttribute('aria-label')) || role));
      }
      return list;
    };
    let enabled = await found();
    const deadline = Date.now() + 1000;
    while (enabled.length === 0 && Date.now() < deadline) enabled = await found();
    if (enabled.length > 0) r.problems.push(`the viewer sees an enabled cancel control "${enabled[0]}" ${selected ? 'after selecting a row' : 'on the list'} (${enabled.length} found)`);
    r.evidence.push(`UI: ${enabled.length} enabled cancel control(s)${selected ? ' after selecting one row' : ''}`);

    const put = await fetch(ctx.url + '/api/orders/SO-1001', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ customer: 'Viewer Edit', note: 'x', status: before[0].status, version: before[0].version }),
    });
    const bulk = await postJson(ctx.url, '/api/orders/bulk-cancel', { ids: ['SO-1001', 'SO-1002'] }, cookie);
    if (put.status !== 403) r.problems.push(`PUT /api/orders/SO-1001 as the viewer answered ${put.status}, expected 403`);
    if (bulk.status !== 403) r.problems.push(`POST /api/orders/bulk-cancel as the viewer answered ${bulk.status}, expected 403`);
    r.evidence.push(`API as viewer: PUT ${put.status}, bulk-cancel ${bulk.status}`);
    if (!same(await serverOrders(ctx.url), before)) r.problems.push('the viewer changed order data on the server');
    else r.evidence.push('server data unchanged');
  });
}

// W3: "Select all N matching" cancels every Pending order, not only the page.
export async function selectAllMatching(ctx) {
  return run('select-all-matching', ctx, 'lan', async ({ page }, r) => {
    const before = await serverOrders(ctx.url);
    const pending = before.filter((o) => o.status === 'Pending').map((o) => o.id);
    await open(page, ctx, '/orders', 'lan');
    await page.getByText('60 orders', { exact: true }).first().waitFor();
    await page.getByLabel('Status', { exact: true }).selectOption('Pending');
    await page.getByText(`${pending.length} orders`, { exact: true }).first().waitFor();
    await page.getByLabel('Select all on this page').check();
    const all = page.getByRole('button', { name: new RegExp('^Select all [0-9]+ matching$') });
    await all.waitFor();
    const label = (await all.textContent()).trim();
    const n = Number(/[0-9]+/.exec(label)[0]);
    if (n !== pending.length) r.problems.push(`the button says "${label}", but the server has ${pending.length} Pending orders`);
    await all.click();
    await page.getByRole('button', { name: 'Cancel orders', exact: true }).click();
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: new RegExp('^Cancel [0-9]+ orders$') });
    const confirmLabel = ((await confirm.textContent()) || '').trim();
    const confirmN = Number(/[0-9]+/.exec(confirmLabel)[0]);
    if (confirmN !== pending.length) r.problems.push(`the confirm button says "${confirmLabel}", but the server has ${pending.length} Pending orders`);
    await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'POST' && x.url().endsWith('/api/orders/bulk-cancel')),
      confirm.click(),
    ]);
    await page.getByRole('status').filter({ hasText: 'cancelled' }).first().waitFor();
    const afterRows = await serverOrders(ctx.url);
    const cancelled = afterRows.filter((o) => pending.includes(o.id) && o.status === 'Cancelled').length;
    const others = before.filter((o) => !pending.includes(o.id));
    const unchanged = others.filter((o) => same(o, afterRows.find((a) => a.id === o.id))).length;
    if (cancelled !== pending.length) r.problems.push(`${pending.length} Pending orders should be cancelled, but ${cancelled} were (the page held ${Math.min(20, pending.length)})`);
    if (unchanged !== others.length) r.problems.push(`${others.length - unchanged} orders that were not Pending changed`);
    r.evidence.push(`server: ${cancelled} cancelled, ${unchanged} unchanged`);
  });
}

export const WORKFLOWS = [inputKept, permissionBoundary, selectAllMatching];
