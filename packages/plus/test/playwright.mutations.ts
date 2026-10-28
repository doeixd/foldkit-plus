/**
 * The Playwright behaviors, broken one piece at a time:
 * `pnpm mutate packages/plus/test/playwright.mutations.ts`
 */
const file = '../src/testing/playwright.ts'

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: ['packages/plus/test/playwright.test.ts'],
})

export default [
  edit('a query is held as a write', "sent.operation === 'mutate'", "sent.operation === 'query'"),
  edit(
    'a write is let through at once',
    'await new Promise(resume => setTimeout(resume, hold))',
    '',
  ),
  edit('an action that wrote nothing passes', 'if (held.length === 0)', 'if (false)'),
  edit(
    'a write taken back by its answer passes',
    'if (!(await options.shows.isVisible()))',
    'if (false)',
  ),
  edit('the answer is not waited for before looking again', '    await Promise.all(held)\n', ''),
  edit('hidden text counts as shown', 'document.body?.innerText', 'document.body?.textContent'),
  edit(
    'a string is read as a pattern',
    '? { key, source: text.replace(',
    '? { key, source: text, unescaped: text.replace(',
  ),
  edit(
    'the document already open is not watched',
    '    await page.evaluate(watchText, watch)\n',
    '',
  ),
  edit(
    'documents loaded during the steps are not watched',
    'const script = await page.addInitScript(watchText, watch)',
    'const script = { dispose: async () => {} }',
  ),
  edit(
    'warnings are collected in place of errors',
    "message.type() === 'error'",
    "message.type() === 'warning'",
  ),
  edit(
    'an exception the page throws is not collected',
    "  page.on('pageerror', error => errors.push(String(error)))\n",
    '',
  ),
]
