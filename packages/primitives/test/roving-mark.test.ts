/**
 * Each roving primitive marks its container `data-fk-roving`, so a
 * `FollowTabStop` around it takes only its own stop and never one a nested
 * roving widget holds (`follow-tab-stop.browser.test.ts` drives the real
 * nesting); none marks it as a focus owner, which would stand between a
 * `FocusRecovery` and its parts.
 */
import { describe, expect, it } from 'vitest'
import { SlotView, type NamedBehavior } from 'foldkit-mixins'
import { GridNavigation, RovingTabindex, TreeNavigation } from '../src/interaction/index.js'
import {
  Grid,
  Keys,
  ListboxSlots,
  Options,
  Roving,
  Tree,
  bare,
  itemsOf,
  type Input,
  type Message,
} from './obligations.fixture.js'

const input: Input = {
  list: { current: null, query: '', generation: 0 },
  roving: { current: null },
  tree: { current: null, toggled: [] },
  grid: { current: null },
  selection: { selected: [], anchor: null },
  press: { pressed: false, pointerId: null, key: null, suppressing: null, generation: 0 },
  options: [{ id: 'a', label: 'A' }],
}

const containerAttributes = (behavior: NamedBehavior<typeof ListboxSlots, Input, Message>) =>
  SlotView.resolution(bare.pipe(SlotView.attach(behavior.mixin)), input).slots[
    'listbox'
  ]!.attributes.map(owned => owned.name)

describe('the roving primitives mark their container', () => {
  it.each([
    ['ListNavigation', Keys],
    [
      'RovingTabindex',
      RovingTabindex.behavior(Roving, { orientation: 'vertical', loop: true, virtual: false })(
        Options,
      )({ container: 'listbox', item: 'option', items: itemsOf }),
    ],
    [
      'TreeNavigation',
      TreeNavigation.behavior(Tree, { openByDefault: false })(Options)({
        container: 'listbox',
        item: 'option',
        rows: each => each.options.map(option => ({ id: option.id, parent: null, branch: false })),
      }),
    ],
    [
      'GridNavigation',
      GridNavigation.behavior(Grid, { columns: 2, wrap: false, virtual: false })(Options)({
        container: 'listbox',
        item: 'option',
        items: itemsOf,
      }),
    ],
  ])('%s', (_name, behavior) => {
    const names = containerAttributes(behavior)
    // Named as the resolver compares them.
    expect(names).toContain('datafkroving')
    expect(names).not.toContain('datafkfocusowner')
  })
})
