/**
 * `foldkit-composition/appearance`: a Block's look, as choices within a design
 * system rather than CSS.
 *
 * A look is a `foldkit-mixins` slot recipe, whose variant axes are the choices
 * an author makes (`{ tone: 'accent', space: 'roomy' }`), and token axes,
 * whose choices are the names of a theme's tokens (`{ gap: 'm' }`). The
 * Document stores only the names. Attached to a Block, the look gives the
 * Block its appearance axes, so validating a page and applying `setAppearance`
 * check the names; drawn, it gives the Block's view its Slots with the chosen
 * Style attached.
 *
 * Every piece is compiled once, when the look is made: a selection attaches
 * the pieces it picks side by side, so a page draws no new CSS, and
 * `look.styles` is every rule any selection can use, for `Style.stylesheet`.
 */
import { Style, SlotView } from 'foldkit-mixins'
import type { Declarations, NamedStyle, StyleOptions, StylePieces } from 'foldkit-mixins'
import type { HtmlBuilder } from 'foldkit/html'
import { Block, type AnyBlock, type AppearanceAxes } from '../block.js'

/** The slot recipe shape a look reads: what `Style.recipeFor(Slots)` returns has it. */
interface RecipeLike<Slots> {
  readonly def: {
    readonly base?: StylePieces<Slots>
    readonly variants: Readonly<Record<string, Readonly<Record<string, StylePieces<Slots>>>>>
    readonly defaults?: Readonly<Record<string, string | undefined>>
    readonly compound?: ReadonlyArray<{
      readonly when: Readonly<Record<string, string | undefined>>
      readonly style: StylePieces<Slots>
    }>
  }
}

/**
 * A choice among a theme's tokens, written as one declaration on one slot:
 * `Appearance.token(t.space, { slot: 'root', property: 'gap' })`, where `t` is
 * `Theme.ref(theme)`. The names are the group's keys; a name is stored, its
 * `var(...)` is drawn.
 */
export interface TokenAxis<Slots> {
  readonly tokens: Readonly<Record<string, string>>
  readonly slot: keyof Slots & string
  readonly property: keyof Declarations & string
}

export interface Look<Slots> {
  readonly slots: Slots
  /** The choices a node may store, for `Block.withAppearance`. */
  readonly axes: AppearanceAxes
  /** Every compiled piece a selection can attach, for `Style.stylesheet(...look.styles)`. */
  readonly styles: ReadonlyArray<NamedStyle<Slots>>
  /** The pieces a stored selection attaches: base, each chosen value, matching compounds, tokens. */
  readonly select: (
    appearance: Readonly<Record<string, string>>,
  ) => ReadonlyArray<NamedStyle<Slots>>
  /** The Block's Slots, with a node's chosen Style attached, for its view to draw with. */
  readonly draw: <Message>(context: {
    readonly appearance: Readonly<Record<string, string>>
    readonly h: HtmlBuilder<Message>
  }) => SlotView.SlotBuilders<Slots, Message>
}

const make = <Slots>(
  slots: Slots,
  config: {
    readonly recipe?: RecipeLike<Slots>
    readonly tokens?: Readonly<Record<string, TokenAxis<Slots>>>
    /** Where the rules are compiled, such as `Layers.standard.layer('app')`. */
    readonly layer?: StyleOptions['layer']
  },
): Look<Slots> => {
  const compile = (pieces: StylePieces<Slots>) =>
    Style.forSlots(slots)(pieces, config.layer === undefined ? {} : { layer: config.layer })
  const def = config.recipe?.def
  const variants = def?.variants ?? {}
  const tokens = config.tokens ?? {}
  for (const name of Object.keys(tokens))
    if (Object.hasOwn(variants, name))
      throw new Error(`Appearance.make: "${name}" is both a recipe axis and a token axis`)

  const base = def?.base === undefined ? [] : [compile(def.base)]
  const byValue = new Map<string, NamedStyle<Slots>>()
  const key = (axis: string, value: string) => `${axis}\u0000${value}`
  for (const [axis, values] of Object.entries(variants))
    for (const [value, pieces] of Object.entries(values))
      byValue.set(key(axis, value), compile(pieces))
  const compounds = (def?.compound ?? []).map(entry => ({
    when: entry.when,
    style: compile(entry.style),
  }))
  for (const [axis, token] of Object.entries(tokens))
    for (const [name, value] of Object.entries(token.tokens))
      byValue.set(
        key(axis, name),
        // Keyed by the caller's slot name, which `forSlots` checks exists.
        compile({ [token.slot]: Style.inline({ [token.property]: value }) } as StylePieces<Slots>),
      )

  const axes: AppearanceAxes = Object.fromEntries([
    ...Object.entries(variants).map(([axis, values]) => [
      axis,
      { kind: 'variant' as const, values: Object.keys(values) },
    ]),
    ...Object.entries(tokens).map(([axis, token]) => [
      axis,
      { kind: 'token' as const, values: Object.keys(token.tokens) },
    ]),
  ])

  const select = (appearance: Readonly<Record<string, string>>) => {
    const chosen: Record<string, string> = {}
    for (const axis of Object.keys(axes)) {
      const value = appearance[axis] ?? def?.defaults?.[axis]
      if (value !== undefined && byValue.has(key(axis, value))) chosen[axis] = value
    }
    return [
      ...base,
      ...Object.entries(chosen).flatMap(([axis, value]) => {
        const style = byValue.get(key(axis, value))
        return style === undefined ? [] : [style]
      }),
      ...compounds
        .filter(entry =>
          Object.entries(entry.when).every(([axis, value]) => chosen[axis] === value),
        )
        .map(entry => entry.style),
    ]
  }

  return Object.freeze({
    slots,
    axes,
    styles: Object.freeze([...base, ...byValue.values(), ...compounds.map(entry => entry.style)]),
    select,
    draw: <Message>(context: {
      readonly appearance: Readonly<Record<string, string>>
      readonly h: HtmlBuilder<Message>
    }) =>
      SlotView.buildersFor(
        slots,
        select(context.appearance).map(style => style.mixin),
        { input: undefined, h: context.h },
      ),
  })
}

export const Appearance = {
  /**
   * A look over a Block's Slots: a slot recipe's variant axes, token axes, or
   * both. `layer` places its rules, as `Style.forSlots` does.
   */
  make,
  /** A token axis: the names of `tokens` (a group of `Theme.ref(theme)`) as one declaration on a slot. */
  token: <Slots>(
    tokens: Readonly<Record<string, string>>,
    at: { readonly slot: keyof Slots & string; readonly property: keyof Declarations & string },
  ): TokenAxis<Slots> => ({ tokens, ...at }),
  /** Pipe step: the Block's appearance axes are the look's. */
  attach:
    <Slots>(look: Look<Slots>) =>
    <B extends AnyBlock>(block: B): B =>
      Block.withAppearance(look.axes)(block),
}
