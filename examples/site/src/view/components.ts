/**
 * The component pages: a gallery of every showcase, and a page for each with
 * its variants to pick from, a preview drawn by the picked recipe, and the
 * code that draws it. Every preview is drawn in the component theme
 * (`gallery/theme.ts`), declared on the preview itself.
 */
import type { Html } from 'foldkit/html'
import { SSR } from 'foldkit-ssr/client'

import { onGitHub } from '../demos.js'
import {
  selectionCode,
  showcases,
  valueOf,
  type Live,
  type Showcase,
} from '../gallery/showcases.js'
import { defaults, knobStyleOf, sameTheme, type Scheme } from '../gallery/theme.js'
import { COMPONENTS, CREATE, type Library } from '../library.js'
import { Message, type Model } from '../main.js'
import type { H, Slots } from './layout.js'

export const liveOf = (model: Model, h: H): Live<Message> => ({
  switched: model.switched,
  onSwitch: on => Message.ToggledSwitch({ on }),
  chosen: model.chosenCard,
  onChoose: key => Message.ChoseCard({ key }),
  dismissed: model.cardDismissed,
  onDismiss: Message.DismissedCard(),
  onRestore: Message.RestoredCard(),
  direction: model.direction,
  widgets: model.widgets,
  onWidget: message => Message.GotWidget({ message }),
  h,
})

/** A frame in the component theme, with the reader's knobs and scheme over it. */
export const preview = (
  model: Model,
  size: 'page' | 'thumb' | 'canvas' | 'specimen',
  slots: Slots,
  h: H,
  children: ReadonlyArray<Html>,
): Html =>
  h.div(
    slots.preview.attrs([
      h.DataAttribute('size', size),
      h.Style(knobStyleOf(model.theme, model.scheme)),
      h.Dir(model.direction),
      // A thumbnail only shows: the card's link takes the click, and nothing
      // in it is reached by Tab.
      ...(size === 'thumb' ? [h.Attribute('inert', '')] : []),
    ]),
    children,
  )

/**
 * A note that the previews below are in the reader's own theme, with a link
 * to change it and a button back to the default; nothing in the default.
 */
export const themeNotice = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> =>
  sameTheme(model.theme, defaults)
    ? []
    : [
        h.div(slots.themeNotice.attrs([h.Role('status')]), [
          h.p(slots.themeNoticeText.attrs(), ['Previews are drawn in the theme you made.']),
          h.a(slots.themeAction.attrs([h.Href(CREATE)]), ['Edit it']),
          h.button(
            slots.themeAction.attrs([
              h.Type('button'),
              h.OnClick(Message.ChoseValues({ values: defaults })),
            ]),
            ['Use the default'],
          ),
        ]),
      ]

/** Buttons that pick one of `values`; the picked one is pressed. */
export const choices = <A extends string>(
  slots: Slots,
  h: H,
  name: string,
  values: ReadonlyArray<{ readonly value: A; readonly label: string }>,
  current: A,
  toMessage: (value: A) => Message,
): Html =>
  h.fieldset(slots.axis.attrs(), [
    h.legend(slots.axisName.attrs(), [name]),
    h.div(
      slots.choices.attrs(),
      values.map(({ value, label }) =>
        h.button(
          slots.choice.attrs([
            h.Type('button'),
            h.AriaPressed(String(value === current)),
            h.OnClick(toMessage(value)),
          ]),
          [label],
        ),
      ),
    ),
  ])

