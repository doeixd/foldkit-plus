/**
 * The components the site shows: each a shipped recipe, the variant axes a
 * reader can pick from (read from the recipe itself), and the function in
 * `src/snippets/components.ts` that draws it. A selection the recipe does
 * not know never reaches it: every value is checked against the recipe's own
 * axes first.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle, type StylePieces } from 'foldkit-mixins'
import {
  AlertSlots,
  AvatarSlots,
  BadgeSlots,
  BreadcrumbSlots,
  ButtonGroupSlots,
  ButtonSlots,
  CardSlots,
  CheckboxSlots,
  EmptySlots,
  InputSlots,
  ItemSlots,
  KbdSlots,
  PaginationSlots,
  Recipes,
  SelectSlots,
  SeparatorSlots,
  SkeletonSlots,
  SpinnerSlots,
  SwitchSlots,
  TableSlots,
  TextareaSlots,
} from 'foldkit-mixins-ui'

import * as Snippet from '../snippets/components.js'
import { forSlots } from '../snippets/theme.js'

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
  readonly checked: boolean
  readonly onCheck: (checked: boolean) => Message
  readonly switched: boolean
  readonly onSwitch: (on: boolean) => Message
  readonly page: number
  readonly onPage: (page: number) => Message
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

const inert = SlotView.inertBuilder<never>()

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
 */
const fromRecipe = <Slots>(
  about: Omit<Showcase, 'axes' | 'preview'>,
  contract: Slots,
  recipe: RecipeOf<Slots> & ((selection: never) => StylePieces<Slots>),
  draw: <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html,
  only?: ReadonlyArray<string>,
): Showcase => {
  const axes = Object.entries(recipe.def.variants)
    .filter(([name]) => only === undefined || only.includes(name))
    .map(([name, values]): Axis => {
      const names = Object.keys(values)
      return { name, values: names, initial: recipe.def.defaults?.[name] ?? names[0]! }
    })
  // Every value passed was checked against the recipe's own axes by `valueOf`.
  const select = recipe as unknown as (selection: Selection) => StylePieces<Slots>
  const styles = new Map<string, NamedStyle<Slots>>()
  const styleOf = (selection: Selection): NamedStyle<Slots> => {
    const chosen = Object.fromEntries(axes.map(axis => [axis.name, valueOf(axis, selection)]))
    const key = axes.map(axis => chosen[axis.name]).join('/')
    const known = styles.get(key)
    if (known !== undefined) return known
    const style = forSlots(contract)(select(chosen))
    styles.set(key, style)
    return style
  }
  return { ...about, axes, preview: (selection, live) => draw(styleOf(selection), live) }
}

/** A showcase whose look has no axes to pick from. */
const fixed = (
  about: Omit<Showcase, 'axes' | 'preview'>,
  draw: <Message>(live: Live<Message>) => Html,
): Showcase => ({ ...about, axes: [], preview: (_, live) => draw(live) })

