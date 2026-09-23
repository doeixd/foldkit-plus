/**
 * `Style` is pure data: class tokens and inline declarations that compile to a
 * `SlotContribution`. It never touches the DOM and never mutates state.
 * `forSlots` validates piece keys against the published contract at definition
 * time, so a typo fails loudly.
 */
import * as Capability from './capability.js'
import type { InputContribution, SlotContribution, SlotItem } from './contribution.js'
import { DiagnosticError } from './diagnostics.js'
import * as Mixin from './mixin.js'
import type { Mixin as MixinValue } from './mixin.js'
import type { Any as AnySlot, HiddenOf } from './slot.js'
import * as SlotView from './slotView.js'
import * as Rules from './styleRules.js'
import type { StyleRule } from './styleRules.js'

export interface StyleValue {
  readonly classes: ReadonlyArray<string>
  readonly style: Readonly<Record<string, string>>
  /** Input-driven pieces resolved at render time; empty for a static style. */
  readonly conditions?: ReadonlyArray<StyleCondition>
  /** Pieces that depend on which repetition of a slot is rendered. */
  readonly items?: ReadonlyArray<(item: SlotItem | undefined) => StyleValue>
  /** Rule-based appearance compiled to a deterministic class plus CSS. */
  readonly rules?: ReadonlyArray<StyleRule>
  /** Class-independent CSS (keyframes, layers, global rules). */
  readonly globalCss?: ReadonlyArray<string>
}

export interface StyleCondition {
  readonly predicate: (input: unknown) => boolean
  readonly piece: StyleValue
}

/** A hidden slot is internal: it is neither styleable nor behavior-targetable. */
export type StylePieces<Slots> = {
  readonly [K in keyof Slots as HiddenOf<Slots[K]> extends true ? never : K]?: StyleValue
}

export interface NamedStyle<Slots> {
  readonly name?: string
  readonly pieces: StylePieces<Slots>
  readonly mixin: MixinValue<never>
  /** Concatenated rule CSS for every static piece. */
  readonly css: string
  /** Concatenated class-independent CSS (keyframes, layers, global rules). */
  readonly globalCss: string
  /** One entry per generated class, for a deduplicating stylesheet. */
  readonly rules: ReadonlyArray<{ readonly className: string; readonly css: string }>
  /** Class-independent rule chunks, for a deduplicating stylesheet. */
  readonly globalRules: ReadonlyArray<string>
}

const tokens = (value: string): ReadonlyArray<string> =>
  value.split(/\s+/).filter(token => token.length > 0)

export const empty: StyleValue = Object.freeze({
  classes: Object.freeze([]) as ReadonlyArray<string>,
  style: Object.freeze({}) as Readonly<Record<string, string>>,
})

export const classPiece = (value: string): StyleValue =>
  Object.freeze({ classes: Object.freeze(tokens(value)), style: empty.style })

export const inline = (value: Readonly<Record<string, string>>): StyleValue =>
  Object.freeze({ classes: empty.classes, style: Object.freeze({ ...value }) })

/** Concatenate classes; later inline declarations win per property. */
export const compose = (...pieces: ReadonlyArray<StyleValue>): StyleValue => {
  const conditions = pieces.flatMap(piece => piece.conditions ?? [])
  const items = pieces.flatMap(piece => piece.items ?? [])
  const rules = pieces.flatMap(piece => piece.rules ?? [])
  const globalCss = pieces.flatMap(piece => piece.globalCss ?? [])
  return Object.freeze({
    classes: Object.freeze(pieces.flatMap(piece => piece.classes)),
    style: Object.freeze(Object.assign(Object.create(null), ...pieces.map(piece => piece.style))),
    ...(conditions.length === 0 ? {} : { conditions: Object.freeze(conditions) }),
    ...(items.length === 0 ? {} : { items: Object.freeze(items) }),
    ...(rules.length === 0 ? {} : { rules: Object.freeze(rules) }),
    ...(globalCss.length === 0 ? {} : { globalCss: Object.freeze(globalCss) }),
  })
}

