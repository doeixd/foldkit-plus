// @vitest-environment jsdom
/** The default drawing of `Input.view`: label, adornments inside one group, description. */
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Input } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const draw = (extra: object = {}) =>
  Input.view({ id: 'site', label: 'Website', value: 'x', ...extra }, h)

describe('Input.view drawn from a label', () => {
  it('draws the control alone, with no group, when nothing is adorned', () => {
    const html = draw()
    expect(Inert.byTag(html, 'input')).toHaveLength(1)
    expect(
      Inert.byTag(html, 'div').filter(div => Inert.value(div, 'data-field-group') !== undefined),
    ).toHaveLength(0)
  })

  it('puts start and end around the control inside one marked group', () => {
    const html = draw({ start: h.span([], ['https://']), end: h.span([], ['.com']) })
    const [group] = Inert.byTag(html, 'div').filter(
      div => Inert.value(div, 'data-field-group') !== undefined,
    )
    expect(group).toBeDefined()
    expect(Inert.text(group!)).toBe('https://.com')
    expect(Inert.byTag(group!, 'input')).toHaveLength(1)
  })

  it('links a description to the input and draws labelAside beside the label', () => {
    const html = draw({ description: 'Your site.', labelAside: h.span([], ['Optional']) })
    const [input] = Inert.byTag(html, 'input')
    expect(Inert.value(input!, 'aria-describedby')).toBe('site-description')
    expect(Inert.text(html)).toContain('Optional')
  })
})
