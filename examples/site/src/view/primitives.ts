/**
 * The Primitives gallery: what a primitive is here, then a card for each of
 * the package's modules, grouped by the subpath it is imported from.
 */
import type { Html } from 'foldkit/html'
import { SSR } from 'foldkit-ssr/client'

import { families, guideOf, importPath, type Card, type Family } from '../gallery/primitives.js'
import type { Library } from '../library.js'
import { Message, type Model } from '../main.js'
import { examples, type PrimitiveExample } from '../snippets/primitives.js'
import type { H, Slots } from './layout.js'
import { row, withCode } from './primitiveRow.js'

const GUIDE = '/primitives'

/** The rail on the gallery: the guide, and each family. */
export const primitivesContents = (slots: Slots, h: H): ReadonlyArray<Html> => [
  h.nav(slots.sidebar.attrs([h.AriaLabel('Primitives')]), [
    h.section(
      [],
      [h.h2([], ['Get started']), h.ul([], [h.li([], [h.a([h.Href(GUIDE)], ['Guide'])])])],
    ),
    h.section(
      [],
      [
        h.h2([], ['Families']),
        h.ul(
          [],
          families.map(family => h.li([], [h.a([h.Href(`#${family.id}`)], [family.title])])),
        ),
      ],
    ),
  ]),
]

/** A running example, as a component's page shows one: its title and line, the primitive running in this page's Model on a framed stage, and its source whole. */
const exampleBlock = (
  model: Model,
  example: PrimitiveExample,
  library: Library,
  slots: Slots,
  h: H,
): Html =>
  h.div(slots.example.attrs([h.Id(example.id), h.AriaLabelledBy(`${example.id}-title`)]), [
    h.h3(slots.cellTitle.attrs([h.Id(`${example.id}-title`)]), [example.title]),
    h.p(slots.cellText.attrs(), withCode(h, example.text)),
    // Until the browser has taken the page over, the served markup has no handler.
    h.div(slots.demo.attrs(model.addressRead ? [] : [h.Attribute('inert', ''), h.AriaBusy(true)]), [
      example.draw(model, slots, h),
    ]),
    h.div(slots.themeCode.attrs(), [SSR.static(example.id, library.primitive(example.id))]),
  ])

/** Whether a primitive answers the search box: its name, what it says, its form or its module. */
const matches = (family: Family, entry: Card, query: string): boolean => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word !== '')
  const text =
    `${entry.name} ${entry.about} ${entry.form} ${entry.module} ${family.title}`.toLowerCase()
  return words.every(word => text.includes(word))
}

const familySection = (
  model: Model,
  family: Family,
  rows: ReadonlyArray<Card>,
  library: Library,
  slots: Slots,
  h: H,
): Html => {
  const shown = examples.filter(example => example.family === family.id)
  return h.section(
    slots.shelf.attrs([
      h.Id(family.id),
      h.AriaLabelledBy(`${family.id}-title`),
      // Kept in the page, so its examples' source (a static region) is not lost to a search.
      ...(rows.length === 0 ? [h.Attribute('hidden', '')] : []),
    ]),
    [
      h.div(slots.shelfHead.attrs(), [
        h.h2(slots.shelfTitle.attrs([h.Id(`${family.id}-title`)]), [family.title]),
        h.p(slots.shelfAbout.attrs(), [
          ...withCode(h, family.about),
          ' ',
          h.a([h.Href(guideOf(family.id))], [`${importPath(family.id)} guide →`]),
        ]),
      ]),
      h.ul(
        slots.primitives.attrs(),
        rows.map(entry => row(family, entry, slots, h)),
      ),
      ...(shown.length === 0
        ? []
        : [
            h.div(slots.examples.attrs(), [
              h.p(slots.examplesLabel.attrs(), ['Examples']),
              ...shown.map(example => exampleBlock(model, example, library, slots, h)),
            ]),
          ]),
    ],
  )
}

/** Each family with the primitives the search box leaves in, and a line saying so when none is left. */
const visible = (model: Model, slots: Slots, h: H, library: Library): ReadonlyArray<Html> => {
  const rowsOf = (family: Family) =>
    family.cards.filter(entry => matches(family, entry, model.primitiveQuery))
  const none = families.every(family => rowsOf(family).length === 0)
  return [
    ...(none
      ? [
          h.p(slots.none.attrs([h.Role('status')]), [
            `No primitive matches “${model.primitiveQuery}”.`,
          ]),
        ]
      : []),
    ...families.map(family => familySection(model, family, rowsOf(family), library, slots, h)),
  ]
}

export const primitivesPage = (
  model: Model,
  library: Library,
  slots: Slots,
  h: H,
): ReadonlyArray<Html> => [
  h.section(slots.hero.attrs(), [
    h.h1(slots.heroTitle.attrs(), [
      'Primitives. ',
      h.span(slots.quiet.attrs(), ['Behaviour with no markup of its own.']),
    ]),
    h.p(slots.lede.attrs(), [
      'A primitive here is headless state and behaviour for a Foldkit application: a media query, a timer, a roving tab stop, an undo stack. It keeps its fact in your Model, reports changes as Messages, and draws nothing, so your view draws it. ',
      'A component in ',
      h.code([], ['foldkit-mixins-ui']),
      ' is one of these dressed in markup and a recipe; reach for a primitive when the markup is yours. Read the ',
      h.a([h.Href(GUIDE)], ['guide']),
      ' for the model, or pick a family below.',
    ]),
  ]),
  h.input(
    slots.search.attrs([
      h.Type('search'),
      h.AriaLabel('Search the primitives'),
      h.Placeholder('Search the primitives'),
      h.Value(model.primitiveQuery),
      h.OnInput(query => Message.FilteredPrimitives({ query })),
      ...(model.addressRead ? [] : [h.Attribute('inert', '')]),
    ]),
  ),
  ...visible(model, slots, h, library),
]