/** A pseudo-class/element rule, e.g. `Style.pseudo(':hover', { color: 'red' })`. */
export const pseudo = (
  suffix: string,
  declarations: Readonly<Record<string, string>>,
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.pseudo(suffix, declarations)]),
  })

/** An at-rule, e.g. `Style.media('(min-width: 40rem)', { color: 'red' })`. */
export const media = (query: string, declarations: Readonly<Record<string, string>>): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.media(query, declarations)]),
  })

/** An at-rule, e.g. `Style.supports('(display: grid)', { display: 'grid' })`. */
export const supports = (
  condition: string,
  declarations: Readonly<Record<string, string>>,
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.supports(condition, declarations)]),
  })

/** A container query, e.g. `Style.container('(min-width: 30rem)', {...})`. */
export const container = (
  condition: string,
  declarations: Readonly<Record<string, string>>,
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.container(condition, declarations)]),
  })

/** A nested selector relative to the generated class, e.g. `Style.nest('> span', {...})`. */
export const nest = (
  selector: string,
  declarations: Readonly<Record<string, string>>,
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.nest(selector, declarations)]),
  })

/**
 * A deterministic `@keyframes` block. Compose `style` where the animation is
 * declared and reference `name` in an `animation` declaration.
 */
export const keyframes = (
  frames: Readonly<Record<string, Readonly<Record<string, string>>>>,
): { readonly name: string; readonly style: StyleValue } => {
  const compiled = Rules.keyframes(frames)
  return Object.freeze({
    name: compiled.name,
    style: Object.freeze({
      classes: empty.classes,
      style: empty.style,
      globalCss: Object.freeze([compiled.css]),
    }),
  })
}

/** Raw class-independent CSS (a layer, a global rule). Prefer typed helpers. */
export const global = (css: string): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    globalCss: Object.freeze([css]),
  })

/**
 * Appearance per `data-state` value, e.g. `Style.states({ open: { opacity: '1' } })`
 * compiles to `&[data-state="open"]`. Pairs with Behaviors that write
 * `data-state`, so state is styled with no JavaScript and no `whenInput`:
 * `whenInput` when the view knows, `states` when the DOM does.
 */
export const states = (
  map: Readonly<Record<string, Readonly<Record<string, string>>>>,
  attribute = 'data-state',
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze(
      Object.entries(map).map(([state, declarations]) =>
        Rules.pseudo(`[${attribute}="${state}"]`, declarations),
      ),
    ),
  })

/**
 * Declarations per named breakpoint, e.g.
 * `Style.responsive({ md: '(min-width: 48rem)' }, { md: { display: 'flex' } })`.
 * The breakpoint names come from the record you pass, typically a theme's, so
 * a misspelled one is a type error.
 */
export const responsive = <Breakpoints extends Readonly<Record<string, string>>>(
  breakpoints: Breakpoints,
  map: Partial<Readonly<Record<keyof Breakpoints & string, Readonly<Record<string, string>>>>>,
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze(
      Object.entries(map).flatMap(([name, declarations]) => {
        const query = breakpoints[name]
        return query === undefined || declarations === undefined
          ? []
          : [Rules.media(query, declarations)]
      }),
    ),
  })

/** Custom properties on the slot: `Style.vars({ '--gap': '1rem' })`. */
export const vars = (values: Readonly<Record<`--${string}`, string>>): StyleValue => inline(values)

/**
 * The declarations an element starts from when it enters, as a
 * `@starting-style` rule. With a `transition` on the base, the browser
 * animates from these; pair with `allowDiscrete` when `display` takes part.
 */
export const enter = (declarations: Readonly<Record<string, string>>): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.rule('&', declarations, '@starting-style')]),
  })

/** `transition-behavior: allow-discrete`, so `display` and `overlay` transition too. */
export const allowDiscrete: StyleValue = inline({ transitionBehavior: 'allow-discrete' })

