/** How a showcase is declared: from a recipe, whose axes it reads, or fixed. */
import type { Html } from 'foldkit/html'
import { SlotView, type NamedStyle, type StylePieces } from 'foldkit-mixins'
import { forSlots } from '../snippets/theme.js'
import { valueOf, type Axis, type Live, type Selection, type Showcase } from './showcase.js'

export const inert = SlotView.inertBuilder<never>()

/** The value of an axis the recipe sets nothing for until one is picked. */
const UNSET = 'unset'

interface RecipeOf<Slots> {
  readonly def: {
    readonly variants: Readonly<Record<string, object>>
    readonly defaults?: Readonly<Record<string, string | undefined>>
  }
}

/**
 * A showcase from a recipe. `only` names the axes a reader may pick from,
 * when a value of another would need different markup (a vertical rule).
 * A selection's style is built once and kept: a reader goes back and forth.
 * `examples` names the page's examples; each draws with the picked style, so
 * the axes switch every example at once, except the values an example `pins`:
 * a vertical stepper stays vertical whatever orientation is picked.
 */
export const fromRecipe = <Slots>(
  about: Omit<Showcase, 'axes' | 'preview' | 'examples'>,
  contract: Slots,
  recipe: RecipeOf<Slots> & ((selection: never) => StylePieces<Slots>),
  draw: <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html,
  only?: ReadonlyArray<string>,
  examples: ReadonlyArray<{
    readonly name: string
    readonly title: string
    readonly draw: <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html
    readonly pins?: Selection
  }> = [],
): Showcase => {
  const axes = Object.entries(recipe.def.variants)
    .filter(([name]) => only === undefined || only.includes(name))
    .map(([name, values]): Axis => {
      const names = Object.keys(values)
      const initial = recipe.def.defaults?.[name]
      if (initial !== undefined) return { name, values: names, initial }
      // An axis the recipe leaves unset follows the page, as a size follows
      // the ladder's step, which is the default one on this page. One with no
      // such step (a lone `overflow: 'scroll'`, a `width: 'fill'`) can be left
      // unset, and is at first: picking its only value would force it on.
      return names.includes('md')
        ? { name, values: names, initial: 'md' }
        : { name, values: [UNSET, ...names], initial: UNSET }
    })
  // Every value passed was checked against the recipe's own axes by `valueOf`.
  const select = recipe as unknown as (selection: Selection) => StylePieces<Slots>
  const styles = new Map<string, NamedStyle<Slots>>()
  const styleOf = (selection: Selection): NamedStyle<Slots> => {
    const chosen = Object.fromEntries(
      axes.flatMap(axis => {
        const value = valueOf(axis, selection)
        return value === UNSET ? [] : [[axis.name, value]]
      }),
    )
    const key = axes.map(axis => valueOf(axis, selection)).join('/')
    const known = styles.get(key)
    if (known !== undefined) return known
    const style = forSlots(contract)(select(chosen))
    styles.set(key, style)
    return style
  }
  for (const { name, pins = {} } of examples)
    for (const [axis, value] of Object.entries(pins))
      if (
        !(
          recipe.def.variants[axis] !== undefined && Object.hasOwn(recipe.def.variants[axis], value)
        )
      )
        throw new Error(
          `${about.slug}#${name} pins ${axis}: '${value}', which ${about.recipe} lacks`,
        )
  return {
    ...about,
    axes,
    preview: (selection, live) => draw(styleOf(selection), live),
    examples: examples.map(({ name, title, draw: drawExample, pins = {} }) => ({
      name,
      title,
      render: (selection, live) => drawExample(styleOf({ ...selection, ...pins }), live),
    })),
  }
}

/** A showcase whose look has no axes to pick from. */
export const fixed = (
  about: Omit<Showcase, 'axes' | 'preview' | 'examples'>,
  draw: <Message>(live: Live<Message>) => Html,
  examples: ReadonlyArray<{
    readonly name: string
    readonly title: string
    readonly draw: <Message>(live: Live<Message>) => Html
  }> = [],
): Showcase => ({
  ...about,
  axes: [],
  preview: (_, live) => draw(live),
  examples: examples.map(({ name, title, draw: drawExample }) => ({
    name,
    title,
    render: (_, live) => drawExample(live),
  })),
})
