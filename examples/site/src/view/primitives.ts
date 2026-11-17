/**
 * The Primitives gallery: what a primitive is here, then a card for each of
 * the package's modules, grouped by the subpath it is imported from.
 */
import type { Html } from 'foldkit/html'
import { SSR } from 'foldkit-ssr/client'

import { families, guideOf, importPath, type Card, type Family } from '../gallery/primitives.js'
import type { Library } from '../library.js'
import { type Model } from '../main.js'
import { examples, type PrimitiveExample } from '../snippets/primitives.js'
import type { H, Slots } from './layout.js'

const GUIDE = '/primitives'

/** A sentence with `code` in backticks drawn as code. */
const withCode = (h: H, text: string): ReadonlyArray<Html | string> =>
  text.split('`').map((part, at) => (at % 2 === 1 ? h.code([], [part]) : part))

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

const card = (family: Family, entry: Card, slots: Slots, h: H): Html =>
  h.li(
    [],
    [
      h.a(slots.card.attrs([h.Href(guideOf(family.id))]), [
        h.h3(slots.cardTitle.attrs(), [
          entry.name,
          h.span(slots.cardArrow.attrs([h.AriaHidden(true)]), ['→']),
        ]),
        h.p(slots.cardText.attrs(), withCode(h, entry.about)),
        h.p(slots.cardMeta.attrs(), [`${entry.form} · ${importPath(family.id)}`]),
      ]),
    ],
  )

/** A running example: what it says, the primitive running in this page's Model, and its source. */
const exampleBlock = (
  model: Model,
  example: PrimitiveExample,
  library: Library,
  slots: Slots,
  h: H,
): Html =>
  h.div(slots.live.attrs([h.Id(example.id), h.AriaLabelledBy(`${example.id}-title`)]), [
    h.h3(slots.cellTitle.attrs([h.Id(`${example.id}-title`)]), [example.title]),
    h.p(slots.cellText.attrs(), withCode(h, example.text)),
    // Until the browser has taken the page over, the served markup has no handler.
    h.div(
      slots.liveRow.attrs(model.addressRead ? [] : [h.Attribute('inert', ''), h.AriaBusy(true)]),
      [example.draw(model, slots, h)],
    ),
    h.div(slots.themeCode.attrs(), [SSR.static(example.id, library.primitive(example.id))]),
  ])

const familySection = (model: Model, family: Family, library: Library, slots: Slots, h: H): Html =>
  h.section(slots.shelf.attrs([h.Id(family.id), h.AriaLabelledBy(`${family.id}-title`)]), [
    h.div(slots.shelfHead.attrs(), [
      h.h2(slots.shelfTitle.attrs([h.Id(`${family.id}-title`)]), [family.title]),
      h.p(slots.shelfAbout.attrs(), [
        ...withCode(h, family.about),
        ' ',
        h.a([h.Href(guideOf(family.id))], [`${importPath(family.id)} guide →`]),
      ]),
    ]),
    ...examples
      .filter(example => example.family === family.id)
      .map(example => exampleBlock(model, example, library, slots, h)),
    h.ul(
      slots.cards.attrs(),
      family.cards.map(entry => card(family, entry, slots, h)),
    ),
  ])

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
  ...families.map(family => familySection(model, family, library, slots, h)),
]