/** Opts the slot into Foldkit's view transitions under `name`. */
export const viewTransitionName = (name: string): StyleValue => inline({ viewTransitionName: name })

/**
 * The cascade layers, in order: a design system's rules come before an
 * application's, and `app` is always last. A closed tuple, so a misspelled
 * layer is a type error rather than a silently unlayered rule.
 */
export const layers = Object.freeze([
  'defaults',
  'components',
  'variants',
  'utilities',
  'app',
] as const)
export type Layer = (typeof layers)[number]

/**
 * The piece's rules emitted inside `@layer name`. Inline declarations and
 * classes are not rules and stay where they are; put what must be layered in
 * `pseudo`, `nest`, or `states`, or use `Style.inLayer(name, Style.nest('&', decl))`.
 */
export const inLayer = (name: Layer, piece: StyleValue): StyleValue =>
  Object.freeze({
    ...piece,
    ...(piece.rules === undefined
      ? {}
      : { rules: Object.freeze(piece.rules.map(rule => ({ ...rule, layer: name }))) }),
  })

/**
 * The stylesheet a page ships with no JavaScript: the layer order declared
 * first, every theme token as a custom property on `:root`, and
 * `color-scheme: light dark` so `Theme.lightDark` tokens resolve. Put its text
 * before `Style.stylesheet(...)`.
 */
export const foundation = (
  theme: Readonly<Record<string, Readonly<Record<string, string>>>>,
  options?: { readonly colorScheme?: 'light dark' | 'light' | 'dark' },
): string => {
  const declarations = Object.entries(theme)
    .flatMap(([group, names]) =>
      Object.entries(names).map(([name, value]) =>
        Rules.variableDeclaration('--fk', group, name, value),
      ),
    )
    .join(';')
  const scheme = options?.colorScheme ?? 'light dark'
  return `@layer ${layers.join(', ')};:root{${declarations}${declarations === '' ? '' : ';'}color-scheme:${scheme}}`
}

/** A boolean known at authoring time. */
export const when = (condition: boolean, piece: StyleValue): StyleValue =>
  condition ? piece : empty

/** A condition read from the view input at render time. The piece applies when
 *  `predicate` returns true for the input the view was rendered with. */
export const whenInput = <Input>(
  predicate: (input: Input) => boolean,
  piece: StyleValue,
): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    conditions: Object.freeze([
      { predicate: (input: unknown) => predicate(input as Input), piece },
    ]),
  })

/**
 * A piece computed from the item the slot is rendered for, when the view
 * passes one to `attrs(base, item)`; nothing for a slot rendered once.
 */
export const perItem = (piece: (item: SlotItem) => StyleValue): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    items: Object.freeze([
      (item: SlotItem | undefined) => (item === undefined ? empty : piece(item)),
    ]),
  })

/**
 * A per-item delay for an entrance: writes `--fk-index` and
 * `transition-delay: calc(var(--fk-index) * <step>)` (or `animation-delay`),
 * so a list staggers with no timer. Pass the item to `attrs` for each row.
 */
export const stagger = (options: {
  readonly stepMs: number
  readonly property?: 'transitionDelay' | 'animationDelay'
}): StyleValue =>
  perItem(item =>
    inline({
      '--fk-index': String(item.index),
      [options.property ?? 'transitionDelay']: `calc(var(--fk-index) * ${options.stepMs}ms)`,
    }),
  )

/** Fold every active condition and item piece (recursively) into a plain style. */
const resolveStyle = (style: StyleValue, input: unknown, item?: SlotItem): StyleValue => {
  const active = [
    ...(style.conditions ?? [])
      .filter(condition => condition.predicate(input))
      .map(condition => condition.piece),
    ...(style.items ?? []).map(piece => piece(item)),
  ].map(piece => resolveStyle(piece, input, item))
  return Object.freeze({
    classes: Object.freeze([...style.classes, ...active.flatMap(piece => piece.classes)]),
    style: Object.freeze(
      Object.assign(Object.create(null), style.style, ...active.map(piece => piece.style)),
    ),
  })
}

