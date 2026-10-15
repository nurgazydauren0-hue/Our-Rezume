const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// Uses an existing Playwright installation; no package install or network is needed.
const moduleCandidates = [
    process.env.CODEX_NODE_MODULES,
    path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),
    ...require.resolve.paths('playwright')
].filter(Boolean);
const playwrightPath = moduleCandidates.map(directory => path.join(directory, 'playwright'))
    .find(directory => fs.existsSync(path.join(directory, 'package.json')));
if (!playwrightPath) throw new Error('Playwright was not found. Set CODEX_NODE_MODULES to an existing node_modules directory.');
const { chromium } = require(playwrightPath);
const { expect: playwrightExpect } = require(path.join(playwrightPath, 'test'));
const expect = playwrightExpect.configure({ timeout: 8000 });

const root = path.resolve(__dirname, '..');
const browserPath = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(candidate => candidate && fs.existsSync(candidate));
let browser;
let server;
let baseUrl;

before(async () => {
    server = http.createServer((request, response) => {
        const name = new URL(request.url, 'http://localhost').pathname;
        const allowed = { '/': 'index.html', '/index.html': 'index.html', '/script.js': 'script.js', '/style.css': 'style.css', '/amina.png': 'amina.png' };
        const filename = allowed[name];
        if (!filename) { response.writeHead(404).end(); return; }
        const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
        response.setHeader('Content-Type', contentTypes[path.extname(filename)]);
        response.end(fs.readFileSync(path.join(root, filename)));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
});

after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
});

const remoteUsers = [
    { id: 1, firstName: 'Emily', lastName: 'Johnson', username: 'emilys', email: 'emily@example.com', age: 28, gender: 'female', birthDate: '1998-01-05', phone: '+10001', address: { address: '1 First Street', city: 'New York', state: 'New York', country: 'United States', postalCode: '10001' }, company: { name: 'Acme', department: 'Sales', title: 'Manager' }, university: 'Example University', role: 'user', height: 165, weight: 60, bloodGroup: 'O+' },
    { id: 152, firstName: 'Paisley', lastName: 'Bell', username: 'paisleyf', email: 'paisley@example.com', age: 44, gender: 'female', birthDate: '1981-05-10', phone: '+10002', address: { address: '541 Elm Street', city: 'San Diego', state: 'Delaware', country: 'United States', postalCode: '49147' }, company: { name: 'Spinka - Dickinson', department: 'Business Development', title: 'Chief Executive Officer' }, university: 'University of North Carolina', role: 'user', height: 180.16, weight: 84.81, bloodGroup: 'B+' }
];
const remoteTasks = [
    { id: 1, todo: 'Do something nice for someone you care about', completed: false, userId: 152 },
    { id: 107, todo: 'Explore a park you have never been to before', completed: true, userId: 152 },
    { id: 2, todo: 'Memorize a poem', completed: true, userId: 1 }
];

