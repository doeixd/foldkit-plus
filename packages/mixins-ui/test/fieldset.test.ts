import { describe, expect, it } from 'vitest'
import { view as fieldsetView, type ViewConfig } from '@foldkit/ui/fieldset'
import { Attr, Behavior, Diagnostics, Style, type SlotAttributes } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import type { Html } from 'foldkit/html'
import { Fieldset, FieldsetSlots, Recipes } from '../src/index.js'
import { attributeOf, h, type Mixins, type TestMessage } from './fixture.js'

interface ResolvedFieldset {
  readonly fieldset: SlotAttributes<TestMessage>
  readonly legend: SlotAttributes<TestMessage>
  readonly description: SlotAttributes<TestMessage>
}

const renderFieldset = (
  config: Omit<ViewConfig<TestMessage>, 'toView'>,
  mixins: Mixins = [],
): ResolvedFieldset => {
  let captured: ResolvedFieldset = { fieldset: [], legend: [], description: [] }
  fieldsetView<TestMessage>(
    {
      ...config,
      toView: attributes => {
        captured = Fieldset.resolve(attributes, mixins, { input: undefined, h })
        return h.div([], [])
      },
    },
    h,
  )
  return captured
}

describe('Fieldset adapter', () => {
  it('preserves the base fieldset, legend, and description bundles', () => {
    const view = renderFieldset({ id: 'shipping', hasDescription: true })
    expect(attributeOf(view.fieldset, 'Id')?.value).toBe('shipping')
    expect(attributeOf(view.legend, 'Id')?.value).toBe('shipping-legend')
    expect(attributeOf(view.description, 'Id')?.value).toBe('shipping-description')
    expect(attributeOf(view.fieldset, 'AriaDescribedBy')?.value).toBe('shipping-description')
  })

  it('adds Style to the legend slot', () => {
    const LegendStyle = Style.forSlots(FieldsetSlots)({ legend: Style.class('legend') })
    expect(
      attributeOf(renderFieldset({ id: 'shipping' }, [LegendStyle.mixin]).legend, 'Class')?.value,
    ).toBe('legend')
  })

  it('keeps the disabled state owned by the base', () => {
    expect(
      attributeOf(renderFieldset({ id: 'shipping', isDisabled: true }).fieldset, 'Disabled')?.value,
    ).toBe(true)
    const Replace = Behavior.forSlots(FieldsetSlots)<undefined, TestMessage>({
      fieldset: Behavior.slot({
        requires: { attributes: [Attr.Disabled] },
        attributes: () => [h.Disabled(false)],
      }),
    })
    expect(() => renderFieldset({ id: 'shipping', isDisabled: true }, [Replace.mixin])).toThrow(
      Diagnostics.DiagnosticError,
    )
  })
})

describe('Fieldset recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Fieldset>[0]): string =>
    Style.forSlots(FieldsetSlots)(Recipes.Fieldset(selection)).css

  it('floats the legend into the group, out of the border it would sit across', () => {
    expect(css({})).toMatch(/\{[^}]*float:inline-start;[^}]*inline-size:100%/)
  })

  it('dims the legend and the description of a disabled fieldset', () => {
    expect(
      css({}).match(/:where\(:disabled\) > \.[\w-]+\{opacity:var\(--fk-knob-state-disabled\)\}/g),
    ).toHaveLength(2)
  })

  it.each([
    ['bordered', 'border:var(--fk-border-thin) solid var(--fk-outline-subtle)'],
    ['filled', 'background:var(--fk-surface-muted)'],
  ] as const)('boxes a %s group, padded, its controls concentric with it', (variant, look) => {
    const boxed = css({ variant })
    expect(boxed).toMatch(
      /@layer variants\{[^}]*--fk-inset:var\(--fk-space-lg\)[^}]*padding:var\(--fk-space-lg\)/,
    )
    expect(boxed).toContain(look)
  })

  it('draws a plain group with no box', () => {
    expect(css({})).not.toContain('@layer variants')
  })

  it('reads only tokens the theme declares', () => {
    const style = Style.forSlots(FieldsetSlots)(Recipes.Fieldset({ variant: 'bordered' }))
    let drawn: Html = h.div([], [])
    fieldsetView<TestMessage>(
      {
        id: 'shipping',
        isDisabled: true,
        hasDescription: true,
        toView: attributes => {
          const resolved = Fieldset.resolve(attributes, [style.mixin], { input: undefined, h })
          drawn = h.fieldset(resolved.fieldset, [
            h.legend(resolved.legend, ['Shipping']),
            h.p(resolved.description, ['Where it goes.']),
          ])
          return drawn
        },
      },
      h,
    )
    const theme = Theme.standard(Theme.make({}))
    expect(Inert.missingTokens(drawn, Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})
