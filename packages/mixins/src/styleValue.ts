/**
 * The Style kernel: `StyleValue` and the pure builders that make one. A
 * value is class tokens, inline declarations, rule pieces that compile to a
 * deterministic class, and class-independent CSS. Nothing here knows what a
 * slot is; `style.ts` joins this to slots, and the `/theme`, `/layers`,
 * `/layout`, `/defaults`, and `/prose` subpaths build on it alone.
 */
import type { Properties } from 'csstype'
import { DiagnosticError } from './diagnostics.js'
import type { SlotItem } from './slotItem.js'
import * as Rules from './styleRules.js'
import type { StyleRule } from './styleRules.js'

/**
 * The declarations a piece accepts: camelCase CSS properties, each a string,
 * plus custom properties. A misspelled or kebab-case property is a type error;
 * the compiler writes the kebab-case name. Values stay strings, so `var(...)`,
 * `calc(...)`, and `light-dark(...)` pass through.
 */
export type Declarations = { readonly [K in keyof Properties]?: string } & {
  readonly [K: `--${string}`]: string
}

/** Marks a `StyleValue`, so a piece is told from a declarations object without guessing. */
export const StyleValueTypeId: unique symbol = Symbol.for('foldkit-mixins/StyleValue')

export interface StyleValue {
  readonly [StyleValueTypeId]: true
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

const tokens = (value: string): ReadonlyArray<string> =>
  value.split(/\s+/).filter(token => token.length > 0)

const noClasses: ReadonlyArray<string> = Object.freeze([])
const noStyle: Readonly<Record<string, string>> = Object.freeze({})

/** A frozen `StyleValue` from its parts; absent classes and style are empty. */
export const make = (parts: Partial<Omit<StyleValue, typeof StyleValueTypeId>>): StyleValue => {
  const value: StyleValue = {
    [StyleValueTypeId]: true,
    ...parts,
    classes: parts.classes ?? noClasses,
    style: parts.style ?? noStyle,
  }
  return Object.freeze(value)
}

export const isStyleValue = (value: unknown): value is StyleValue =>
  typeof value === 'object' && value !== null && Object.hasOwn(value, StyleValueTypeId)

export const empty: StyleValue = make({})

/**
 * A piece as written: a `StyleValue`; a declarations object, which means
 * `Style.self(declarations)`; or pieces composed in order.
 */
export type Piece =
  | StyleValue
  // Without `classes`, so an object shaped like a StyleValue is not taken for declarations.
  | (Declarations & { readonly classes?: never })
  | ReadonlyArray<Piece>

const isPieceList = (value: Piece): value is ReadonlyArray<Piece> => Array.isArray(value)

/** The `StyleValue` a written piece stands for. */
export const toStyleValue = (value: Piece): StyleValue => {
  if (isStyleValue(value)) return value
  if (isPieceList(value)) return compose(...value)
  return Object.keys(value).length === 0 ? empty : self(value)
}

export const classPiece = (value: string): StyleValue =>
  make({ classes: Object.freeze(tokens(value)) })

export const inline = (value: Declarations): StyleValue =>
  make({ style: Object.freeze({ ...value }) })

/** Concatenate classes; later inline declarations win per property. */
export const compose = (...written: ReadonlyArray<Piece>): StyleValue => {
  const pieces = written.map(toStyleValue)
  const conditions = pieces.flatMap(piece => piece.conditions ?? [])
  const items = pieces.flatMap(piece => piece.items ?? [])
  const rules = pieces.flatMap(piece => piece.rules ?? [])
  const globalCss = pieces.flatMap(piece => piece.globalCss ?? [])
  return make({
    classes: Object.freeze(pieces.flatMap(piece => piece.classes)),
    style: Object.freeze(Object.assign(Object.create(null), ...pieces.map(piece => piece.style))),
    ...(conditions.length === 0 ? {} : { conditions: Object.freeze(conditions) }),
    ...(items.length === 0 ? {} : { items: Object.freeze(items) }),
    ...(rules.length === 0 ? {} : { rules: Object.freeze(rules) }),
    ...(globalCss.length === 0 ? {} : { globalCss: Object.freeze(globalCss) }),
  })
}

/** A pseudo-class/element rule, e.g. `Style.pseudo(':hover', { color: 'red' })`. */
export const pseudo = (suffix: string, declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.pseudo(suffix, declarations)]),
  })