async function fixture(t) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, [], 'The page must not throw JavaScript errors'));
    const calls = [];
    const failures = [];
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === baseUrl) { await route.continue(); return; }
        if (url.hostname !== 'dummyjson.com') { await route.abort(); return; }
        const method = request.method();
        const body = request.postData() ? request.postDataJSON() : undefined;
        calls.push({ method, path: url.pathname, search: url.search, body });
        const failureIndex = failures.findIndex(item => item.method === method && item.path === url.pathname);
        if (failureIndex !== -1) {
            const failure = failures.splice(failureIndex, 1)[0];
            await route.fulfill({ status: failure.status, json: { message: 'Deliberate regression test failure' } });
            return;
        }
        if (method === 'GET' && url.pathname === '/users') {
            const fields = url.searchParams.get('select')?.split(',');
            const users = structuredClone(remoteUsers).map(user => fields
                ? Object.fromEntries(Object.entries(user).filter(([key]) => fields.includes(key))) : user);
            await route.fulfill({ json: { users, total: users.length, skip: 0, limit: users.length } });
            return;
        }
        if (method === 'GET' && url.pathname === '/todos') {
            const todos = structuredClone(remoteTasks);
            if (url.searchParams.has('sortBy')) todos.sort((a, b) => a.todo.localeCompare(b.todo) * (url.searchParams.get('order') === 'desc' ? -1 : 1));
            await route.fulfill({ json: { todos, total: todos.length, skip: 0, limit: todos.length } });
            return;
        }
        const userTasks = url.pathname.match(/^\/users\/(\d+)\/todos$/);
        if (method === 'GET' && userTasks) {
            const todos = structuredClone(remoteTasks.filter(task => task.userId === Number(userTasks[1])));
            await route.fulfill({ json: { todos, total: todos.length, skip: 0, limit: todos.length } });
            return;
        }
        if (method === 'POST' && url.pathname === '/users/add') {
            // DummyJSON deliberately repeats the ID and does not persist the user.
            await route.fulfill({ status: 201, json: { ...body, id: 209 } });
            return;
        }
        if (method === 'POST' && url.pathname === '/todos/add') {
            await route.fulfill({ status: 201, json: { ...body, id: 255 } });
            return;
        }
        const entity = url.pathname.match(/^\/(users|todos)\/(\d+)$/);
        if (entity) {
            const source = entity[1] === 'users' ? remoteUsers : remoteTasks;
            const item = source.find(value => value.id === Number(entity[2]));
            if (!item) { await route.fulfill({ status: 404, json: { message: 'Not found' } }); return; }
            if (method === 'GET') { await route.fulfill({ json: structuredClone(item) }); return; }
            if (method === 'PATCH') { await route.fulfill({ json: { ...structuredClone(item), ...body } }); return; }
            if (method === 'DELETE') { await route.fulfill({ json: { ...structuredClone(item), isDeleted: true } }); return; }
        }
        await route.fulfill({ status: 404, json: { message: `Unexpected ${method} ${url.pathname}` } });
    });
    await page.goto(baseUrl);
    await page.locator('.nav-btn[data-tab="api"]').click();
    await expect(page.locator('#api-total-count')).toHaveText('3');
    await expect(page.locator('#api-author-select')).toBeEnabled();
    return { page, calls, failNext: (method, routePath, status = 500) => failures.push({ method, path: routePath, status }) };
}

const mainRow = (page, id) => page.locator(`#api-todo-list .api-row[data-task-key="remote-${id}"]`);
const profileRow = (page, id) => page.locator(`#api-user-task-list .api-row[data-task-key="remote-${id}"]`);
async function closeDialog(page, id) {
    await page.locator(`#${id} .api-dialog-close`).click();
    await expect(page.locator(`#${id}`)).not.toBeVisible();
}
async function fillAuthor(page, values) {
    for (const [name, value] of Object.entries(values)) {
        const field = page.locator(`#api-author-form [name="${name}"]`);
        if (await field.evaluate(element => element.tagName === 'SELECT')) await field.selectOption(String(value));
        else await field.fill(String(value));
    }
}
async function saveAuthor(page) {
    await page.locator('#api-author-save-btn').click();
    await expect(page.locator('#api-author-editor-dialog')).not.toBeVisible();
}
async function openPaisley(page) {
    await mainRow(page, 1).locator('.api-user-chip').click();
    await expect(page.locator('#api-user-dialog')).toBeVisible();
    await expect(page.locator('#api-profile-edit-user-btn')).toBeEnabled();
    await expect(page.locator('#api-user-total-count')).toHaveText('2');
}
async function optionValue(page, selector, text) {
    const option = page.locator(`${selector} option`).filter({ hasText: text });
    await expect(option).toHaveCount(1);
    return option.getAttribute('value');
}
async function saveTask(page) {
    await page.locator('#api-add-btn').click();
    await expect(page.locator('#api-add-dialog')).not.toBeVisible();
}