interface CompiledStyle {
  readonly classes: ReadonlyArray<string>
  readonly style: Readonly<Record<string, string>>
  readonly css?: string
  readonly ruleClass?: string
  readonly globalRules?: ReadonlyArray<string>
  /** Every class the tree compiled to, with its CSS, static or conditional. */
  readonly compiled: ReadonlyArray<{ readonly className: string; readonly css: string }>
}

/** Global CSS is emitted whether or not its condition is active. */
const collectGlobalCss = (style: StyleValue): ReadonlyArray<string> => [
  ...(style.globalCss ?? []),
  ...(style.conditions ?? []).flatMap(condition => collectGlobalCss(condition.piece)),
]

/**
 * Compiles every rule-bearing node in the tree to its class: the node's
 * classes gain the generated one, and the CSS is collected. A conditional
 * piece's rules are compiled the same way, so the class is static and only
 * its presence follows the input.
 */
const compileTree = (
  style: StyleValue,
  collected: Array<{ readonly className: string; readonly css: string }>,
): StyleValue => {
  const rules = style.rules ?? []
  const generated = rules.length === 0 ? undefined : Rules.className(rules)
  if (generated !== undefined)
    collected.push({ className: generated, css: Rules.css(generated, rules) })
  const conditions = (style.conditions ?? []).map(condition => ({
    predicate: condition.predicate,
    piece: compileTree(condition.piece, collected),
  }))
  return Object.freeze({
    ...style,
    classes: generated === undefined ? style.classes : Object.freeze([...style.classes, generated]),
    ...(conditions.length === 0 ? {} : { conditions: Object.freeze(conditions) }),
  })
}

/** A style with every rule in it compiled: the tree with classes, plus the CSS. */
const compileStyle = (style: StyleValue): CompiledStyle & { readonly tree: StyleValue } => {
  const collected: Array<{ readonly className: string; readonly css: string }> = []
  const tree = compileTree(style, collected)
  const globalRules = collectGlobalCss(style)
  const first = collected[0]
  return {
    tree,
    classes: tree.classes,
    style: tree.style,
    ...(first === undefined
      ? {}
      : { css: collected.map(entry => entry.css).join(''), ruleClass: first.className }),
    ...(globalRules.length === 0 ? {} : { globalRules }),
    compiled: collected,
  }
}

/**
 * A static style stays static data; a style with input conditions compiles to a
 * message-free `InputContribution`, so it still attaches to any view.
 */
const contributionFrom = (
  style: StyleValue,
  compiled: CompiledStyle & { readonly tree: StyleValue },
): SlotContribution<never> => {
  const globalCss = compiled.globalRules?.join('')
  const attributes = {
    classes: compiled.classes,
    style: compiled.style,
    ...(compiled.css === undefined ? {} : { css: compiled.css }),
    ...(globalCss === undefined ? {} : { globalCss }),
  }
  if ((style.conditions ?? []).length === 0 && (style.items ?? []).length === 0) {
    return Object.freeze(attributes)
  }
  const contribution: InputContribution<never> = context => {
    const resolved = resolveStyle(compiled.tree, context.input, context.item)
    return Object.freeze({
      classes: resolved.classes,
      style: resolved.style,
      ...(compiled.css === undefined ? {} : { css: compiled.css }),
      ...(globalCss === undefined ? {} : { globalCss }),
    })
  }
  return contribution
}

