/**
 * The component showcases: their axes are the recipes' own, a selection
 * reaches the recipe only through values it has, and a picked value changes
 * what the preview draws.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'

import {
  selectionCode,
  showcaseOf,
  showcases,
  valueOf,
  type Live,
  type Selection,
} from '../src/gallery/showcases.js'
import * as Widgets from '../src/gallery/widgets.js'

const live: Live<string> = {
  checked: false,
  onCheck: () => 'checked',
  switched: false,
  onSwitch: () => 'switched',
  page: 1,
  onPage: () => 'paged',
  chosen: 'team',
  onChoose: key => `chose ${key}`,
  dismissed: false,
  onDismiss: 'dismissed',
  onRestore: 'restored',
  direction: 'ltr',
  widgets: Widgets.initial,
  onWidget: message => message._tag,
  h: SlotView.inertBuilder<string>(),
}

/** What a preview draws, as data: its elements, classes and text. */
const markup = (html: Html) =>
  JSON.stringify(html, (key, value) => (key === 'elm' ? undefined : value))

const button = Option.getOrThrow(showcaseOf('button'))
const drawn = (selection: Selection) => markup(button.preview(selection, live))

describe('the showcases', () => {
  it('take their axes and defaults from the recipe', () => {
    expect(button.axes).toEqual([
      { name: 'tone', values: ['accent', 'neutral', 'danger'], initial: 'accent' },
      {
        name: 'variant',
        values: ['solid', 'outline', 'ghost', 'primary', 'icon'],
        initial: 'solid',
      },
      { name: 'size', values: ['sm', 'md', 'lg'], initial: 'md' },
    ])
  })

  it('hold a value only when the recipe has it', () => {
    const [tone] = button.axes
    expect(valueOf(tone!, { tone: 'danger' })).toBe('danger')
    expect(valueOf(tone!, { tone: 'plaid' })).toBe('accent')
    expect(valueOf(tone!, Object.create({ tone: 'danger' }))).toBe('accent')
  })

  it('draw another look for another value, and the same for an unknown one', () => {
    expect(drawn({ tone: 'danger' })).not.toBe(drawn({}))
    expect(drawn({ tone: 'plaid' })).toBe(drawn({}))
  })

  it('name only the values that differ from the defaults in code', () => {
    expect(selectionCode(button, {})).toBe('forSlots(ButtonSlots)(Recipes.Button({}))')
    expect(selectionCode(button, { tone: 'accent', size: 'lg', variant: 'ghost' })).toBe(
      "forSlots(ButtonSlots)(Recipes.Button({ variant: 'ghost', size: 'lg' }))",
    )
  })

  it('have one page each', () => {
    const slugs = showcases.map(showcase => showcase.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(Option.isNone(showcaseOf('constructor'))).toBe(true)
  })
})
