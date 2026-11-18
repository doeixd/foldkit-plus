/**
 * `Button.view`'s parts: a trailing drawing, a description, a corner mark,
 * the invalid and busy states, and the link. Drawn with the inert builder,
 * so what is asserted is the markup and attributes the view writes; what
 * they look like is `buttonLook.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Button, ButtonSlots } from '../src/index.js'

const h = SlotView.inertBuilder<'Clicked'>()
const own = Style.forSlots(ButtonSlots)({
  button: Style.class('b'),
  content: Style.class('c'),
  description: Style.class('d'),
  trailing: Style.class('t'),
  mark: Style.class('m'),
})

describe('Button.view parts', () => {
  it('draws the trailing drawing after the label, in its own slot', () => {
    const drawn = Button.view({ label: 'More', trailing: h.span([], ['v']), style: own }, h)
    const [node] = Inert.byTag(drawn, 'button')
    expect(Inert.text(node)).toBe('Morev')
    const [trailing] = Inert.byTag(drawn, 'span')
    expect(Inert.classes(trailing)).toEqual(['t'])
    expect(Inert.value(trailing, 'aria-hidden')).toBeUndefined()
  })

  it('draws a description under the label, inside one content box that names the button', () => {
    const drawn = Button.view({ label: 'Deploy', description: 'To production', style: own }, h)
    const [content, description] = Inert.byTag(drawn, 'span')
    expect(Inert.classes(content)).toEqual(['c'])
    expect(Inert.classes(description)).toEqual(['d'])
    expect(Inert.text(Inert.byTag(drawn, 'button')[0])).toBe('DeployTo production')
    // Without one the label is the button's own text, with no box around it.
    expect(Inert.byTag(Button.view({ label: 'Deploy' }, h), 'span')).toHaveLength(0)
  })

  it('draws a corner mark in its slot, not hidden from assistive technology', () => {
    const drawn = Button.view({ label: 'Inbox', mark: h.span([], ['3']), style: own }, h)
    const marks = Inert.byTag(drawn, 'span').filter(node => Inert.classes(node).includes('m'))
    expect(marks).toHaveLength(1)
    expect(Inert.value(marks[0], 'aria-hidden')).toBeUndefined()
    expect(Inert.text(marks[0])).toBe('3')
  })

  it('marks an invalid button with data-invalid and not aria-invalid', () => {
    const [invalid] = Inert.byTag(Button.view({ label: 'Pick', invalid: true }, h), 'button')
    expect(Inert.value(invalid, 'data-invalid')).toBe('')
    expect(Inert.value(invalid, 'aria-invalid')).toBeUndefined()
    const [fine] = Inert.byTag(Button.view({ label: 'Pick', invalid: false }, h), 'button')
    expect(Inert.value(fine, 'data-invalid')).toBeUndefined()
  })

  it('marks a busy button aria-busy and withholds its press, and a busy submit stops submitting', () => {
    const idle = Button.view({ label: 'Save', onClick: 'Clicked', type: 'submit' }, h)
    const [idleButton] = Inert.byTag(idle, 'button')
    expect(idleButton?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.value(idleButton, 'type')).toBe('submit')
    expect(Inert.value(idleButton, 'aria-busy')).toBeUndefined()

    const busy = Button.view({ label: 'Save', onClick: 'Clicked', type: 'submit', busy: true }, h)
    const [busyButton] = Inert.byTag(busy, 'button')
    expect(Inert.value(busyButton, 'aria-busy')).toBe('true')
    expect(Inert.value(busyButton, 'data-busy')).toBe('')
    expect(busyButton?.data?.on?.['click']).toBeUndefined()
    expect(Inert.value(busyButton, 'type')).toBe('button')
    // Still focusable, and not announced as disabled.
    expect(Inert.value(busyButton, 'aria-disabled')).toBeUndefined()
  })
})

describe('Button.view as a link', () => {
  it('draws an anchor with the href, and no type, tabindex or click', () => {
    const drawn = Button.view({ label: 'Docs', href: '/docs', style: own }, h)
    expect(Inert.byTag(drawn, 'button')).toHaveLength(0)
    const [link] = Inert.byTag(drawn, 'a')
    expect(Inert.value(link, 'href')).toBe('/docs')
    expect(Inert.classes(link)).toEqual(['b'])
    expect(Inert.value(link, 'type')).toBeUndefined()
    expect(Inert.value(link, 'tabindex')).toBeUndefined()
    expect(link?.data?.on?.['click']).toBeUndefined()
    expect(Inert.value(link, 'target')).toBeUndefined()
  })

  it('opens an external link in a new tab and says so, in words that can be replaced', () => {
    const [away] = Inert.byTag(
      Button.view({ label: 'Docs', href: 'https://example.com', external: true }, h),
      'a',
    )
    expect(Inert.value(away, 'target')).toBe('_blank')
    expect(Inert.value(away, 'rel')).toBe('noopener noreferrer')
    expect(Inert.value(away, 'aria-description')).toBe('Opens in a new tab')
    const [fr] = Inert.byTag(
      Button.view(
        {
          label: 'Docs',
          href: 'https://example.com',
          external: true,
          words: { external: 'Nouvel onglet' },
        },
        h,
      ),
      'a',
    )
    expect(Inert.value(fr, 'aria-description')).toBe('Nouvel onglet')
  })

  it('goes nowhere while disabled: no href, aria-disabled', () => {
    const [link] = Inert.byTag(
      Button.view({ label: 'Docs', href: '/docs', disabled: true }, h),
      'a',
    )
    expect(Inert.value(link, 'href')).toBeUndefined()
    expect(Inert.value(link, 'aria-disabled')).toBe('true')
  })

  it('carries the invalid and busy marks as a button does', () => {
    const [link] = Inert.byTag(
      Button.view({ label: 'Docs', href: '/docs', invalid: true, busy: true }, h),
      'a',
    )
    expect(Inert.value(link, 'data-invalid')).toBe('')
    expect(Inert.value(link, 'aria-busy')).toBe('true')
  })
})