export const forSlots =
  <Slots>(slots: Slots) =>
  (pieces: StylePieces<Slots>, options?: { readonly name?: string }): NamedStyle<Slots> => {
    const known = slots as unknown as Record<string, unknown>
    const contributions: Record<string, SlotContribution<never>> = Object.create(null)
    const rules: Array<{ className: string; css: string }> = []
    const globalRules: Array<string> = []
    let css = ''
    let globalCss = ''
    for (const [key, piece] of Object.entries(pieces as Record<string, StyleValue | undefined>)) {
      if (!Object.hasOwn(known, key)) {
        throw new DiagnosticError({
          source: 'mixins',
          code: 'mixins:unknown-slot',
          severity: 'error',
          message: `Style targets unknown slot "${key}"`,
          slot: key,
        })
      }
      if ((known[key] as { readonly hidden?: boolean } | undefined)?.hidden === true) {
        throw new DiagnosticError({
          source: 'mixins',
          code: 'mixins:hidden-slot',
          severity: 'error',
          message: `Style targets hidden slot "${key}"`,
          slot: key,
        })
      }
      if (piece !== undefined) {
        // Rule and global CSS are static even when the contribution is deferred,
        // so compile once, then build the contribution and gather the CSS.
        const compiled = compileStyle(piece)
        contributions[key] = contributionFrom(piece, compiled)
        for (const entry of compiled.compiled) {
          rules.push(entry)
          css += entry.css
        }
        if (compiled.globalRules !== undefined) {
          globalRules.push(...compiled.globalRules)
          globalCss += compiled.globalRules.join('')
        }
      }
    }
    return Object.freeze({
      ...(options?.name === undefined ? {} : { name: options.name }),
      pieces,
      mixin: Mixin.dynamic<never>(options?.name ?? 'Style', contributions),
      css,
      globalCss,
      rules: Object.freeze(rules),
      globalRules: Object.freeze(globalRules),
    })
  }

/** Deduplicated global then scoped CSS for one `<style>` block, first seen wins. */
export const stylesheet = (
  ...styles: ReadonlyArray<{
    readonly rules: ReadonlyArray<{ readonly className: string; readonly css: string }>
    readonly globalRules: ReadonlyArray<string>
  }>
): string => {
  const scoped = new Map<string, string>()
  const global = new Set<string>()
  for (const style of styles) {
    for (const rule of style.rules) {
      if (!scoped.has(rule.className)) scoped.set(rule.className, rule.css)
    }
    for (const rule of style.globalRules) global.add(rule)
  }
  return [...global, ...scoped.values()].join('')
}

export const attach =
  <Slots>(style: NamedStyle<Slots>) =>
  <ViewSlots, Input, Message>(
    view: SlotView.SlotView<ViewSlots, Input, Message>,
  ): SlotView.SlotView<ViewSlots, Input, Message> =>
    SlotView.attach(style.mixin)(view)

export type RecipeVariantDef = Readonly<Record<string, StyleValue>>

/** A combination style applied when every `when` entry matches the selection. */
export interface RecipeCompound<Variants extends Readonly<Record<string, RecipeVariantDef>>> {
  readonly when: Partial<{ readonly [K in keyof Variants]: keyof Variants[K] & string }>
  readonly style: StyleValue
}

export interface RecipeDef<Variants extends Readonly<Record<string, RecipeVariantDef>>> {
  readonly base?: StyleValue
  readonly variants: Variants
  readonly defaults?: { readonly [K in keyof Variants]?: keyof Variants[K] & string }
  readonly compound?: ReadonlyArray<RecipeCompound<Variants>>
}

export type AnyRecipeDef = RecipeDef<Record<string, RecipeVariantDef>>

export type RecipeSelection<D extends AnyRecipeDef> = {
  readonly [K in keyof D['variants']]?: keyof D['variants'][K] & string
}

/** A recipe is just Style data: base, one piece per selected variant, then any
 *  matching compound. `compound.when` is keyed by the recipe's variants, so a
 *  typo is a compile error rather than a silently dead combination. */