test('author fields and renamed handles stay synchronized after profile GET and API sorting', async t => {
    const { page, calls } = await fixture(t);
    await openPaisley(page);
    await page.locator('#api-profile-edit-user-btn').click();
    await expect(page.locator('#api-author-first-name')).toHaveValue('Paisley');
    await fillAuthor(page, { firstName: 'Amina', lastName: 'Bell Updated', username: 'amina-updated', email: 'amina@example.kz', age: 31, phone: '+77001234567', 'address.city': 'Qyzylorda', 'company.name': 'Updated Company', 'company.title': 'Engineer', role: 'admin', height: 172.5, weight: 65.2 });
    await saveAuthor(page);
    await expect(page.locator('#api-user-title')).toHaveText('Amina Bell Updated');
    for (const text of ['@amina-updated', 'amina@example.kz', 'Qyzylorda', 'Updated Company', 'Engineer', '172.5']) await expect(page.locator('#api-user-details')).toContainText(text);
    await expect(profileRow(page, 1).locator('.api-user-chip')).toHaveText('@amina-updated');
    await closeDialog(page, 'api-user-dialog');
    await expect(mainRow(page, 1).locator('.api-user-chip')).toHaveText('@amina-updated');
    await expect(page.locator('#api-author-select option[value="152"]')).toContainText('Amina Bell Updated');
    await page.locator('#api-sort-select').selectOption('asc');
    await expect(page.locator('#api-refresh-btn')).toBeEnabled();
    await expect(mainRow(page, 1).locator('.api-user-chip')).toHaveText('@amina-updated');
    const priorProfileReads = calls.filter(call => call.method === 'GET' && call.path === '/users/152').length;
    await page.locator('#api-refresh-btn').click();
    await expect(page.locator('#api-refresh-btn')).toBeEnabled();
    await openPaisley(page);
    await expect.poll(() => calls.filter(call => call.method === 'GET' && call.path === '/users/152').length).toBeGreaterThan(priorProfileReads);
    await expect(page.locator('#api-user-title')).toHaveText('Amina Bell Updated');
    await expect(page.locator('#api-user-details')).toContainText('amina@example.kz');
    await expect(page.locator('#api-user-details')).toContainText('Updated Company');
    assert(calls.some(call => call.method === 'PATCH' && call.path === '/users/152' && call.body.address.city === 'Qyzylorda'));
});

test('task editor creates and manages authors without losing a draft; repeated POST IDs remain independent', async t => {
    const { page, calls } = await fixture(t);
    await page.locator('#api-open-add-btn').click();
    await page.locator('#api-todo-input').fill('Draft preserved while managing authors');
    await page.locator('#api-completed-input').selectOption('true');
    await page.locator('#api-assignee-add-btn').click();
    await fillAuthor(page, { firstName: 'Local', lastName: 'Alpha', username: 'local-alpha' });
    await saveAuthor(page);
    await expect(page.locator('#api-add-dialog')).toBeVisible();
    await expect(page.locator('#api-todo-input')).toHaveValue('Draft preserved while managing authors');
    const alphaId = await optionValue(page, '#api-assignee-select', '@local-alpha');
    await expect(page.locator('#api-assignee-select')).toHaveValue(alphaId);
    await page.locator('#api-assignee-add-btn').click();
    await fillAuthor(page, { firstName: 'Local', lastName: 'Beta', username: 'local-beta' });
    await saveAuthor(page);
    const betaId = await optionValue(page, '#api-assignee-select', '@local-beta');
    assert.notEqual(alphaId, betaId, 'Repeated API IDs must not overwrite an existing local author');
    await page.locator('#api-assignee-select').selectOption(alphaId);
    await page.locator('#api-assignee-edit-btn').click();
    await fillAuthor(page, { firstName: 'Alpha Edited', username: 'alpha-edited' });
    await saveAuthor(page);
    await expect(page.locator(`#api-assignee-select option[value="${alphaId}"]`)).toContainText('@alpha-edited');
    await expect(page.locator(`#api-assignee-select option[value="${betaId}"]`)).toContainText('@local-beta');
    await expect(page.locator('#api-todo-input')).toHaveValue('Draft preserved while managing authors');
    await expect(page.locator('#api-completed-input')).toHaveValue('true');
    await saveTask(page);
    const draftRow = page.locator('#api-todo-list .api-row').filter({ hasText: 'Draft preserved while managing authors' });
    await expect(draftRow.locator('.api-user-chip')).toHaveText('@alpha-edited');
    await expect(draftRow.locator('input[type="checkbox"]')).toBeChecked();
    assert.equal(calls.filter(call => call.method === 'POST' && call.path === '/users/add').length, 2);
    assert(calls.some(call => call.method === 'PATCH' && call.path.startsWith('/users/')));
});

