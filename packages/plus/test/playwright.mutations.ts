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
  edit(
    'a query is held as a write',
    "Option.contains(remoteOperation(request), 'mutate')",
    "Option.contains(remoteOperation(request), 'query')",
  ),
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
  edit(
    'the answer is not waited for before looking again',
    'if (inFlight.size === 0 && answers === before) break',
    'break',
  ),
  edit(
    'a quiet that began before the last answer counts as settled',
    'if (inFlight.size === 0 && answers === before) break',
    'if (inFlight.size === 0) break',
  ),
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
    "page.on('console', message => {\n    if (message.type() === 'error')",
    "page.on('console', message => {\n    if (message.type() === 'warning')",
  ),
  edit(
    'an exception the page throws is not collected',
    "  page.on('pageerror', error => errors.push(String(error)))\n",
    '',
  ),
  // What a write's prediction must keep until it settles (#349).
  edit(
    'only the element itself is watched, not what holds it',
    'node = node.parentNode) lineage.add(node)',
    'node = null) lineage.add(node)',
  ),
  edit(
    'a removal is not read from the records',
    'if ([...record.removedNodes].some(node => each.lineage.has(node)))',
    'if (false)',
  ),
  edit(
    'a node put back is not told from one left out',
    "if (each.faults.has('removed') && each.element.isConnected)",
    'if (false)',
  ),
  edit(
    'a hidden attribute is not read from the records',
    'record.oldValue === null &&',
    'false &&',
  ),
  edit(
    'visibility is not sampled each frame',
    '!each.element.checkVisibility({ visibilityProperty: true })',
    'false',
  ),
  edit('a shift of many pixels passes', 'Math.abs(dy) > 1 ?', 'Math.abs(dy) > 100 ?'),
  edit(
    'a node drawn again reads as removed',
    'const replaced = newcomer && !each.element.isConnected',
    'const replaced = false',
  ),
  edit(
    'a narrower region is ignored',
    "Option.some(stays === 'put' ? options.shows : stays)",
    'Option.some(options.shows)',
  ),
  edit("stays: 'shown' still watches", "stays === 'shown'\n", 'false\n'),
  edit('the page’s word is not waited for', 'await writes.answered()', 'void writes.answered()'),
  edit(
    'requests an answer leads to are not counted',
    'if (Option.isSome(remoteOperation(request))) inFlight.add(request)',
    '',
  ),
  edit('an error logged while settling passes', 'if (errors.length > 0)', 'if (false)'),
  edit(
    'an exception thrown while settling is not collected',
    "  page.on('pageerror', thrown)\n",
    '',
  ),
  edit(
    'a watch left by a failed check keeps sampling',
    'if (!page.isClosed()) await page.evaluate(stopIfWatching, watch)',
    '',
  ),
]
