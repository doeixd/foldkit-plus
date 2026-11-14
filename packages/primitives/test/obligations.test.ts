import { describe, expect, it } from 'vitest'
import { A11y, Behavior, Behaviors, Diagnostics, SlotView, type MixinValue } from 'foldkit-mixins'
import {
  GridNavigation,
  ListNavigation,
  Press,
  RovingTabindex,
  Selection,
  TreeNavigation,
} from '../src/interaction/index.js'
import {
  Grid,
  Keys,
  List,
  ListboxSlots,
  Listbox,
  Named,
  Options,
  Picks,
  Pressing,
  Roving,
  Sel,
  Tree,
  bare,
  itemsOf,
  listArgs,
  selArgs,
  type Input,
  type Message,
} from './obligations.fixture.js'

/** Per slot, what a Behavior's metadata says it supplies. */
const supplied = (mixin: MixinValue<any>): Readonly<Record<string, ReadonlyArray<string>>> =>
  Object.fromEntries(
    Object.entries(mixin.meta?.slots ?? {})
      .filter(([, slot]) => slot.provides.length > 0)
      .map(([name, slot]) => [name, slot.provides]),
  )

const rows = (input: { readonly options: ReadonlyArray<{ readonly id: string }> }) =>
  input.options.map(option => ({ id: option.id, parent: null, branch: false, disabled: false }))

describe('what each primitive supplies', () => {
  it.each([
    ['ListNavigation', Keys.mixin, { listbox: ['navigation'], option: ['focus-strategy'] }],
    [
      'RovingTabindex',
      RovingTabindex.behavior(Roving, { orientation: 'vertical', loop: true, virtual: false })(
        Options,
      )({ container: 'listbox', item: 'option', items: itemsOf }).mixin,
      { listbox: ['navigation'], option: ['focus-strategy'] },
    ],
    [
      'TreeNavigation',
      TreeNavigation.behavior(Tree, { openByDefault: false })(Options)({
        container: 'listbox',
        item: 'option',
        rows,
      }).mixin,
      { listbox: ['navigation'], option: ['focus-strategy'] },
    ],
    [
      'GridNavigation',
      GridNavigation.behavior(Grid, { columns: 2, wrap: false, virtual: false })(Options)({
        container: 'listbox',
        item: 'option',
        items: itemsOf,
      }).mixin,
      { listbox: ['navigation'], option: ['focus-strategy'] },
    ],
    ['Selection', Picks.mixin, { option: ['state:aria-selected', 'activation'] }],
    [
      'Selection with its click off',
      Selection.behavior(Sel, selArgs)(Options)({ item: 'option', items: itemsOf, click: false })
        .mixin,
      { option: ['state:aria-selected'] },
    ],
    [
      'Selection that selects nothing',
      Selection.behavior(Sel, { mode: 'none', allowEmpty: true })(Options)({
        item: 'option',
        items: itemsOf,
      }).mixin,
      { option: ['state:aria-selected'] },
    ],
    [
      'Press',
      Press.behavior(Pressing)(Options)({ target: 'option' }).mixin,
      { option: ['activation'] },
    ],
    [
      'ToggleState as checked',
      Behaviors.ToggleState.behavior(Options)({
        control: 'toggle',
        state: () => true,
        as: 'checked',
      }).mixin,
      { toggle: ['state:aria-checked'] },
    ],
    [
      'ToggleState as pressed',
      Behaviors.ToggleState.behavior(Options)({
        control: 'toggle',
        state: () => true,
        as: 'pressed',
      }).mixin,
      { toggle: ['state:aria-pressed'] },
    ],
    [
      'Disclosure',
      Behaviors.Disclosure.behavior(Options)({
        trigger: 'toggle',
        content: 'panel',
        open: () => true,
        id: () => 'panel',
      }).mixin,
      { toggle: ['state:aria-expanded'] },
    ],
    [
      'FieldAssociation',
      Behaviors.FieldAssociation.behavior(Options)({
        control: 'listbox',
        label: 'label',
        id: () => 'fruit',
      }).mixin,
      { listbox: ['name'] },
    ],
  ])('%s', (_name, mixin, expected) => {
    expect(supplied(mixin)).toEqual(expected)
  })
})

describe('a listbox of primitives', () => {
  const complete = bare.pipe(Behavior.attach(Keys), Behavior.attach(Picks), SlotView.attach(Named))

  it('conforms with ListNavigation and Selection, the widget restating neither', () => {
    expect(A11y.check(Listbox, complete)).toEqual([])
  })

  it('owes navigation and a focus strategy without ListNavigation', () => {
    expect(
      A11y.check(Listbox, bare.pipe(Behavior.attach(Picks), SlotView.attach(Named))).map(
        ({ code, slot, details }) => ({ code, slot, obligation: details?.['obligation'] }),
      ),
    ).toEqual([
      { code: 'a11y:unsatisfied-obligation', slot: 'listbox', obligation: 'navigation' },
      { code: 'a11y:unsatisfied-obligation', slot: 'option', obligation: 'focus-strategy' },
    ])
  })

  it('judges the call with bare slots by what it does at run time', () => {
    const OldKeys = ListNavigation.behavior(List, listArgs)(ListboxSlots)<Input, Message>({
      container: 'listbox',
      item: 'option',
      items: itemsOf,
      text: () => '',
    })
    const view = bare.pipe(Behavior.attach(OldKeys), Behavior.attach(Picks))
    expect(A11y.check(Listbox, view.pipe(SlotView.attach(Named)))).toEqual([])
  })

  it('refuses a detach of ListNavigation once conformed', () => {
    const conformed = A11y.conform(Listbox)(complete)
    expect(() => conformed.pipe(SlotView.detach('ListNavigation'))).toThrow(
      Diagnostics.DiagnosticError,
    )
    expect(() => complete.pipe(SlotView.detach('ListNavigation'))).not.toThrow()
  })
})
