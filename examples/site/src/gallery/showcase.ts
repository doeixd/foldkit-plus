/**
 * What a component's page is made of: the variant axes, the state a preview
 * controls, and the showcase itself. Nothing here draws.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Widgets from './widgets.js'

/** One variant axis of a recipe, and the value it takes when none is picked. */
export interface Axis {
  readonly name: string
  readonly values: ReadonlyArray<string>
  readonly initial: string
}

/** What the reader picked, by axis name. */
export type Selection = Readonly<Record<string, string>>

/** The state a preview controls, held in the page's Model, and the Messages that change it. */
export interface Live<Message> {
  readonly switched: boolean
  readonly onSwitch: (on: boolean) => Message
  readonly chosen: string
  readonly onChoose: (key: string) => Message
  readonly dismissed: boolean
  readonly onDismiss: Message
  readonly onRestore: Message
  /** The reader's direction, for views that place or key off it. */
  readonly direction: 'ltr' | 'rtl'
  readonly widgets: Widgets.Model
  readonly onWidget: (message: Widgets.Message) => Message
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
}

/** One named example of a showcase, drawn with the picked style. */
export interface ShowcaseExample {
  readonly name: string
  readonly title: string
  readonly render: <Message>(selection: Selection, live: Live<Message>) => Html
}

/** The value `axis` takes under `selection`: what was picked, if the recipe has it. */
export const valueOf = (axis: Axis, selection: Selection): string => {
  const picked = Object.hasOwn(selection, axis.name) ? selection[axis.name] : undefined
  return picked !== undefined && axis.values.includes(picked) ? picked : axis.initial
}

/** `Recipes.Button({ tone: 'neutral' })`: the selection as code, naming only what differs from the defaults. */
export const selectionCode = (showcase: Showcase, selection: Selection): string => {
  const picked = showcase.axes.flatMap(axis => {
    const value = valueOf(axis, selection)
    return value === axis.initial ? [] : [`${axis.name}: '${value}'`]
  })
  const argument = picked.length === 0 ? '{}' : `{ ${picked.join(', ')} }`
  return `forSlots(${showcase.contract})(Recipes.${showcase.recipe}(${argument}))`
}

/** What the catalogue says of a showcase, before its recipe and drawings load. */
export type About = Omit<Showcase, 'axes' | 'preview' | 'examples'>