/**
 * Declarations on the element itself, as a rule on its generated class
 * (`&{…}`) rather than inline, so `Layers.in` can place them in a layer and a
 * later layer can override them. Inline declarations sit outside every layer.
 */
export const self = (declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.rule('&', declarations)]),
  })

/** An at-rule, e.g. `Style.media('(min-width: 40rem)', { color: 'red' })`. */
export const media = (query: string, declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.media(query, declarations)]),
  })

/** An at-rule, e.g. `Style.supports('(display: grid)', { display: 'grid' })`. */
export const supports = (condition: string, declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.supports(condition, declarations)]),
  })

/** A container query, e.g. `Style.container('(min-width: 30rem)', {...})`. */
export const container = (condition: string, declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.container(condition, declarations)]),
  })

/**
 * A piece's rules inside an at-rule, where one constructor alone cannot put
 * them: `Style.at('@container builder (max-width: 40rem)',
 * Style.pseudo('[data-open="false"]', { display: 'none' }))`. Its inline
 * declarations become a rule on the element. A class, a condition, a
 * per-item piece, global CSS or a rule already inside an at-rule cannot be
 * put inside one, and throws here.
 */
export const at = (prelude: string, piece: StyleValue): StyleValue => {
  const refuse = (what: string): never => {
    throw new Error(`Style.at: ${what} cannot go inside "${prelude}"`)
  }
  if (!prelude.startsWith('@')) refuse('anything but an at-rule prelude')
  if (piece.classes.length > 0) refuse('a class')
  if ((piece.conditions ?? []).length > 0 || (piece.items ?? []).length > 0)
    refuse('a piece chosen when drawn')
  if ((piece.globalCss ?? []).length > 0) refuse('global CSS')
  const own = Object.keys(piece.style).length === 0 ? [] : [Rules.rule('&', piece.style)]
  return make({
    rules: Object.freeze(
      [...own, ...(piece.rules ?? [])].map(rule =>
        rule.at === undefined
          ? Object.freeze({ ...rule, at: prelude })
          : refuse(`a rule inside "${rule.at}"`),
      ),
    ),
  })
}

/** A nested selector relative to the generated class, e.g. `Style.nest('> span', {...})`. */
export const nest = (selector: string, declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.nest(selector, declarations)]),
  })

/**
 * A deterministic `@keyframes` block. Compose `style` where the animation is
 * declared and reference `name` in an `animation` declaration.
 */
export const keyframes = (
  frames: Readonly<Record<string, Declarations>>,
): { readonly name: string; readonly style: StyleValue } => {
  const compiled = Rules.keyframes(frames)
  return Object.freeze({
    name: compiled.name,
    style: make({
      globalCss: Object.freeze([compiled.css]),
    }),
  })
}

/** Raw class-independent CSS (a layer, a global rule). Prefer typed helpers. */
export const global = (css: string): StyleValue =>
  make({
    globalCss: Object.freeze([css]),
  })

/**
 * Appearance per `data-state` value, e.g. `Style.states({ open: { opacity: '1' } })`
 * compiles to `&[data-state="open"]`. Pairs with Behaviors that write
 * `data-state`, so state is styled with no JavaScript and no `whenInput`:
 * `whenInput` when the view knows, `states` when the DOM does.
 */
