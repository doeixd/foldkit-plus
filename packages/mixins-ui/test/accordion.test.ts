/**
 * Accordion as markup and as a transition: which sections a press opens,
 * and the ARIA each section carries for it (a button in a heading naming
 * its panel, a region named by its trigger, a shut panel kept but inert).
 * What opening looks like on a page is `accordion.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  AccordionSlots,
  Message as AccordionMessage,
  controls as accordionControls,
  init as accordionInit,
  toggled,
  update as accordionUpdate,
  view as drawAccordion,
  type Args as AccordionArgs,
  type Model as AccordionModel,
  type AccordionView,
} from '../src/accordion.js'
import { Patterns, Recipes } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

const style = Style.forSlots(AccordionSlots)(Recipes.Accordion({}))
const items = [
  { id: 'billing', title: 'Billing', content: 'Seats and invoices.' },
  { id: 'team', title: 'Team', content: 'Invite and remove.' },
  { id: 'keys', title: 'API keys', content: 'Mint and revoke.', disabled: true },
]
const view = (options: Partial<AccordionView<TestMessage>>) =>
  drawAccordion(
    { id: 'settings', items, open: [], onToggle: () => message('Clicked'), style, ...options },
    h,
  )
const triggers = (drawn: ReturnType<typeof view>) => Inert.byTag(drawn, 'button')
const panels = (drawn: ReturnType<typeof view>) =>
  Inert.all(drawn).filter(node => Inert.value(node, 'role') === 'region')

describe('Accordion.toggled', () => {
  it.each([
    ['opens a shut one, shutting the rest', [], 'a', {}, ['a']],
    ['moves to another', ['a'], 'b', {}, ['b']],
    ['shuts the open one, collapsible by default', ['a'], 'a', {}, []],
    ['keeps the only open one when not collapsible', ['a'], 'a', { collapsible: false }, ['a']],
    ['opens beside the others when multiple', ['a'], 'b', { multiple: true }, ['a', 'b']],
    ['shuts one of several when multiple', ['a', 'b'], 'a', { multiple: true }, ['b']],
  ] as const)('%s', (_, open, id, options, after) => {
    expect(toggled(open, id, options)).toEqual(after)
  })
})

describe('Accordion view', () => {
  it('meets the accordion pattern', () => {
    expect(A11y.validate(Patterns.Accordion, AccordionSlots)).toEqual([])
  })

  it('puts each trigger in a heading, naming its panel, which its trigger names back', () => {
    const drawn = view({ open: ['team'] })
    expect(Inert.byTag(drawn, 'h3')).toHaveLength(3)
    const [billing, team] = triggers(drawn)
    const [billingPanel, teamPanel] = panels(drawn)
    expect(Inert.value(billing, 'aria-expanded')).toBe('false')
    expect(Inert.value(team, 'aria-expanded')).toBe('true')
    expect(Inert.value(team, 'aria-controls')).toBe(Inert.value(teamPanel, 'id'))
    expect(Inert.value(teamPanel, 'aria-labelledby')).toBe(Inert.value(team, 'id'))
    // A shut panel is drawn, so its trigger names a node, and inert, so no one reaches it.
    expect(Inert.value(billingPanel, 'inert')).toBe('')
    expect(Inert.value(teamPanel, 'inert')).toBeUndefined()
  })

  it('sends the section a press toggles, and nothing from a disabled one', () => {
    const drawn = view({ onToggle: id => message(id === 'team' ? 'Clicked' : 'Other') })
    const [, team, keys] = triggers(drawn)
    expect(team?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.value(keys, 'disabled')).toBeDefined()
    expect(keys?.data?.on?.['click']).toBeUndefined()
  })

  it('draws its own icon in place of the chevron, with each section’s state', () => {
    const drawn = view({ open: ['team'], icon: h.span([], ['+']) })
    // Each row's one hidden mark is the icon: no chevron beside it.
    const marks = (drawn: ReturnType<typeof view>) =>
      Inert.byTag(drawn, 'span').filter(span => Inert.value(span, 'aria-hidden') === 'true')
    expect(marks(drawn).map(icon => [Inert.text(icon), Inert.value(icon, 'data-state')])).toEqual([
      ['+', 'closed'],
      ['+', 'open'],
      ['+', 'closed'],
    ])
    expect(marks(view({})).map(chevron => Inert.text(chevron))).toEqual(['', '', ''])
  })

  it('heads its sections at the level the page outline needs', () => {
    expect(Inert.byTag(view({ headingLevel: 2 }), 'h2')).toHaveLength(3)
  })
})

describe('Accordion rows', () => {
  it('draws an item’s icon before its title and its trailing content after it, in Slots of their own', () => {
    const drawn = view({
      items: [
        {
          id: 'a',
          title: 'Billing',
          content: 'x',
          icon: h.span([], ['$']),
          trailing: h.span([], ['3']),
        },
        { id: 'b', title: 'Team', content: 'y' },
      ],
    })
    const [first, second] = triggers(drawn)
    const spans = (trigger: typeof first) => Inert.children(trigger).map(child => Inert.text(child))
    expect(spans(first)).toEqual(['$', 'Billing', '3', ''])
    // A row with neither draws only its title and indicator.
    expect(spans(second)).toEqual(['Team', ''])
  })
})

describe('Accordion state', () => {
  const press = (model: AccordionModel, id: string, args: AccordionArgs = {}) =>
    accordionUpdate(model, AccordionMessage.Toggled({ id }), args).model

  it('starts from its args and folds a press through toggled', () => {
    const start = accordionInit({ open: ['a'], multiple: true })
    expect(start).toEqual({ open: ['a'] })
    expect(press(start, 'b', { multiple: true }).open).toEqual(['a', 'b'])
    expect(press(start, 'a').open).toEqual([])
  })

  it('returns the Model it was given when a press changes nothing', () => {
    const only = accordionInit({ open: ['a'] })
    expect(press(only, 'a', { collapsible: false })).toBe(only)
  })

  it('hands the view its open ids and a press Message', () => {
    const sent: Array<unknown> = []
    const controls = accordionControls({ open: ['a'] }, message => {
      sent.push(message)
      return message
    })
    expect(controls.open).toEqual(['a'])
    controls.onToggle('b')
    expect(sent).toEqual([AccordionMessage.Toggled({ id: 'b' })])
  })
})
