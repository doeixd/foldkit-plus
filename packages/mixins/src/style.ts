/**
 * `Style` is pure data: class tokens and inline declarations that compile to a
 * `SlotContribution`. It never touches the DOM and never mutates state.
 * `forSlots` validates piece keys against the published contract at definition
 * time, so a typo fails loudly. The builders themselves live in
 * `styleValue.ts`; this module joins them to slots.
 */
import * as Capability from './capability.js'
import type { InputContribution, SlotContribution } from './contribution.js'
import { DiagnosticError } from './diagnostics.js'
import * as Mixin from './mixin.js'
import type { Mixin as MixinValue } from './mixin.js'
import type { Any as AnySlot, HiddenOf } from './slot.js'
import type { SlotItem } from './slotItem.js'
import * as SlotView from './slotView.js'
import * as Rules from './styleRules.js'
import {
  allowDiscrete,
  classPiece,
  compose,
  container,
  empty,
  enter,
  global,
  grid,
  inline,
  keyframes,
  media,
  nest,
  pseudo,
  responsive,
  self,
  states,
  supports,
  vars,
  viewTransitionName,
  type StyleValue,
} from './styleValue.js'

export type { StyleCondition, StyleValue } from './styleValue.js'

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

export interface StylesheetSource {
  readonly rules: ReadonlyArray<{ readonly className: string; readonly css: string }>
  readonly globalRules: ReadonlyArray<string>
}

const isStylesheetSource = (value: StyleValue | StylesheetSource): value is StylesheetSource =>
  'globalRules' in value

const LAYER_STATEMENT = /^@layer [^{}]+;$/

const sourceOf = (style: StyleValue): StylesheetSource => {
  const compiled = compileStyle(style)
  return { rules: compiled.compiled, globalRules: compiled.globalRules ?? [] }
}

/**
 * One `<style>` block: the `@layer …;` statement first (one order per
 * sheet), then the other global chunks, then the scoped classes, each
 * deduplicated with the first seen winning. A bare `StyleValue` (a theme
 * root, a layered reset, a layout) compiles like a piece of a `NamedStyle`.
 */
export const stylesheet = (...styles: ReadonlyArray<StyleValue | StylesheetSource>): string => {
  const scoped = new Map<string, string>()
  const global = new Set<string>()
  let order: string | undefined
  for (const style of styles) {
    const source = isStylesheetSource(style) ? style : sourceOf(style)
    for (const rule of source.rules) {
      if (!scoped.has(rule.className)) scoped.set(rule.className, rule.css)
    }
    for (const rule of source.globalRules) {
      if (!LAYER_STATEMENT.test(rule)) {
        global.add(rule)
      } else if (order === undefined) {
        order = rule
      } else if (order !== rule) {
        throw new DiagnosticError({
          source: 'style',
          code: 'style:conflicting-layer-order',
          severity: 'error',
          message: `Style.stylesheet was given two layer orders: "${order}" and "${rule}"`,
        })
      }
    }
  }
  return [...(order === undefined ? [] : [order]), ...global, ...scoped.values()].join('')
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
  self,
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
  grid,
  keyframes,
  global,
  empty,
  perItem,
  stagger,
  forSlots,
  forCapability,
  attach,
  recipe,
  recipeFor,
  stylesheet,
} as const