test('profile task CRUD changes assignee and status in both lists', async t => {
    const { page, calls } = await fixture(t);
    await openPaisley(page);
    await profileRow(page, 1).getByRole('button', { name: /Редактировать задачу/ }).click();
    await expect(page.locator('#api-add-dialog')).toBeVisible();
    await expect(page.locator('#api-assignee-select')).toHaveValue('152');
    await page.locator('#api-todo-input').fill('A reassigned kind task');
    await page.locator('#api-assignee-select').selectOption('1');
    await page.locator('#api-completed-input').selectOption('true');
    await saveTask(page);
    await expect(page.locator('#api-user-total-count')).toHaveText('1');
    await expect(profileRow(page, 1)).toHaveCount(0);
    await page.locator('#api-profile-add-task-btn').click();
    await expect(page.locator('#api-assignee-select')).toHaveValue('152');
    await page.locator('#api-todo-input').fill('New task from profile');
    await saveTask(page);
    await expect(page.locator('#api-user-total-count')).toHaveText('2');
    const added = page.locator('#api-user-task-list .api-row').filter({ hasText: 'New task from profile' });
    await added.getByRole('button', { name: /Редактировать задачу/ }).click();
    await page.locator('#api-todo-input').fill('Updated local task');
    await saveTask(page);
    await expect(page.locator('#api-user-task-list')).toContainText('Updated local task');
    await page.locator('#api-user-task-list .api-row').filter({ hasText: 'Updated local task' }).getByRole('button', { name: /Удалить/ }).click();
    await expect(page.locator('#api-user-total-count')).toHaveText('1');
    await closeDialog(page, 'api-user-dialog');
    await expect(mainRow(page, 1)).toContainText('A reassigned kind task');
    await expect(mainRow(page, 1).locator('.api-user-chip')).toHaveText('@emilys');
    await expect(mainRow(page, 1).locator('input[type="checkbox"]')).toBeChecked();
    await expect(page.locator('#api-total-count')).toHaveText('3');
    assert(calls.some(call => call.method === 'PATCH' && call.path === '/todos/1' && call.body.userId === 1));
    assert(calls.some(call => call.method === 'PATCH' && call.path === '/todos/255'));
    assert(calls.some(call => call.method === 'DELETE' && call.path === '/todos/255'));
});

test('deleting a profile author keeps tasks editable and does not restore the author on a new GET', async t => {
    const { page, calls } = await fixture(t);
    await openPaisley(page);
    await page.locator('#api-profile-delete-user-btn').click();
    await expect(page.locator('#api-author-delete-dialog')).toBeVisible();
    await expect(page.locator('#api-author-delete-name')).toContainText('Paisley');
    await page.locator('#api-author-delete-confirm-btn').click();
    await expect(page.locator('#api-author-delete-dialog')).not.toBeVisible();
    if (await page.locator('#api-user-dialog').isVisible()) await closeDialog(page, 'api-user-dialog');
    await expect(page.locator('#api-total-count')).toHaveText('3');
    await expect(mainRow(page, 1)).toContainText('Без исполнителя');
    await expect(mainRow(page, 107)).toContainText('Без исполнителя');
    await expect(page.locator('#api-author-select option[value="152"]')).toHaveCount(0);
    await page.locator('#api-sort-select').selectOption('desc');
    await expect(page.locator('#api-refresh-btn')).toBeEnabled();
    await expect(mainRow(page, 1)).toContainText('Без исполнителя');
    await mainRow(page, 1).getByRole('button', { name: /Редактировать задачу/ }).click();
    await expect(page.locator('#api-assignee-select option[value="152"]')).toHaveCount(0);
    await page.locator('#api-assignee-select').selectOption('1');
    await saveTask(page);
    await expect(mainRow(page, 1).locator('.api-user-chip')).toHaveText('@emilys');
    assert(calls.some(call => call.method === 'DELETE' && call.path === '/users/152'));
    assert.equal(calls.filter(call => call.method === 'DELETE' && call.path.startsWith('/todos/')).length, 0, 'Removing an author must not cascade into task deletion');
});

