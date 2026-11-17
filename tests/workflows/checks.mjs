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
  s.context = await ctx.browser.newContext();
  await s.context.addCookies([{ name: 'sid', value: cookie.slice(cookie.indexOf('=') + 1), url: ctx.url }]);
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
  const text = await page.locator('body').innerText();
  if (!text.includes(want)) {
    const m = new RegExp("Signed in as .*").exec(text);
    throw new Error(`signed in as "${m ? m[0].replace('Signed in as ', '') : 'nobody'}", expected "${WHO[user]}"`);
  }
}

// Runs the body, turns a thrown error (a missing element, a timeout, a lost session) into a failed result, always closes the context.
async function run(workflow, ctx, user, body) {
  const result = { workflow, status: 'pass', problems: [], evidence: [] };
  const s = {};
  try {
    await start(ctx, user, s);
    await body(s, result);
  } catch (err) {
    result.problems.push(`${workflow} could not complete: ${String(err && err.message).split(String.fromCharCode(10))[0]}`);
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
    await page.getByLabel('Customer').fill(customer);
    await page.getByLabel('Note').fill(note);
    await postJson(ctx.url, '/__test/fail', { method: 'PUT', path: '/api/orders/SO-1005', times: 1 });
    const [res] = await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'PUT' && x.url().endsWith('/api/orders/SO-1005')),
      page.getByRole('button', { name: 'Save order' }).click(),
    ]);
    await page.getByRole('alert').first().waitFor();
    const alertText = ((await page.getByRole('alert').first().textContent()) || '').trim();
    if (res.status() < 400) r.problems.push(`the injected failure was not returned (status ${res.status()})`);
    if (!alertText) r.problems.push('the failed save showed an empty alert');
    const gotCustomer = await page.getByLabel('Customer').inputValue();
    const gotNote = await page.getByLabel('Note').inputValue();
    if (gotCustomer !== customer) r.problems.push(`Customer was cleared or changed after the failed save: expected "${customer}", found "${gotCustomer}" (input not kept)`);
    if (gotNote !== note) r.problems.push(`Note was cleared or changed after the failed save: expected "${note}", found "${gotNote}" (input not kept)`);
    const after = (await serverOrders(ctx.url)).find((o) => o.id === 'SO-1005');
    if (!same(after, before)) r.problems.push('the failed save changed the order on the server');
    r.evidence.push(`failed save: status ${res.status()}, alert "${alertText}", Customer "${gotCustomer}", Note "${gotNote}"`);

    // Retry. If the fields were lost, re-fill them so the retry still checks the save path.
    if (gotCustomer !== customer) await page.getByLabel('Customer').fill(customer);
    if (gotNote !== note) await page.getByLabel('Note').fill(note);
    await page.getByRole('button', { name: 'Save order' }).click();
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
    await page.locator('#count').getByText('60 orders', { exact: true }).waitFor();
    // The bulk button is disabled until a row is selected, so select one row first.
    await page.getByRole('checkbox', { name: 'Select SO-1001' }).check();
    // Wait for the UI to react to the selection ("1 selected" in the bulk region), then watch for a late button.
    await page.getByText('1 selected', { exact: true }).waitFor({ timeout: 2000 }).catch(() => {});
    const buttons = page.getByRole('button', { name: /Cancel orders/i });
    let n = 0;
    let enabled = 0;
    const deadline = Date.now() + 1000;
    do {
      n = await buttons.count();
      enabled = 0;
      for (let i = 0; i < n; i++) if (await buttons.nth(i).isEnabled()) enabled++;
    } while (enabled === 0 && Date.now() < deadline);
    if (enabled > 0) r.problems.push(`the viewer sees an enabled "Cancel orders" button after selecting a row (${enabled} found)`);
    r.evidence.push(`UI: ${n} "Cancel orders" button(s), ${enabled} enabled, after selecting one row`);

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
    await page.locator('#count').getByText('60 orders', { exact: true }).waitFor();
    await page.getByLabel('Status').selectOption('Pending');
    await page.locator('#count').getByText(`${pending.length} orders`, { exact: true }).waitFor();
    await page.getByLabel('Select all on this page').check();
    const all = page.getByRole('button', { name: new RegExp('^Select all [0-9]+ matching$') });
    await all.waitFor();
    const label = (await all.textContent()).trim();
    const n = Number(/[0-9]+/.exec(label)[0]);
    if (n !== pending.length) r.problems.push(`the button says "${label}", but the server has ${pending.length} Pending orders`);
    await all.click();
    await page.getByRole('button', { name: 'Cancel orders' }).click();
    await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'POST' && x.url().endsWith('/api/orders/bulk-cancel')),
      page.getByRole('alertdialog').getByRole('button', { name: new RegExp('^Cancel [0-9]+ orders$') }).click(),
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
