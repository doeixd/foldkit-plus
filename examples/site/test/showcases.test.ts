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
import { pagesWithTopics, topicsFor } from '../src/gallery/related.js'
import * as Widgets from '../src/gallery/widgets.js'

const live: Live<string> = {
  switched: false,
  onSwitch: () => 'switched',
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

  it('keep the values an example pins, whatever is picked', () => {
    const steps = Option.getOrThrow(showcaseOf('steps'))
    const [basic, , vertical] = steps.examples
    const pick = (orientation: string) => ({ orientation })
    expect(markup(vertical!.render(pick('horizontal'), live))).toBe(
      markup(vertical!.render(pick('vertical'), live)),
    )
    expect(markup(basic!.render(pick('horizontal'), live))).not.toBe(
      markup(basic!.render(pick('vertical'), live)),
    )
  })

  it('leave an axis with no default and no middle step unset until it is picked', () => {
    const table = Option.getOrThrow(showcaseOf('table'))
    expect(table.axes.find(axis => axis.name === 'density')).toEqual({
      name: 'density',
      values: ['unset', 'compact', 'regular', 'comfortable'],
      initial: 'unset',
    })
    expect(selectionCode(table, {})).toBe('forSlots(TableSlots)(Recipes.Table({}))')
    const [basic] = table.examples
    expect(markup(basic!.render({ density: 'compact' }, live))).not.toBe(
      markup(basic!.render({}, live)),
    )
  })

  it('list topics only for pages there are, each once', () => {
    const slugs = new Set(showcases.map(showcase => showcase.slug))
    for (const slug of pagesWithTopics()) {
      expect(slugs.has(slug), slug).toBe(true)
      const labels = topicsFor(slug).map(topic => topic.label)
      expect(new Set(labels).size, slug).toBe(labels.length)
    }
    expect(topicsFor('toolbar').map(topic => topic.heading)).toEqual([
      'Application key routes',
      'Right to left',
    ])
  })

  it('have one page each', () => {
    const slugs = showcases.map(showcase => showcase.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(Option.isNone(showcaseOf('constructor'))).toBe(true)
  })

  it('draw each image with the words it needs: a description, or an empty alt that skips it', () => {
    const page = markup(Option.getOrThrow(showcaseOf('image')).preview({}, live))
    expect(page).toContain('Dunes under a pale sun')
    expect(page).toContain('"alt"')
    expect(page).toContain('presentation')
  })

  it('name an icon that means something and hide one that is ornament', () => {
    const page = markup(Option.getOrThrow(showcaseOf('icon')).preview({}, live))
    expect(page).toContain('"aria-label"')
    expect(page).toContain('Saved')
    // Two of the three carry a name; the third, beside the word Copy, is ornament.
    expect(page.match(/"aria-label"/g)).toHaveLength(2)
  })

  it('tie a disabled fieldset’s legend to its description, and offer typography no axis', () => {
    const fieldset = markup(Option.getOrThrow(showcaseOf('fieldset')).preview({}, live))
    expect(fieldset).toContain('"props":{"id":"shipping-description"}')
    expect(fieldset).toContain('billing-legend')
    expect(Option.getOrThrow(showcaseOf('typography')).axes).toEqual([])
  })

  it('draw the code field refused, disabled and read only beside the one being filled', () => {
    const states = Option.getOrThrow(showcaseOf('otp-field')).examples.find(
      example => example.name === 'states',
    )
    const page = markup(states!.render({}, live))
    expect(page.match(/"aria-invalid":"true"/g)).toHaveLength(1)
    expect(page.match(/"disabled":true/g)).toHaveLength(1)
    expect(page.match(/"readOnly":true/g)).toHaveLength(1)
  })
})