test('author directory and task form expose author CRUD even when no task exists for that author', async t => {
    const { page } = await fixture(t);
    await page.locator('#api-open-authors-btn').click();
    await expect(page.locator('#api-authors-list > li')).toHaveCount(2);
    await page.locator('#api-authors-add-btn').click();
    await fillAuthor(page, { firstName: 'Directory', lastName: 'Only', username: 'directory-only' });
    await saveAuthor(page);
    await expect(page.locator('#api-authors-list > li')).toHaveCount(3);
    await page.locator('#api-authors-search-input').fill('directory-only');
    const authorRow = page.locator('#api-authors-list > li').filter({ hasText: '@directory-only' });
    await expect(authorRow).toHaveCount(1);
    await authorRow.getByRole('button', { name: /Изменить/ }).click();
    await fillAuthor(page, { firstName: 'Directory Edited' });
    await saveAuthor(page);
    await expect(authorRow).toContainText('Directory Edited');
    await authorRow.getByRole('button', { name: /Удалить/ }).click();
    await page.locator('#api-author-delete-confirm-btn').click();
    await expect(page.locator('#api-author-delete-dialog')).not.toBeVisible();
    await expect(page.locator('#api-authors-list > li')).toHaveCount(0);
    await closeDialog(page, 'api-authors-dialog');
    await page.locator('#api-open-add-btn').click();
    await page.locator('#api-assignee-select').selectOption('1');
    await page.locator('#api-assignee-delete-btn').click();
    await page.locator('#api-author-delete-confirm-btn').click();
    await expect(page.locator('#api-author-delete-dialog')).not.toBeVisible();
    await expect(page.locator('#api-add-dialog')).toBeVisible();
    await expect(page.locator('#api-assignee-select option[value="1"]')).toHaveCount(0);
});

test('failed author and task mutations preserve data and keep forms retryable', async t => {
    const { page, failNext } = await fixture(t);
    await openPaisley(page);
    await page.locator('#api-profile-edit-user-btn').click();
    await fillAuthor(page, { firstName: 'Must Not Persist' });
    failNext('PATCH', '/users/152');
    await page.locator('#api-author-save-btn').click();
    await expect(page.locator('#api-author-error')).toBeVisible();
    await expect(page.locator('#api-author-editor-dialog')).toBeVisible();
    await expect(page.locator('#api-author-save-btn')).toBeEnabled();
    await closeDialog(page, 'api-author-editor-dialog');
    await expect(page.locator('#api-user-title')).toHaveText('Paisley Bell');
    await page.locator('#api-profile-delete-user-btn').click();
    failNext('DELETE', '/users/152');
    await page.locator('#api-author-delete-confirm-btn').click();
    await expect(page.locator('#api-author-delete-error')).toBeVisible();
    await expect(page.locator('#api-author-delete-confirm-btn')).toBeEnabled();
    await closeDialog(page, 'api-author-delete-dialog');
    await expect(page.locator('#api-user-title')).toHaveText('Paisley Bell');
    await profileRow(page, 1).getByRole('button', { name: /Редактировать задачу/ }).click();
    await page.locator('#api-todo-input').fill('Must not replace the task');
    failNext('PATCH', '/todos/1');
    await page.locator('#api-add-btn').click();
    await expect(page.locator('#api-add-error')).toBeVisible();
    await expect(page.locator('#api-add-btn')).toBeEnabled();
    await closeDialog(page, 'api-add-dialog');
    await expect(profileRow(page, 1)).toContainText(remoteTasks[0].todo);
    failNext('DELETE', '/todos/1');
    await profileRow(page, 1).getByRole('button', { name: /Удалить/ }).click();
    await expect(page.locator('#api-user-error')).toBeVisible();
    await expect(page.locator('#api-user-total-count')).toHaveText('2');
    await expect(profileRow(page, 1)).toContainText(remoteTasks[0].todo);
    await closeDialog(page, 'api-user-dialog');
    await page.locator('#api-open-add-btn').click();
    await page.locator('#api-todo-input').fill('Failed create task');
    await page.locator('#api-assignee-select').selectOption('1');
    failNext('POST', '/todos/add');
    await page.locator('#api-add-btn').click();
    await expect(page.locator('#api-add-error')).toBeVisible();
    await expect(page.locator('#api-add-dialog')).toBeVisible();
    await expect(page.locator('#api-add-btn')).toBeEnabled();
    await expect(page.locator('#api-total-count')).toHaveText('3');
});

