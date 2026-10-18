/**
 * Command as a filter and as markup: what a query leaves, in its place, and
 * the field that points at the highlighted row, which moves to the first
 * enabled row when its own is filtered away.
 */
import { Match, Option } from 'effect'
import { Scene } from 'foldkit/test'
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

  it('matches whatever the case of the query or the label', () => {
    const values = (query: string) =>
      Command.filtered(groups, query).flatMap(group => group.items.map(item => item.value))
    expect(values('SEARCH')).toEqual(['find'])
    expect(values('billing')).toEqual(['billing'])
  })

  it('drops a row missing any one word of the query', () => {
    expect(Command.filtered(groups, 'new search')).toEqual([])
  })

  it('matches a row by its description too', () => {
    const described: ReadonlyArray<CommandGroup<string>> = [
      { items: [{ value: 'export', label: 'Export', description: 'As a PDF file' }] },
    ]
    expect(
      Command.filtered(described, 'pdf').flatMap(group => group.items.map(item => item.value)),
    ).toEqual(['export'])
  })
})

describe('Command.view', () => {
  it('meets the command pattern', () => {
    expect(A11y.validate(Patterns.Command, CommandSlots)).toEqual([])
  })

  it('keeps a phone keyboard from correcting the query, its Enter key a search', () => {
    const field = input('', Option.none())
    expect(
      ['autocapitalize', 'autocorrect', 'spellcheck', 'enterkeyhint'].map(name =>
        Inert.value(field, name),
      ),
    ).toEqual(['none', 'off', 'false', 'search'])
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

  it('selects only the highlighted row, and leaves a disabled one unpressable', () => {
    const rows = Inert.byRole(drawn('', Option.some('find')), 'option')
    expect(rows.map(row => Inert.value(row, 'aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
    const billing = rows[2]
    expect(Inert.value(billing, 'aria-disabled')).toBe('true')
    expect(billing?.data?.on?.['click']).toBeUndefined()
    expect(rows[3]?.data?.on?.['click']).toBeTypeOf('function')
  })
})

describe('Command keys', () => {
  type Model = Readonly<{ active: Option.Option<string>; ran: string }>
  type Message =
    | Readonly<{ _tag: 'Activated'; value: string }>
    | Readonly<{ _tag: 'Ran'; value: string }>
  const scene = (active: Option.Option<string>, ...steps: ReadonlyArray<Step>) =>
    Scene.scene<Model, Message>(
      {
        update: (model, message) => ({
          model: Match.valueTags(message, {
            Activated: ({ value }) => ({ ...model, active: Option.some(value) }),
            Ran: ({ value }) => ({ ...model, ran: value }),
          }),
        }),
        view: (model, h) =>
          h.div(
            [],
            [
              Command.view<string, Message>(
                {
                  id: 'palette',
                  label: 'Search commands',
                  groups,
                  query: '',
                  onQuery: () => ({ _tag: 'Ran', value: 'query' }),
                  active: model.active,
                  onActive: value => ({ _tag: 'Activated', value }),
                  onRun: value => ({ _tag: 'Ran', value }),
                },
                h,
              ),
              h.output([], [model.ran]),
            ],
          ),
      },
      Scene.given<Model>({ active, ran: '' }),
      ...steps,
    )
  type Step = Parameters<typeof Scene.scene<Model, Message>>[1]
  const field = Scene.role('combobox')
  const highlights = (value: string) =>
    Scene.expect(field).toHaveAttr('aria-activedescendant', `palette-${value}`)

  it('steps down and up through the enabled rows, past a disabled one', () => {
    scene(Option.some('find'), Scene.keydown(field, 'ArrowDown'), highlights('theme'))
    scene(Option.some('theme'), Scene.keydown(field, 'ArrowUp'), highlights('find'))
  })

  it('wraps at either end', () => {
    scene(Option.some('theme'), Scene.keydown(field, 'ArrowDown'), highlights('new'))
    scene(Option.some('new'), Scene.keydown(field, 'ArrowUp'), highlights('theme'))
  })

  it('runs the highlighted row on Enter, and a pressed one', () => {
    scene(
      Option.some('find'),
      Scene.keydown(field, 'Enter'),
      Scene.expect(Scene.selector('output')).toHaveText('find'),
    )
    scene(
      Option.none(),
      Scene.click('#palette-theme'),
      Scene.expect(Scene.selector('output')).toHaveText('theme'),
    )
  })

  it('names a row by its words alone, its shortcut in aria-keyshortcuts', () => {
    const row = Inert.byRole(
      Command.view(
        {
          id: 'palette',
          label: 'Search commands',
          groups: [
            {
              items: [
                {
                  value: 'new',
                  label: 'New page',
                  description: 'A blank page',
                  shortcut: ['⌘', 'N'],
                  icon: h.span([], ['+']),
                },
              ],
            },
          ],
          query: '',
          onQuery: () => message('Other'),
          active: Option.none(),
          onActive: () => message('Other'),
          onRun: () => message('Clicked'),
        },
        h,
      ),
      'option',
    )[0]!
    expect(Inert.value(row, 'aria-keyshortcuts')).toBe('Meta+N')
    const hidden = Inert.all(row)
      .filter(node => node !== row && Inert.value(node, 'aria-hidden') === 'true')
      .map(node => Inert.text(node))
    expect(hidden).toEqual(['+', '⌘N'])
    expect(Inert.text(row)).toContain('A blank page')
  })

  it('leaves every other key to the field', () => {
    scene(Option.some('find'), Scene.keydown(field, 'a'), Scene.expectIgnored())
  })
})
