import { describe, expect, it } from 'vitest'
import { view as disclosureView, type ViewConfig } from '@foldkit/ui/disclosure'
import type { Html } from 'foldkit/html'
import { Behavior, Diagnostics, Style, type SlotAttributes } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { Disclosure, DisclosureSlots, Recipes } from '../src/index.js'
import { attributeOf, h, message, type Mixins, type TestMessage } from './fixture.js'

interface ResolvedDisclosure {
  readonly button: SlotAttributes<TestMessage>
  readonly panel: SlotAttributes<TestMessage>
  readonly animatePanel: (content: Html) => Html
}

interface Rendered {
  readonly view: ResolvedDisclosure
  readonly originalAnimatePanel: (content: Html) => Html
}

const renderDisclosure = (
  config: Omit<ViewConfig<TestMessage>, 'toView'>,
  mixins: Mixins = [],
): Rendered => {
  let view: Rendered['view'] | undefined
  let originalAnimatePanel: ((content: Html) => Html) | undefined
  disclosureView<TestMessage>(
    {
      ...config,
      toView: attributes => {
        originalAnimatePanel = attributes.animatePanel
        view = Disclosure.resolve(attributes, mixins, { input: undefined, h })
        return h.div([], [])
      },
    },
    h,
  )
  return { view: view!, originalAnimatePanel: originalAnimatePanel! }
}

const closed = { id: 'details', isOpen: false, onToggle: () => message('Other') }

describe('Disclosure adapter', () => {
  it('preserves the base button and panel bundles', () => {
    const { view } = renderDisclosure(closed)
    expect(attributeOf(view.button, 'AriaExpanded')?.value).toBe(false)
    expect(attributeOf(view.button, 'OnClick')?.message).toEqual(message('Other'))
    expect(attributeOf(view.panel, 'Id')?.value).toBe('details-panel')
  })

  it('passes animatePanel through by identity', () => {
    const { view, originalAnimatePanel } = renderDisclosure(closed)
    expect(view.animatePanel).toBe(originalAnimatePanel)
  })

  it('adds Style to the panel slot', () => {
    const PanelStyle = Style.forSlots(DisclosureSlots)({ panel: Style.class('panel') })
    const { view } = renderDisclosure(closed, [PanelStyle.mixin])
    expect(attributeOf(view.panel, 'Class')?.value).toBe('panel')
  })

  it('refuses a Behavior that takes over the base click', () => {
    const Steal = Behavior.forSlots(DisclosureSlots)<undefined, TestMessage>({
      button: Behavior.slot({ attributes: () => [h.OnClick(message('Other'))] }),
    })
    expect(() => renderDisclosure(closed, [Steal.mixin])).toThrow(Diagnostics.DiagnosticError)
  })
})

describe('Disclosure recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Disclosure>[0]): string =>
    Style.forSlots(DisclosureSlots)(Recipes.Disclosure(selection)).css

  it('draws a chevron on the button that turns up once open, by travel, and none on request', () => {
    expect(css({})).toMatch(/::after\{[^}]*content:""[^}]*rotate:45deg/)
    expect(css({})).toMatch(/::after\{[^}]*transition-duration:calc\([^}]*--fk-knob-travel/)
    expect(css({})).toMatch(/\[data-open\]::after\{[^}]*rotate:225deg/)
    expect(css({ indicator: 'none' })).not.toContain('::after')
  })

  it('squares a bordered button’s lower corners onto the panel only while open', () => {
    const bordered = css({ variant: 'bordered' })
    expect(bordered).toMatch(
      /@layer variants\{\.[\w-]+\[data-open\]\{border-end-end-radius:0;border-end-start-radius:0\}/,
    )
    expect(bordered).toMatch(/@layer variants\{\.[\w-]+\{[^}]*border-radius:var\(--fk-radius-lg\)/)
    expect(css({})).not.toContain('border-end-end-radius')
  })

  it('fills a ghost button under the pointer, and no other', () => {
    expect(css({ variant: 'ghost' })).toMatch(/:hover:not\([^)]*\)[^{]*\{background:color-mix/)
    expect(css({})).not.toMatch(/:hover:not\([^)]*\)[^{]*\{background:/)
  })

  it('reads only tokens the theme declares', () => {
    const style = Style.forSlots(DisclosureSlots)(Recipes.Disclosure({ variant: 'bordered' }))
    let drawn: Html = h.div([], [])
    disclosureView<TestMessage>(
      {
        id: 'details',
        isOpen: true,
        onToggle: () => message('Other'),
        toView: attributes => {
          const resolved = Disclosure.resolve(attributes, [style.mixin], { input: undefined, h })
          drawn = h.div(
            [],
            [h.button(resolved.button, ['Details']), h.div(resolved.panel, ['Body'])],
          )
          return drawn
        },
      },
      h,
    )
    const theme = Theme.standard(Theme.make({}))
    expect(Inert.missingTokens(drawn, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})