export const states = (
  map: Readonly<Record<string, Declarations>>,
  attribute = 'data-state',
): StyleValue =>
  make({
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
 * a misspelled one is a type error. A breakpoint is a media query, or a whole
 * at-rule: `'@container page (min-width: 48rem)'` measures the container named
 * `page` rather than the window (`Theme.inContainer` writes these).
 */
export const responsive = <Breakpoints extends Readonly<Record<string, string>>>(
  breakpoints: Breakpoints,
  map: Partial<Readonly<Record<keyof Breakpoints & string, Declarations>>>,
): StyleValue =>
  make({
    rules: Object.freeze(
      Object.entries(map).flatMap(([name, declarations]) => {
        const query = breakpoints[name]
        if (query === undefined || declarations === undefined) return []
        return [
          query.startsWith('@')
            ? Rules.rule('&', declarations, query)
            : Rules.media(query, declarations),
        ]
      }),
    ),
  })

/** Custom properties on the slot: `Style.vars({ '--gap': '1rem' })`. */
export const vars = (values: Readonly<Record<`--${string}`, string>>): StyleValue => inline(values)

export interface GridConfig<Area extends string> {
  /** Rows of area names; `'.'` is an empty cell. Every row has the same length. */
  readonly areas: ReadonlyArray<ReadonlyArray<Area>>
  readonly columns?: string
  readonly rows?: string
  readonly gap?: string
}

export interface Grid<Area extends string> {
  /** The container's declarations: `display: grid` and the template. */
  readonly style: StyleValue
  /** A child's `grid-area`; only the names the template declares are accepted. */
  readonly area: (name: Area) => StyleValue
  /** The declared names, in first-appearance order. */
  readonly areas: ReadonlyArray<Area>
}

/**
 * A grid template with typed areas, so a child cannot name an area the
 * parent lacks: `const Page = Style.grid({ areas: [['header', 'header'],
 * ['nav', 'main']] })`, then `Page.area('main')` on the child and
 * `Page.area('footer')` is a type error. A ragged template raises
 * `mixins:ragged-grid-areas`.
 */
export const grid = <const Area extends string>(
  config: GridConfig<Area>,
): Grid<Exclude<Area, '.'>> => {
  const width = config.areas[0]?.length ?? 0
  if (config.areas.some(row => row.length !== width)) {
    throw new DiagnosticError({
      source: 'mixins',
      code: 'mixins:ragged-grid-areas',
      severity: 'error',
      message: `Style.grid areas must be rectangular; rows have lengths ${config.areas.map(row => row.length).join(', ')}`,
    })
  }
  const names: Array<Exclude<Area, '.'>> = []
  for (const row of config.areas) {
    for (const cell of row) {
      if (cell !== '.' && !names.includes(cell as Exclude<Area, '.'>)) {
        names.push(cell as Exclude<Area, '.'>)
      }
    }
  }
  return Object.freeze({
    // Rules, not inline declarations, so a later layer can override the template.
    style: self({
      display: 'grid',
      gridTemplateAreas: config.areas.map(row => `"${row.join(' ')}"`).join(' '),
      ...(config.columns === undefined ? {} : { gridTemplateColumns: config.columns }),
      ...(config.rows === undefined ? {} : { gridTemplateRows: config.rows }),
      ...(config.gap === undefined ? {} : { gap: config.gap }),
    }),
    area: (name: Exclude<Area, '.'>) => self({ gridArea: name }),
    areas: Object.freeze(names),
  })
}

/**
 * The declarations an element starts from when it enters, as a
 * `@starting-style` rule. With a `transition` on the base, the browser
 * animates from these; pair with `allowDiscrete` when `display` takes part.
 */
export const enter = (declarations: Declarations): StyleValue =>
  make({
    rules: Object.freeze([Rules.rule('&', declarations, '@starting-style')]),
  })

/** `transition-behavior: allow-discrete`, so `display` and `overlay` transition too. */
export const allowDiscrete: StyleValue = inline({ transitionBehavior: 'allow-discrete' })

/** Opts the slot into Foldkit's view transitions under `name`. */
export const viewTransitionName = (name: string): StyleValue => inline({ viewTransitionName: name })
