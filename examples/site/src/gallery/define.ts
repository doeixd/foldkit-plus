/** How a showcase is declared: from a recipe, whose axes it reads, or fixed. */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView, type NamedStyle, type StylePieces } from 'foldkit-mixins'
import { forSlots } from '../snippets/theme.js'
import type { Example, RecipeOf } from './example.js'
import {
  exampleKey,
  valueOf,
  type About,
  type Axis,
  type Live,
  type Need,
  type Selection,
  type Showcase,
} from './showcase.js'

export const inert = SlotView.inertBuilder<never>()

/** The value of an axis the recipe sets nothing for until one is picked. */
const UNSET = 'unset'

type Draw<Slots> = <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html

/**
 * One example of a page: a module of its own (`examples/<slug>/<name>.ts`),
 * or a function of `snippets/components.ts` whose `// #region` is its code.
 * A page lists either kind, so pages move to modules one at a time.
 */
export type Entry<Slots> =
  | { readonly name: string; readonly example: Example<Slots> }
  | {
      readonly name: string
      readonly title: string
      readonly draw: Draw<Slots>
      readonly pins?: Selection
    }

/**
 * A showcase from a recipe. `only` names the axes a reader may pick from,
 * when a value of another would need different markup (a vertical rule).
 * A selection's style is built once and kept: a reader goes back and forth.
 * `examples` names the page's examples; each draws with the picked style, so
 * the axes switch every example at once, except the values an example `pins`:
 * a vertical stepper stays vertical whatever orientation is picked. An
 * example module may name a recipe of its own (the page's with a value
 * added), which the picked values then go to. `needs` names an axis the
 * recipe reads only under another axis's values (a card's elevation under its
 * outlined and elevated surfaces); the page disables it otherwise, since a
 * control that does nothing must not look live. `draw` is the gallery's card:
 * a function, or the example module that stands for the page.
 */
export const fromRecipe = <Slots>(
  about: About,
  contract: Slots,
  recipe: RecipeOf<Slots>,
  draw: Draw<Slots> | Example<Slots>,
  only?: ReadonlyArray<string>,
  examples: ReadonlyArray<Entry<Slots>> = [],
  needs: Readonly<Record<string, Need>> = {},
): Showcase => {
  const axes = Object.entries(recipe.def.variants)
    .filter(([name]) => only === undefined || only.includes(name))
    .map(([name, values]): Axis => {
      const names = Object.keys(values)
      const initial = recipe.def.defaults?.[name]
      const need = Object.hasOwn(needs, name) ? needs[name] : undefined
      const needing = need === undefined ? {} : { needs: need }
      if (initial !== undefined) return { name, values: names, initial, ...needing }
      // An axis the recipe leaves unset follows the page, as a size follows
      // the ladder's step, which is the default one on this page. One with no
      // such step (a lone `overflow: 'scroll'`, a `width: 'fill'`) can be left
      // unset, and is at first: picking its only value would force it on.
      return names.includes('md')
        ? { name, values: names, initial: 'md', ...needing }
        : { name, values: [UNSET, ...names], initial: UNSET, ...needing }
    })
  for (const [name, need] of Object.entries(needs)) {
    const named = axes.find(axis => axis.name === name)
    const other = axes.find(axis => axis.name === need.axis)
    if (
      named === undefined ||
      other === undefined ||
      !need.values.every(value => other.values.includes(value))
    )
      throw new Error(`${about.slug} says ${name} needs ${need.axis}, which ${about.recipe} lacks`)
  }
  const styles = new Map<RecipeOf<Slots>, Map<string, NamedStyle<Slots>>>()
  /** The style of `from` under what was picked, with `pins` over it. */
  const styleOf = (
    selection: Selection,
    from: RecipeOf<Slots> = recipe,
    pins: Selection = {},
  ): NamedStyle<Slots> => {
    const chosen = {
      ...Object.fromEntries(
        axes.flatMap(axis => {
          const value = valueOf(axis, selection)
          return value === UNSET ? [] : [[axis.name, value]]
        }),
      ),
      ...pins,
    }
    const key = JSON.stringify(Object.entries(chosen).sort(([a], [b]) => a.localeCompare(b)))
    const known = styles.get(from) ?? new Map<string, NamedStyle<Slots>>()
    styles.set(from, known)
    const kept = known.get(key)
    if (kept !== undefined) return kept
    // Every value passed is one of the recipe's own: a picked one was checked
    // by `valueOf`, and a pinned one where the page was declared, below.
    const select = from as unknown as (selection: Selection) => StylePieces<Slots>
    const style = forSlots(contract)(select(chosen))
    known.set(key, style)
    return style
  }
  const checkPins = (name: string, from: RecipeOf<Slots>, pins: Selection) => {
    for (const [axis, value] of Object.entries(pins)) {
      const values = Object.hasOwn(from.def.variants, axis) ? from.def.variants[axis] : undefined
      if (values === undefined || !Object.hasOwn(values, value))
        throw new Error(
          `${about.slug}#${name} pins ${axis}: '${value}', which ${about.recipe} lacks`,
        )
    }
  }
  const drawModule =
    (name: string, example: Example<Slots>) =>
    <Message>(selection: Selection, live: Live<Message>): Html => {
      const key = exampleKey(about.slug, name)
      return example.render(
        styleOf(selection, example.recipe, example.pins),
        Object.hasOwn(live.examples, key) ? live.examples[key] : undefined,
        message => live.onExample(key, message),
        live.h,
      )
    }
  const drawn = examples.map(entry => {
    if ('example' in entry) {
      if (entry.example.slots !== contract)
        throw new Error(`${about.slug}#${entry.name} is an example of another widget’s slots`)
      checkPins(entry.name, entry.example.recipe, entry.example.pins)
      return {
        name: entry.name,
        title: entry.example.title,
        code: 'module' as const,
        render: drawModule(entry.name, entry.example),
        state: entry.example.state,
      }
    }
    const { name, title, draw: drawExample, pins = {} } = entry
    checkPins(name, recipe, pins)
    return {
      name,
      title,
      code: 'region' as const,
      render: <Message>(selection: Selection, live: Live<Message>) =>
        // A pin on an axis the page leaves out (`only`) is not applied, as before modules.
        drawExample(styleOf({ ...selection, ...pins }), live),
      state: Option.none(),
    }
  })
  const card = (): Showcase['preview'] => {
    if (typeof draw === 'function') return (selection, live) => draw(styleOf(selection), live)
    const listed = examples.find(entry => 'example' in entry && entry.example === draw)
    if (listed === undefined)
      throw new Error(`${about.slug}’s card is an example its page does not list`)
    return drawModule(listed.name, draw)
  }
  return {
    ...about,
    axes,
    preview: card(),
    examples: drawn.map(({ name, title, code, render, state }) => ({
      name,
      title,
      code,
      stateful: Option.isSome(state),
      render,
    })),
    states: drawn.flatMap(({ name, state }) =>
      Option.match(state, {
        onNone: () => [],
        onSome: running => [{ key: exampleKey(about.slug, name), state: running }],
      }),
    ),
  }
}

/** A showcase whose look has no axes to pick from. */
export const fixed = (
  about: About,
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
    code: 'region' as const,
    stateful: false,
    render: (_, live) => drawExample(live),
  })),
  states: [],
})