test('canceling an invalid new author clears custom validity before editing another author', async t => {
    const { page } = await fixture(t);
    await page.locator('#api-open-add-btn').click();
    await page.locator('#api-assignee-add-btn').click();
    await fillAuthor(page, { firstName: '   ', lastName: 'Valid Surname', username: 'valid-username' });
    await page.locator('#api-author-save-btn').click();
    await expect(page.locator('#api-author-editor-dialog')).toBeVisible();
    await expect.poll(() => page.locator('#api-author-first-name').evaluate(field => field.validity.valid)).toBe(false);
    await closeDialog(page, 'api-author-editor-dialog');
    await page.locator('#api-assignee-select').selectOption('152');
    await page.locator('#api-assignee-edit-btn').click();
    await expect(page.locator('#api-author-first-name')).toHaveValue('Paisley');
    await expect.poll(() => page.locator('#api-author-first-name').evaluate(field => field.validity.valid)).toBe(true);
    await saveAuthor(page);
    await expect(page.locator('#api-add-dialog')).toBeVisible();
});

test('desktop and mobile light-theme dialogs fit their viewport', async t => {
    const { page } = await fixture(t);
    const artifacts = path.join(__dirname, 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const capture = name => page.screenshot({ path: path.join(artifacts, name) });
    const expectNoDialogOverflow = async id => {
        await expect.poll(() => page.locator(`#${id}`).evaluate(dialog => ({
            fits: dialog.getBoundingClientRect().width <= window.innerWidth,
            noHorizontalScroll: dialog.scrollWidth <= dialog.clientWidth + 1
        }))).toEqual({ fits: true, noHorizontalScroll: true });
    };
    await page.locator('#api-open-authors-btn').click();
    await expectNoDialogOverflow('api-authors-dialog');
    await capture('api-authors-desktop.png');
    await closeDialog(page, 'api-authors-dialog');
    await page.locator('#api-open-add-btn').click();
    await expectNoDialogOverflow('api-add-dialog');
    await capture('api-task-editor-desktop.png');
    await page.locator('#api-assignee-add-btn').click();
    await expectNoDialogOverflow('api-author-editor-dialog');
    await capture('api-author-editor-desktop.png');
    await closeDialog(page, 'api-author-editor-dialog');
    await closeDialog(page, 'api-add-dialog');
    await openPaisley(page);
    await expectNoDialogOverflow('api-user-dialog');
    await capture('api-profile-desktop.png');
    await closeDialog(page, 'api-user-dialog');
    await page.locator('.nav-btn[data-tab="task4"]').click();
    await page.locator('#theme-toggle-btn').click();
    await expect(page.locator('body')).toHaveClass(/light-theme/);
    await page.locator('.nav-btn[data-tab="api"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#api-open-add-btn').click();
    await expectNoDialogOverflow('api-add-dialog');
    await capture('api-task-editor-mobile-light.png');
    await page.locator('#api-assignee-add-btn').click();
    await expectNoDialogOverflow('api-author-editor-dialog');
    await capture('api-author-editor-mobile-light.png');
    await closeDialog(page, 'api-author-editor-dialog');
    await closeDialog(page, 'api-add-dialog');
    await page.locator('#api-open-authors-btn').click();
    await expectNoDialogOverflow('api-authors-dialog');
    await capture('api-authors-mobile-light.png');
});
