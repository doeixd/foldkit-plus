/**
 * The examples write a secondary widget's style as `Recipes.X.style(selection)`.
 * The site's own `forSlots` places a style in the `app` layer, but only pieces
 * that have no layer of their own: a shipped recipe's pieces sit in `components`
 * and `variants`, so for a shipped recipe both forms must compile to the same
 * rules in the same layers. This holds that for every recipe, at its defaults
 * and at each value of each axis.
 */
import { Style } from 'foldkit-mixins'
import * as UI from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import { forSlots } from '../src/snippets/theme.js'

type Selection = Record<string, string>
type Compiled = Parameters<typeof compile>[0]
type Shipped = {
  (selection?: Selection): unknown
  readonly style: (selection?: Selection) => Compiled
  readonly def: { readonly variants?: Record<string, Record<string, unknown>> }
}

const recipes = Object.entries<unknown>(UI.Recipes).filter(
  (entry): entry is [string, Shipped] =>
    typeof entry[1] === 'function' && 'style' in entry[1] && 'def' in entry[1],
)

/** A recipe's contract is exported as `<Name>Slots`, except where a recipe is built over another widget's. */
const otherContract: Record<string, string> = {
  HoverCard: 'HoverIntentSlots',
  MenubarMenu: 'MenuSlots',
  Sheet: 'DialogSlots',
}
const contractOf = (name: string): unknown => Reflect.get(UI, otherContract[name] ?? `${name}Slots`)

const compile = (style: {
  pieces: unknown
  css: string
  globalCss: string
  rules: unknown
  globalRules: unknown
}) => ({
  pieces: style.pieces,
  css: style.css,
  globalCss: style.globalCss,
  rules: style.rules,
  globalRules: style.globalRules,
})

const selections = (recipe: Shipped): Array<[string, Selection | undefined]> => [
  ['the defaults', undefined],
  ...Object.entries(recipe.def.variants ?? {}).flatMap(([axis, values]) =>
    Object.keys(values).map((value): [string, Selection] => [
      `${axis}: ${value}`,
      { [axis]: value },
    ]),
  ),
]

describe('a shipped recipe in the app layer', () => {
  it('finds the recipes to compare', () => {
    expect(recipes.length).toBeGreaterThan(40)
  })

  it.each(recipes)('%s: .style() is the app-layer forSlots, rule for rule', (name, recipe) => {
    const contract = contractOf(name)
    expect(contract, `${name}Slots`).toBeDefined()
    // The contract is looked up by name, so its type is not known here.
    const place = (pieces: unknown): Compiled => forSlots(contract as never)(pieces as never)
    for (const [, selection] of selections(recipe)) {
      const two = compile(place(recipe(selection)))
      const one = compile(recipe.style(selection))
      expect(one).toEqual(two)
    }
  })

  it('differs for a piece an example adds with no layer of its own, which is why those stay on forSlots', () => {
    const Extended = UI.Recipes.Button.extend({ base: { button: Style.self({ margin: '0' }) } })
    const place = forSlots(UI.ButtonSlots)
    expect(compile(Extended.style()).css).not.toMatch(/@layer app/)
    expect(compile(place(Extended())).css).toMatch(/@layer app\{[^}]*\{margin:0\}/)
  })
})
