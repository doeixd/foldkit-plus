/**
 * The scenarios themselves, each shown to fail on a page that breaks what it
 * checks: a scenario that only ever passes says nothing of a widget that
 * conforms.
 */
import { Conformance } from 'foldkit-mixins/testing'
import { afterEach, expect, test } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'

const harness = Conformance.harness({ cdp, userEvent })

afterEach(() => {
  document.body.replaceChildren()
})

const outcome = (result: Conformance.Result, check: string) =>
  result.find(each => each.check === check)?.passed

test('a row whose group an ancestor hides is not showing', async () => {
  // Static markup: the keys move nothing, so the scenario reads the page as drawn.
  document.body.innerHTML = `
    <ul role="tree" aria-label="Files">
      <li role="treeitem" id="src" tabindex="0" aria-expanded="false">src
        <ul role="group" style="display: none">
          <li role="treeitem" id="components" tabindex="-1">components</li>
        </ul>
      </li>
      <li role="treeitem" id="readme" tabindex="-1">README.md</li>
    </ul>`
  const result = await Conformance.tree(harness, {
    name: 'Files',
    parent: 'src',
    child: 'components',
    next: 'README.md',
    enter: async () => document.getElementById('src')!.focus(),
  })
  expect(outcome(result, 'a shut parent shows no child')).toBe(true)
})
