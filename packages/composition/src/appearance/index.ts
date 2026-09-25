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
import type { Declarations, MixinFor, NamedStyle, StyleOptions, StylePieces } from 'foldkit-mixins'
import type { HtmlBuilder } from 'foldkit/html'
import { Block, type AnyBlock, type AppearanceAxes, type AppearanceChoice } from '../block.js'

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
 * `var(...)` is drawn. With `breakpoints` (such as `Theme.tokens.breakpoint`,
 * smallest first), a node may choose a name per breakpoint:
 * `{ base: 'sm', md: 'lg' }`.
 */
export interface TokenAxis<Slots> {
  readonly tokens: Readonly<Record<string, string>>
  readonly slot: keyof Slots & string
  readonly property: keyof Declarations & string
  readonly breakpoints?: Readonly<Record<string, string>>
}

type Appearance = Readonly<Record<string, AppearanceChoice>>

export interface Look<Slots> {
  readonly slots: Slots
  /** The choices a node may store, for `Block.withAppearance`. */
  readonly axes: AppearanceAxes
  /** Every compiled piece a selection can attach, for `Style.stylesheet(...look.styles)`. */
  readonly styles: ReadonlyArray<NamedStyle<Slots>>
  /** The pieces a stored selection attaches: base, each chosen value, matching compounds, tokens. */
  readonly select: (appearance: Appearance) => ReadonlyArray<NamedStyle<Slots>>
  /**
   * The Block's Slots, with a node's chosen Style attached, for its view to
   * draw with. `with` attaches more after the look, such as a Behavior's
   * `mixin`; a style property a Behavior owns and a choice also sets is
   * `mixins:style-property-conflict`, not a silent winner.
   */
  readonly draw: <Message>(context: {
    readonly appearance: Appearance
    readonly h: HtmlBuilder<Message>
    readonly with?: ReadonlyArray<MixinFor<Message>>
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
  // A token is one declaration on the caller's slot, which `forSlots` checks exists.
  const onSlot = (token: TokenAxis<Slots>, piece: ReturnType<typeof Style.inline>) =>
    compile({ [token.slot]: piece } as StylePieces<Slots>)
  const tokenBase: Array<NamedStyle<Slots>> = []
  const atBreakpoint = new Map<string, NamedStyle<Slots>>()
  const responsive: Array<NamedStyle<Slots>> = []
  for (const [axis, token] of Object.entries(tokens))
    for (const [name, value] of Object.entries(token.tokens)) {
      const declaration = { [token.property]: value }
      // Responsive, the base is a rule too: an inline value would beat every breakpoint's.
      const style = onSlot(
        token,
        token.breakpoints === undefined ? Style.inline(declaration) : Style.self(declaration),
      )
      byValue.set(key(axis, name), style)
      tokenBase.push(style)
    }
  // Each breakpoint's rules after the base, smallest first, so the widest that matches wins.
  for (const [axis, token] of Object.entries(tokens))
    for (const at of Object.keys(token.breakpoints ?? {}))
      for (const [name, value] of Object.entries(token.tokens)) {
        const style = onSlot(
          token,
          Style.responsive(token.breakpoints ?? {}, { [at]: { [token.property]: value } }),
        )
        atBreakpoint.set(key(`${axis}\u0000${at}`, name), style)
        responsive.push(style)
      }

  const axes: AppearanceAxes = Object.fromEntries([
    ...Object.entries(variants).map(([axis, values]) => [
      axis,
      { kind: 'variant' as const, values: Object.keys(values) },
    ]),
    ...Object.entries(tokens).map(([axis, token]) => [
      axis,
      {
        kind: 'token' as const,
        values: Object.keys(token.tokens),
        ...(token.breakpoints === undefined ? {} : { breakpoints: Object.keys(token.breakpoints) }),
      },
    ]),
  ])

  const select = (appearance: Appearance) => {
    const chosen: Record<string, string> = {}
    const picked: Array<NamedStyle<Slots>> = []
    const pick = (style: NamedStyle<Slots> | undefined) => {
      if (style !== undefined) picked.push(style)
    }
    for (const axis of Object.keys(axes)) {
      const choice = appearance[axis] ?? def?.defaults?.[axis]
      if (typeof choice === 'string') {
        if (!byValue.has(key(axis, choice))) continue
        chosen[axis] = choice
        pick(byValue.get(key(axis, choice)))
      } else if (choice !== undefined)
        for (const [at, name] of Object.entries(choice))
          pick(
            at === 'base'
              ? byValue.get(key(axis, name))
              : atBreakpoint.get(key(`${axis}\u0000${at}`, name)),
          )
    }
    return [
      ...base,
      ...picked,
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
    styles: Object.freeze([
      ...base,
      ...[...byValue.values()].filter(style => !tokenBase.includes(style)),
      ...compounds.map(entry => entry.style),
      ...tokenBase,
      ...responsive,
    ]),
    select,
    draw: <Message>(context: {
      readonly appearance: Appearance
      readonly h: HtmlBuilder<Message>
      readonly with?: ReadonlyArray<MixinFor<Message>>
    }) =>
      SlotView.buildersFor(
        slots,
        [...select(context.appearance).map(style => style.mixin), ...(context.with ?? [])],
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
    at: {
      readonly slot: keyof Slots & string
      readonly property: keyof Declarations & string
      /** Named media queries, smallest first, a choice may change at: `Theme.tokens.breakpoint`. */
      readonly breakpoints?: Readonly<Record<string, string>>
    },
  ): TokenAxis<Slots> => ({ tokens, ...at }),
  /** Pipe step: the Block's appearance axes are the look's. */
  attach:
    <Slots>(look: Look<Slots>) =>
    <B extends AnyBlock>(block: B): B =>
      Block.withAppearance(look.axes)(block),
}
