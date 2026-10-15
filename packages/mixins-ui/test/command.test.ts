/**
 * Command as a filter and as markup: what a query leaves, in its place, and
 * the field that points at the highlighted row, which moves to the first
 * enabled row when its own is filtered away.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Command, CommandSlots, Patterns, Recipes, type CommandGroup } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(CommandSlots)(Recipes.Command({}))
const groups: ReadonlyArray<CommandGroup<string>> = [
  {
    heading: 'Pages',
    items: [
      { value: 'new', label: 'New page' },
      { value: 'find', label: 'Search pages', keywords: ['find'] },
    ],
  },
  {
    heading: 'Settings',
    items: [
      { value: 'billing', label: 'Billing', disabled: true },
      { value: 'theme', label: 'Change theme', keywords: ['dark'] },
    ],
  },
]
const drawn = (query: string, active: Option.Option<string>) =>
  Command.view(
    {
      id: 'palette',
      label: 'Search commands',
      groups,
      query,
      onQuery: () => message('Other'),
      active,
      onActive: () => message('Other'),
      onRun: () => message('Clicked'),
      style,
    },
    h,
  )
const input = (query: string, active: Option.Option<string>) =>
  Inert.byTag(drawn(query, active), 'input')[0]

describe('Command.filtered', () => {
  it('keeps the rows every query word is in, label or keywords, in their place', () => {
    const left = Command.filtered(groups, 'page')
    expect(left.map(group => group.items.map(item => item.value))).toEqual([['new', 'find']])
    expect(Command.filtered(groups, 'dark theme')[0]?.items.map(item => item.value)).toEqual([
      'theme',
    ])
  })

  it('leaves everything for an empty query, and drops a group left with nothing', () => {
    expect(Command.filtered(groups, '  ')).toBe(groups)
    expect(Command.filtered(groups, 'zzz')).toEqual([])
  })
})

describe('Command.view', () => {
  it('meets the command pattern', () => {
    expect(A11y.validate(Patterns.Command, CommandSlots)).toEqual([])
  })

  it('points the field at the highlighted row', () => {
    expect(Inert.value(input('', Option.some('find')), 'aria-activedescendant')).toBe(
      'palette-find',
    )
  })

  it('moves the highlight to the first enabled row when its own is filtered away', () => {
    expect(Inert.value(input('theme', Option.some('find')), 'aria-activedescendant')).toBe(
      'palette-theme',
    )
  })

  it('says so when nothing matches', () => {
    expect(Inert.text(drawn('zzz', Option.none()))).toContain('No results.')
  })
})
