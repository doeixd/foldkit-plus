/**
 * Looks for the form view's Slots over the shipped tokens, from
 * `foldkit-mixins-form/recipes`: `Style.forSlots(FieldSlots)(Field({}))` and
 * `Style.forSlots(FormSlots)(Form({}))`. Text, number, select and the relation
 * picker's search box take `foldkit-mixins-ui`'s own field looks, so a form drawn
 * with the plain renderers and one drawn with `UiForm.renderers` look the same.
 */
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Recipes } from 'foldkit-mixins-ui'
import { FieldSlots, FormSlots } from './index.js'

const ref = Theme.ref(Theme.standard())
const component = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('components', Style.compose(...pieces))

const input = Recipes.Input({}).input ?? Style.empty
const button = (options: Parameters<typeof Recipes.Button>[0]) =>
  Recipes.Button(options).button ?? Style.empty
/** A small button that keeps its own width in a field or form that stretches its parts. */
const small = component(
  button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
  Style.self({ justifySelf: 'start' }),
)
/** A checkbox the browser draws, a size to see and in the accent. */
const box = component(
  Style.self({
    inlineSize: '1rem',
    blockSize: '1rem',
    margin: '0',
    accentColor: ref.accent.default,
  }),
)
/** A line the field says under its control. */
const said = (color: string) => component(Style.self({ margin: '0', fontSize: ref.size.sm, color }))

/**
 * A field: its label over its control, then what it says about it, in a grid,
 * which stretches a control with no width of its own and leaves a checkbox its
 * size. A failure reads in the error's ink; a choice of many is a row a finger's
 * height, its box beside its words.
 */
export const Field = Style.recipeFor(FieldSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space['2xs'] })),
    label: component(
      Style.self({ fontSize: ref.size.sm, fontWeight: ref.weight.medium, color: ref.text.overt }),
    ),
    description: said(ref.text.muted),
    checking: said(ref.text.muted),
    error: said(ref.error.ink),
    text: input,
    number: input,
    multiline: Recipes.Textarea({}).textarea ?? Style.empty,
    select: Recipes.Select({}).select ?? Style.empty,
    toggle: box,
    choices: component(Style.self({ display: 'grid', gap: ref.space['3xs'] })),
    choiceLabel: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        minBlockSize: '1.5rem',
      }),
    ),
    choice: box,
    group: Recipes.InputGroup.group,
    affix: Recipes.InputGroup.affix,
    search: input,
    more: small,
  },
})

/**
 * A form: its fields in a column, a failure that is no one field's in the error's
 * ink, the list of fields to fix in a box of the error's colours, and the submit
 * as the page's primary button, as wide as its words.
 */
export const Form = Style.recipeFor(FormSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space.md })),
    errors: said(ref.error.ink),
    summary: component(
      Style.self({
        display: 'grid',
        gap: ref.space.xs,
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.error.outline}`,
        borderRadius: ref.radius.md,
        background: ref.error.subtle,
        color: ref.text.default,
      }),
    ),
    summaryTitle: component(
      Style.self({ margin: '0', fontWeight: ref.weight.semibold, color: ref.error.ink }),
    ),
    issues: component(Style.self({ margin: '0', paddingInlineStart: ref.space.lg })),
    issueLink: component(
      Style.self({ color: ref.text.link, textDecoration: 'underline', textUnderlineOffset: '3px' }),
    ),
    submit: component(button({}), Style.self({ justifySelf: 'start' })),
    group: component(
      Style.self({
        display: 'grid',
        gap: ref.space.sm,
        margin: '0',
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.md,
      }),
    ),
    legend: component(
      Style.self({ paddingInline: ref.space['2xs'], fontWeight: ref.weight.semibold }),
    ),
    row: component(Style.self({ display: 'grid', gap: ref.space.sm })),
    add: small,
    remove: small,
  },
})
