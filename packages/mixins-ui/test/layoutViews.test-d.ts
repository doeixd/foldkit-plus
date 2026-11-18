/**
 * Types of the layout and disclosure widgets' new surface: `configure`'s
 * presets, and what each Bundle's args and views refuse. One defect per
 * refusal.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { test } from 'vitest'
import { Accordion, AccordionSlots, ButtonSlots, Recipes } from '../src/index.js'

type Message = { readonly _tag: 'Toggled'; readonly id: string }
declare const h: HtmlBuilder<Message>
const toggled = (id: string): Message => ({ _tag: 'Toggled', id })

const accordion = Style.forSlots(AccordionSlots)(Recipes.Accordion({}))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const App = Accordion.configure({
  base: { style: accordion },
  presets: { calm: { headingLevel: 4 } },
})
const items = [{ id: 'a', title: 'A', content: 'x' }]

test('Accordion.configure takes a preset by name and keeps the application’s Message', () => {
  App.view({ id: 'faq', items, open: [], onToggle: toggled, preset: 'calm' }, h)
})

test('Accordion.configure refuses what the preset type does not hold', () => {
  // @ts-expect-error a preset name nothing declared
  App.view({ id: 'faq', items, open: [], onToggle: toggled, preset: 'loud' }, h)
  // @ts-expect-error a style of another widget's Slots
  Accordion.configure({ base: { style: button } })
  // @ts-expect-error `open` is a fact of one use, not of a preset
  Accordion.configure({ base: { open: ['a'] } })
  const Bare = Accordion.configure({ base: { style: accordion } })
  Bare.view(
    // @ts-expect-error no preset was declared, so none can be chosen
    { id: 'faq', items, open: [], onToggle: toggled, preset: 'calm' },
    h,
  )
})

test('an item’s icon and trailing content are Html, not text', () => {
  // @ts-expect-error trailing content is drawn, so it is Html
  const bad: Accordion.AccordionItem = { id: 'a', title: 'A', content: 'x', trailing: 'text' }
  void bad
})

test('Accordion.update takes the args the Bundle holds', () => {
  Accordion.update(Accordion.init(), Accordion.Message.Toggled({ id: 'a' }), { multiple: true })
  // @ts-expect-error an arg the Bundle does not have
  Accordion.update(Accordion.init(), Accordion.Message.Toggled({ id: 'a' }), { loop: true })
})