export const recipe =
  <Variants extends Readonly<Record<string, RecipeVariantDef>>>(def: RecipeDef<Variants>) =>
  (selection: RecipeSelection<RecipeDef<Variants>>): StyleValue => {
    const pieces: Array<StyleValue> = []
    if (def.base !== undefined) pieces.push(def.base)
    const effective: Record<string, string> = {}
    for (const [variant, values] of Object.entries(def.variants)) {
      const chosen =
        (selection as Record<string, string | undefined>)[variant] ??
        (def.defaults as Record<string, string | undefined> | undefined)?.[variant]
      if (chosen === undefined) continue
      effective[variant] = chosen
      const piece = (values as Record<string, StyleValue>)[chosen]
      if (piece !== undefined) pieces.push(piece)
    }
    for (const compound of def.compound ?? []) {
      if (Object.entries(compound.when).every(([variant, value]) => effective[variant] === value)) {
        pieces.push(compound.style)
      }
    }
    return compose(...pieces)
  }

export type SlotRecipeVariants<Slots> = Readonly<
  Record<string, Readonly<Record<string, StylePieces<Slots>>>>
>

export interface SlotRecipeDef<Slots, Variants extends SlotRecipeVariants<Slots>> {
  readonly base?: StylePieces<Slots>
  readonly variants: Variants
  readonly defaults?: { readonly [K in keyof Variants]?: keyof Variants[K] & string }
  readonly compound?: ReadonlyArray<{
    readonly when: Partial<{ readonly [K in keyof Variants]: keyof Variants[K] & string }>
    readonly style: StylePieces<Slots>
  }>
}

/** A selection; `null` unsets an axis that has a default. */
export type SlotRecipeSelection<Variants> = {
  readonly [K in keyof Variants]?: (keyof Variants[K] & string) | null
}

export interface SlotRecipePatch<Slots, Variants extends SlotRecipeVariants<Slots>> {
  readonly base?: StylePieces<Slots>
  readonly variants?: {
    readonly [K in keyof Variants]?: { readonly [V in keyof Variants[K]]?: StylePieces<Slots> }
  }
  readonly defaults?: SlotRecipeDef<Slots, Variants>['defaults']
  readonly compound?: SlotRecipeDef<Slots, Variants>['compound']
}

export interface SlotRecipe<Slots, Variants extends SlotRecipeVariants<Slots>> {
  (selection?: SlotRecipeSelection<Variants>): StylePieces<Slots>
  readonly def: SlotRecipeDef<Slots, Variants>
  /**
   * The same recipe with `patch` merged in: base pieces compose per slot, a
   * variant's pieces compose over the base recipe's, compounds append,
   * defaults override. A slot the contract lacks is refused at once.
   */
  readonly extend: (patch: SlotRecipePatch<Slots, Variants>) => SlotRecipe<Slots, Variants>
}

const mergePieces = <Slots>(
  left: StylePieces<Slots> | undefined,
  right: StylePieces<Slots> | undefined,
): StylePieces<Slots> => {
  const merged: Record<string, StyleValue> = {}
  for (const source of [left, right]) {
    for (const [slot, piece] of Object.entries((source ?? {}) as Record<string, StyleValue>)) {
      const existing = merged[slot]
      merged[slot] = existing === undefined ? piece : compose(existing, piece)
    }
  }
  return merged as StylePieces<Slots>
}

const assertKnownSlots = <Slots>(
  slots: Slots,
  pieces: StylePieces<Slots> | undefined,
  where: string,
): void => {
  const known = slots as unknown as Record<string, unknown>
  for (const slot of Object.keys((pieces ?? {}) as Record<string, unknown>)) {
    if (!Object.hasOwn(known, slot)) {
      throw new DiagnosticError({
        source: 'mixins',
        code: 'mixins:unknown-slot',
        severity: 'error',
        message: `Recipe ${where} targets unknown slot "${slot}"`,
        slot,
      })
    }
  }
}

/**
 * A recipe over every slot of a contract: `base` pieces per slot, `variants`
 * per axis and value, `defaults`, and `compound` matches. The result of a
 * selection is a `StylePieces` for `Style.forSlots`. A design system ships
 * the recipe; an application adjusts it with `extend` instead of forking.
 */