const schemes: ReadonlyArray<{ readonly value: Scheme; readonly label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export const schemeChoice = (model: Model, slots: Slots, h: H): Html =>
  choices(slots, h, 'scheme', schemes, model.scheme, scheme => Message.ChoseScheme({ scheme }))

/** Left to right or right to left: the previews that place or key off it follow. */
export const directionChoice = (model: Model, slots: Slots, h: H): Html =>
  choices(
    slots,
    h,
    'direction',
    [
      { value: 'ltr', label: 'LTR' },
      { value: 'rtl', label: 'RTL' },
    ] as const,
    model.direction,
    direction => Message.ChoseDirection({ direction }),
  )

/** The rail on a component page: the overview, the theme creator, and each component. */
export const componentsContents = (path: string, slots: Slots, h: H): ReadonlyArray<Html> => {
  const link = (href: string, label: string) =>
    h.li([], [h.a([h.Href(href), ...(href === path ? [h.AriaCurrent('page')] : [])], [label])])
  return [
    h.nav(slots.sidebar.attrs([h.AriaLabel('Components')]), [
      h.section(
        [],
        [
          h.h2([], ['Get started']),
          h.ul([], [link(COMPONENTS, 'Overview'), link(CREATE, 'Create a theme')]),
        ],
      ),
      h.section(
        [],
        [
          h.h2([], ['Components']),
          h.ul(
            [],
            showcases.map(showcase => link(`${COMPONENTS}/${showcase.slug}`, showcase.title)),
          ),
        ],
      ),
    ]),
  ]
}

export const componentsPage = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const live = liveOf(model, h)
  return [
    h.section(slots.hero.attrs(), [
      h.h1(slots.heroTitle.attrs(), [
        'Components. ',
        h.span(slots.quiet.attrs(), ['Recipes you select, not CSS you fork.']),
      ]),
      h.p(slots.lede.attrs(), [
        'Every component here is drawn by a recipe ',
        h.code([], ['foldkit-mixins-ui']),
        ' ships, in a theme made from a few knobs. Open one to pick its variants and read its code, or ',
        h.a([h.Href(CREATE)], ['make a theme']),
        ' and watch them all change.',
      ]),
      h.div(slots.actions.attrs(), [
        h.a(slots.primary.attrs([h.Href(CREATE)]), ['Create a theme']),
      ]),
      ...themeNotice(model, slots, h),
    ]),
    h.ul(
      slots.gallery.attrs(),
      showcases.map(showcase =>
        h.li(slots.galleryCard.attrs(), [
          preview(model, 'thumb', slots, h, [showcase.preview({}, live)]),
          h.a(slots.galleryLink.attrs([h.Href(`${COMPONENTS}/${showcase.slug}`)]), [
            showcase.title,
          ]),
          h.p(slots.galleryText.attrs(), [showcase.summary]),
        ]),
      ),
    ),
  ]
}

export const componentPage = (
  model: Model,
  showcase: Showcase,
  library: Library,
  slots: Slots,
  h: H,
): ReadonlyArray<Html> => [
  h.section(slots.hero.attrs(), [
    h.p(slots.eyebrow.attrs(), [h.a(slots.titleLink.attrs([h.Href(COMPONENTS)]), ['Components'])]),
    h.h1(slots.heroTitle.attrs(), [showcase.title]),
    h.p(slots.lede.attrs(), [showcase.summary]),
    ...themeNotice(model, slots, h),
  ]),
  h.div(slots.stage.attrs(), [
    h.div(slots.toolbar.attrs(), [
      ...showcase.axes.map(axis =>
        choices(
          slots,
          h,
          axis.name,
          axis.values.map(value => ({ value, label: value })),
          valueOf(axis, model.selection),
          value => Message.PickedVariant({ axis: axis.name, value }),
        ),
      ),
      schemeChoice(model, slots, h),
      directionChoice(model, slots, h),
    ]),
    ...(showcase.examples.length === 0
      ? [
          preview(model, 'page', slots, h, [showcase.preview(model.selection, liveOf(model, h))]),
          h.p(slots.selection.attrs(), [selectionCode(showcase, model.selection)]),
        ]
      : showcase.examples.flatMap(example => [
          h.section(slots.section.attrs([h.AriaLabelledBy(example.name)]), [
            h.h2(slots.sectionTitle.attrs([h.Id(example.name)]), [
              example.title,
              ' ',
              h.a(slots.titleLink.attrs([h.Href(`#${example.name}`)]), ['#']),
            ]),
            preview(model, 'page', slots, h, [example.render(model.selection, liveOf(model, h))]),
            h.div(slots.themeCode.attrs(), [
              SSR.static(
                `usage-${showcase.slug}-${example.name}`,
                library.usage(`${showcase.slug}-${example.name}`),
              ),
            ]),
          ]),
        ])),
  ]),
  h.section(slots.section.attrs([h.AriaLabelledBy('usage')]), [
    h.h2(slots.sectionTitle.attrs([h.Id('usage')]), ['Usage']),
    h.p(slots.rowText.attrs(), [
      showcase.examples.length === 0
        ? 'The function that drew the preview, over the theme module '
        : 'Each example above names the function that drew it, over the theme module ',
      h.a([h.Href(CREATE)], ['Create a theme']),
      ' writes. The preview passes it the style picked above instead of its default.',
    ]),
    ...(showcase.examples.length === 0
      ? [
          h.div(slots.themeCode.attrs(), [
            SSR.static(`usage-${showcase.slug}`, library.usage(showcase.slug)),
          ]),
        ]
      : []),
    h.p(slots.rowActions.attrs(), [
      h.a(
        slots.source.attrs([
          h.Href(onGitHub(`packages/mixins-ui/src/recipes/${showcase.file}.ts`)),
        ]),
        ['The recipe ↗'],
      ),
      h.a(slots.source.attrs([h.Href(onGitHub('examples/site/src/snippets/components.ts'))]), [
        'This code ↗',
      ]),
    ]),
  ]),
]
