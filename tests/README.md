Run the browser regression tests with Node and an existing Playwright installation:

```powershell
node --test tests/api-crud.test.cjs
```

The tests automatically find the bundled Codex Playwright and installed Chrome or Edge on Windows. Elsewhere, set `CODEX_NODE_MODULES` to an existing `node_modules` folder containing Playwright, and optionally set `CHROME_PATH` to a Chromium browser executable. No project packages are installed.

The suite serves this folder on a temporary loopback port, starts a separate headless browser, and mocks DummyJSON requests. It never changes a running browser or sends mutations to the remote API. The mocked API deliberately does not persist changes, repeats IDs for newly created entities, and returns 404 when local entities are updated or removed. This checks author/task synchronization, author management from all entry points, nested form drafts, reassignment, deletion without losing tasks, and failed mutations.