export const recipeFor =
  <Slots>(slots: Slots) =>
  <Variants extends SlotRecipeVariants<Slots>>(
    def: SlotRecipeDef<Slots, Variants>,
  ): SlotRecipe<Slots, Variants> => {
    assertKnownSlots(slots, def.base, 'base')
    for (const [axis, values] of Object.entries(def.variants)) {
      for (const [value, pieces] of Object.entries(values)) {
        assertKnownSlots(slots, pieces as StylePieces<Slots>, `variants.${axis}.${value}`)
      }
    }
    for (const entry of def.compound ?? []) assertKnownSlots(slots, entry.style, 'compound')
    const select = (selection: SlotRecipeSelection<Variants> = {}): StylePieces<Slots> => {
      let pieces = def.base ?? ({} as StylePieces<Slots>)
      const effective: Record<string, string> = {}
      for (const [axis, values] of Object.entries(def.variants)) {
        const picked = (selection as Record<string, string | null | undefined>)[axis]
        const chosen =
          picked === null
            ? undefined
            : (picked ?? (def.defaults as Record<string, string | undefined> | undefined)?.[axis])
        if (chosen === undefined) continue
        effective[axis] = chosen
        const piece = (values as Record<string, StylePieces<Slots>>)[chosen]
        if (piece !== undefined) pieces = mergePieces(pieces, piece)
      }
      for (const entry of def.compound ?? []) {
        if (Object.entries(entry.when).every(([axis, value]) => effective[axis] === value)) {
          pieces = mergePieces(pieces, entry.style)
        }
      }
      return pieces
    }
    const extend = (patch: SlotRecipePatch<Slots, Variants>): SlotRecipe<Slots, Variants> => {
      const variants: Record<string, Record<string, StylePieces<Slots>>> = {}
      for (const [axis, values] of Object.entries(def.variants)) {
        variants[axis] = { ...(values as Record<string, StylePieces<Slots>>) }
      }
      for (const [axis, values] of Object.entries(patch.variants ?? {})) {
        const target = variants[axis] ?? {}
        for (const [value, pieces] of Object.entries(
          (values ?? {}) as Record<string, StylePieces<Slots>>,
        )) {
          target[value] = mergePieces(target[value], pieces)
        }
        variants[axis] = target
      }
      return recipeFor(slots)({
        base: mergePieces(def.base, patch.base),
        variants: variants as unknown as Variants,
        defaults: { ...def.defaults, ...patch.defaults } as NonNullable<
          SlotRecipeDef<Slots, Variants>['defaults']
        >,
        compound: [...(def.compound ?? []), ...(patch.compound ?? [])],
      })
    }
    return Object.assign(select, { def, extend })
  }

/**
 * One piece for every public slot whose capability satisfies `capability`:
 * a focus ring for every `Focusable`, a disabled treatment for every
 * `Interactive`, in one line.
 */
export const forCapability =
  <Slots>(slots: Slots) =>
  (
    capability: string | Capability.Any,
    piece: StyleValue,
    options?: { readonly name?: string },
  ): NamedStyle<Slots> => {
    const source = slots as unknown as Record<string, AnySlot>
    const pieces: Record<string, StyleValue> = {}
    for (const [name, slot] of Object.entries(source)) {
      if (slot.hidden) continue
      if (Capability.extendsCapability(slot.capability, capability)) pieces[name] = piece
    }
    return forSlots(slots)(pieces as StylePieces<Slots>, options)
  }

export const Style = {
  class: classPiece,
  inline,
  compose,
  when,
  whenInput,
  pseudo,
  media,
  supports,
  container,
  nest,
  states,
  responsive,
  vars,
  enter,
  allowDiscrete,
  viewTransitionName,
  keyframes,
  global,
  empty,
  perItem,
  stagger,
  layers,
  inLayer,
  foundation,
  forSlots,
  forCapability,
  attach,
  recipe,
  recipeFor,
  stylesheet,
} as const