export const showcases: ReadonlyArray<Showcase> = [
  fromRecipe(
    {
      slug: 'button',
      title: 'Button',
      summary: 'An action, in three tones, five treatments and three sizes.',
      recipe: 'Button',
      file: 'button',
      contract: 'ButtonSlots',
    },
    ButtonSlots,
    Recipes.Button,
    style => Snippet.button(style, inert),
  ),
  fixed(
    {
      slug: 'button-group',
      title: 'Button group',
      summary: 'Related buttons joined into one control.',
      recipe: 'ButtonGroup',
      file: 'buttonGroup',
      contract: 'ButtonGroupSlots',
    },
    () => Snippet.buttonGroup(Snippet.ButtonGroupStyle, inert),
  ),
  fixed(
    {
      slug: 'badge',
      title: 'Badge',
      summary: 'A status pill toned by the value it carries.',
      recipe: 'Badge',
      file: 'badge',
      contract: 'BadgeSlots',
    },
    () => Snippet.badges(Snippet.BadgeStyle, inert),
  ),
  fromRecipe(
    {
      slug: 'alert',
      title: 'Alert',
      summary: 'A message that asks for attention, in four tones.',
      recipe: 'Alert',
      file: 'alert',
      contract: 'AlertSlots',
    },
    AlertSlots,
    Recipes.Alert,
    style => Snippet.alert(style, inert),
  ),
  fromRecipe(
    {
      slug: 'card',
      title: 'Card',
      summary: 'A surface with a title, content and actions.',
      recipe: 'Card',
      file: 'card',
      contract: 'CardSlots',
    },
    CardSlots,
    Recipes.Card,
    style => Snippet.card(style, inert),
  ),
  fromRecipe(
    {
      slug: 'input',
      title: 'Input',
      summary: 'A labelled text field with a description.',
      recipe: 'Input',
      file: 'field',
      contract: 'InputSlots',
    },
    InputSlots,
    Recipes.Input,
    style => Snippet.input(style, inert),
  ),
  fromRecipe(
    {
      slug: 'textarea',
      title: 'Textarea',
      summary: 'A field for more than one line.',
      recipe: 'Textarea',
      file: 'field',
      contract: 'TextareaSlots',
    },
    TextareaSlots,
    Recipes.Textarea,
    style => Snippet.textarea(style, inert),
  ),
  fromRecipe(
    {
      slug: 'select',
      title: 'Select',
      summary: 'The native select, styled like the fields beside it.',
      recipe: 'Select',
      file: 'select',
      contract: 'SelectSlots',
    },
    SelectSlots,
    Recipes.Select,
    style => Snippet.select(style, inert),
  ),
  fromRecipe(
    {
      slug: 'checkbox',
      title: 'Checkbox',
      summary: 'A choice that is on or off, its state in your Model.',
      recipe: 'Checkbox',
      file: 'toggle',
      contract: 'CheckboxSlots',
    },
    CheckboxSlots,
    Recipes.Checkbox,
    (style, live) => Snippet.checkbox(style, live.checked, live.onCheck, live.h),
  ),
  fromRecipe(
    {
      slug: 'switch',
      title: 'Switch',
      summary: 'A setting that takes effect at once.',
      recipe: 'Switch',
      file: 'toggle',
      contract: 'SwitchSlots',
    },
    SwitchSlots,
    Recipes.Switch,
    (style, live) => Snippet.toggle(style, live.switched, live.onSwitch, live.h),
  ),
  fromRecipe(
    {
      slug: 'avatar',
      title: 'Avatar',
      summary: 'A picture of someone, or their initials when it does not load.',
      recipe: 'Avatar',
      file: 'avatar',
      contract: 'AvatarSlots',
    },
    AvatarSlots,
    Recipes.Avatar,
    style => Snippet.avatars(style, inert),
  ),
  fixed(
    {
      slug: 'kbd',
      title: 'Kbd',
      summary: 'A key on the keyboard.',
      recipe: 'Kbd',
      file: 'kbd',
      contract: 'KbdSlots',
    },
    () => Snippet.shortcut(Snippet.KbdStyle, inert),
  ),
  fromRecipe(
    {
      slug: 'separator',
      title: 'Separator',
      summary: 'A rule between groups of content.',
      recipe: 'Separator',
      file: 'separator',
      contract: 'SeparatorSlots',
    },
    SeparatorSlots,
    Recipes.Separator,
    style => Snippet.separator(style, inert),
    [],
  ),
  fromRecipe(
    {
      slug: 'skeleton',
      title: 'Skeleton',
      summary: 'A placeholder where content is still loading.',
      recipe: 'Skeleton',
      file: 'skeleton',
      contract: 'SkeletonSlots',
    },
    SkeletonSlots,
    Recipes.Skeleton,
    style => Snippet.skeleton(style, inert),
  ),
  fromRecipe(
    {
      slug: 'spinner',
      title: 'Spinner',
      summary: 'Work in progress, announced politely.',
      recipe: 'Spinner',
      file: 'spinner',
      contract: 'SpinnerSlots',
    },
    SpinnerSlots,
    Recipes.Spinner,
    style => Snippet.spinner(style, inert),
  ),
  fixed(
    {
      slug: 'table',
      title: 'Table',
      summary: 'Rows and columns, numbers aligned to the end.',
      recipe: 'Table',
      file: 'table',
      contract: 'TableSlots',
    },
    () => Snippet.table(Snippet.TableStyle, inert),
  ),
  fixed(
    {
      slug: 'breadcrumb',
      title: 'Breadcrumb',
      summary: 'Where a page sits, and the way back up.',
      recipe: 'Breadcrumb',
      file: 'breadcrumb',
      contract: 'BreadcrumbSlots',
    },
    () => Snippet.breadcrumb(Snippet.BreadcrumbStyle, inert),
  ),
  fixed(
    {
      slug: 'pagination',
      title: 'Pagination',
      summary: 'Pages of a long list, the current one in your Model.',
      recipe: 'Pagination',
      file: 'pagination',
      contract: 'PaginationSlots',
    },
    live => Snippet.pagination(Snippet.PaginationStyle, live.page, live.onPage, live.h),
  ),
  fromRecipe(
    {
      slug: 'item',
      title: 'Item',
      summary: 'A row of a list: media, a title, a line and actions.',
      recipe: 'Item',
      file: 'item',
      contract: 'ItemSlots',
    },
    ItemSlots,
    Recipes.Item,
    style => Snippet.item(style, inert),
  ),
  fixed(
    {
      slug: 'empty',
      title: 'Empty',
      summary: 'What a list shows before it has anything in it.',
      recipe: 'Empty',
      file: 'empty',
      contract: 'EmptySlots',
    },
    () => Snippet.empty(Snippet.EmptyStyle, inert),
  ),
]

const bySlug = new Map(showcases.map(showcase => [showcase.slug, showcase]))

export const showcaseOf = (slug: string): Option.Option<Showcase> =>
  Option.fromNullishOr(bySlug.get(slug))
