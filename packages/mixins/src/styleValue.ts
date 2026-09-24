/**
 * The Style kernel: `StyleValue` and the pure builders that make one. A
 * value is class tokens, inline declarations, rule pieces that compile to a
 * deterministic class, and class-independent CSS. Nothing here knows what a
 * slot is; `style.ts` joins this to slots, and the `/theme`, `/layers`,
 * `/layout`, `/defaults`, and `/prose` subpaths build on it alone.
 */
import { DiagnosticError } from './diagnostics.js'
import type { SlotItem } from './slotItem.js'
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

/**
 * Declarations on the element itself, as a rule on its generated class
 * (`&{…}`) rather than inline, so `Layers.in` can place them in a layer and a
 * later layer can override them. Inline declarations sit outside every layer.
 */
export const self = (declarations: Readonly<Record<string, string>>): StyleValue =>
  Object.freeze({
    classes: empty.classes,
    style: empty.style,
    rules: Object.freeze([Rules.rule('&', declarations)]),
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
    style: inline({
      display: 'grid',
      gridTemplateAreas: config.areas.map(row => `"${row.join(' ')}"`).join(' '),
      ...(config.columns === undefined ? {} : { gridTemplateColumns: config.columns }),
      ...(config.rows === undefined ? {} : { gridTemplateRows: config.rows }),
      ...(config.gap === undefined ? {} : { gap: config.gap }),
    }),
    area: (name: Exclude<Area, '.'>) => inline({ gridArea: name }),
    areas: Object.freeze(names),
  })
}

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
