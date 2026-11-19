/**
 * What a component's page is made of: the variant axes, the state a preview
 * controls, and the showcase itself. Nothing here draws.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { RunningState } from './example.js'
import * as Widgets from './widgets.js'

/**
 * What another axis must be for an axis to change anything: `values` of `axis`.
 * Outside them the control stays drawn, disabled, with `hint` beside it.
 */
export interface Need {
  readonly axis: string
  readonly values: ReadonlyArray<string>
  readonly hint: string
}

/** One variant axis of a recipe, and the value it takes when none is picked. */
export interface Axis {
  readonly name: string
  readonly values: ReadonlyArray<string>
  readonly initial: string
  readonly needs?: Need
}

/** What the reader picked, by axis name. */
export type Selection = Readonly<Record<string, string>>

/** The state a preview controls, held in the page's Model, and the Messages that change it. */
export interface Live<Message> {
  readonly switched: boolean
  readonly onSwitch: (on: boolean) => Message
  /** The reader's direction, for views that place or key off it. */
  readonly direction: 'ltr' | 'rtl'
  readonly widgets: Widgets.Model
  readonly onWidget: (message: Widgets.Message) => Message
  /** The state of every example that is a module of its own, by key (`examplesState.ts`). */
  readonly examples: Readonly<Record<string, unknown>>
  readonly onExample: (key: string, message: unknown) => Message
  /** Whether the browser's code has taken the page over: what a server could not draw waits for it. */
  readonly ready: boolean
  readonly h: HtmlBuilder<Message>
}

export interface Showcase {
  readonly slug: string
  readonly title: string
  readonly summary: string
  /** The recipe's name under `Recipes`, its file under `packages/mixins-ui/src/recipes`, and its slot contract's name. */
  readonly recipe: string
  readonly file: string
  readonly contract: string
  readonly axes: ReadonlyArray<Axis>
  readonly preview: <Message>(selection: Selection, live: Live<Message>) => Html
  /**
   * Named examples drawn with the picked style, each with its own snippet
   * region (`${slug}-${name}`) and a link to it (`#${name}`); empty until the
   * showcase is migrated, while the page shows one preview and one snippet.
   */
  readonly examples: ReadonlyArray<ShowcaseExample>
  /** The state of each example that declared one, for the gallery's Model. */
  readonly states: ReadonlyArray<{ readonly key: string; readonly state: RunningState }>
}

/** One named example of a showcase, drawn with the picked style. */
export interface ShowcaseExample {
  readonly name: string
  readonly title: string
  /**
   * Where its shown code is: a `// #region` of `snippets/components.ts`, or
   * the whole of its own module, `src/examples/<slug>/<name>.ts`.
   */
  readonly code: 'region' | 'module'
  /** Whether it declared state, which the line under its code then names. */
  readonly stateful: boolean
  readonly render: <Message>(selection: Selection, live: Live<Message>) => Html
}

/** The key an example's state is kept under. */
export const exampleKey = (slug: string, name: string): string => `${slug}/${name}`

/** An example module's file, from the repository root. */
export const exampleFile = (slug: string, name: string): string =>
  `examples/site/src/examples/${slug}/${name}.ts`

/** The value `axis` takes under `selection`: what was picked, if the recipe has it. */
export const valueOf = (axis: Axis, selection: Selection): string => {
  const picked = Object.hasOwn(selection, axis.name) ? selection[axis.name] : undefined
  return picked !== undefined && axis.values.includes(picked) ? picked : axis.initial
}

/** The hint of an axis the selection leaves without effect, or none while it changes something. */
export const idleHint = (
  axes: ReadonlyArray<Axis>,
  axis: Axis,
  selection: Selection,
): string | undefined => {
  const { needs } = axis
  const other = needs && axes.find(each => each.name === needs.axis)
  return needs && other && !needs.values.includes(valueOf(other, selection))
    ? needs.hint
    : undefined
}

/** `Recipes.Button.style({ tone: 'neutral' })`: the selection as code, naming only what differs from the defaults. */
export const selectionCode = (showcase: Showcase, selection: Selection): string => {
  const picked = showcase.axes.flatMap(axis => {
    const value = valueOf(axis, selection)
    return value === axis.initial ? [] : [`${axis.name}: '${value}'`]
  })
  const argument = picked.length === 0 ? '' : `{ ${picked.join(', ')} }`
  return `Recipes.${showcase.recipe}.style(${argument})`
}

/** What the catalogue says of a showcase, before its recipe and drawings load. */
export type About = Omit<Showcase, 'axes' | 'preview' | 'examples' | 'states'>
