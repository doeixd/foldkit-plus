// @vitest-environment jsdom
/**
 * What an application adds to a shipped widget without touching its source,
 * written as an application writes it: published names only, no cast. A
 * look the Button recipe lacks, given with `add`, styles a Button. (A choice
 * of the application's own is in `bundles.test.ts`.)
 */
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Button, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import { h } from './fixture.js'

const Buttons = Recipes.Button.add({
  tone: { brand: { button: Style.self({ outlineColor: 'rebeccapurple' }) } },
  width: { full: { button: Style.self({ inlineSize: '100%' }) } },
})

const Brand = Style.forSlots(ButtonSlots)(Buttons({ tone: 'brand', variant: 'solid' }))
const Wide = Style.forSlots(ButtonSlots)(Buttons({ width: 'full' }))
const Shipped = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'solid' }))

const classesOf = (style: typeof Brand) => {
  const [button] = Inert.byTag(Button.view({ label: 'Go', style }, h), 'button')
  return Inert.classes(button)
}

/** The classes of `style` whose rule holds `declaration`. */
const ruled = (style: typeof Brand, declaration: string) =>
  classesOf(style).filter(name =>
    style.css.split('}').some(rule => rule.includes(`.${name}`) && rule.includes(declaration)),
  )

describe('a look added to the shipped Button recipe', () => {
  it('draws on the button, in a rule of its own', () => {
    expect(ruled(Brand, 'outline-color:rebeccapurple')).toHaveLength(1)
    expect(ruled(Wide, 'inline-size:100%')).toHaveLength(1)
    expect(ruled(Shipped, 'outline-color:rebeccapurple')).toEqual([])
  })

  it('leaves the shipped looks as they were', () => {
    const shipped = classesOf(Shipped)
    expect(shipped.length).toBeGreaterThan(0)
    // An added axis has no default, so the recipe as shipped is unchanged.
    expect(classesOf(Style.forSlots(ButtonSlots)(Buttons({ variant: 'solid' })))).toEqual(shipped)
    expect(classesOf(Brand)).not.toEqual(shipped)
  })
})
