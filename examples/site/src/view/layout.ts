/**
 * Every page's frame: the rail with the brand, the site's places and what the
 * page holds, and the page beside it. On a phone the rail is a bar whose menu
 * opens what it holds.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr/client'

import { onGitHub } from '../demos.js'
import { showcaseOf } from '../gallery/showcases.js'
import type { Library } from '../library.js'
import { Message, Page, type Model } from '../main.js'
import { SiteStyle } from '../style.js'
import { componentPage, componentsContents, componentsPage } from './components.js'
import { createPage } from './create.js'
import { demosPage } from './demos.js'
import { docPage } from './doc.js'
import { homeContents, homePage } from './home.js'

/** The rail's id, which the template's script keeps the sidebar's place by (`index.html`). */
export const RAIL = 'rail'

export type Slots = SlotBuilders<typeof SiteStyle.slots, Message>
export type H = HtmlBuilder<Message>

export interface Input {
  readonly model: Model
  readonly library: Library
}

/** Which of the rail's places the page belongs to. */
type Place = 'home' | 'learn' | 'packages' | 'components' | 'demos' | 'none'

const placeOf = (page: Page): Place =>
  Page.match<Place>(page, {
    Home: () => 'home',
    Demos: () => 'demos',
    Components: () => 'components',
    Component: () => 'components',
    Create: () => 'components',
    Doc: ({ subsite }) => (subsite === 'learn' ? 'learn' : 'packages'),
    Missing: () => 'none',
  })

const places: ReadonlyArray<{
  readonly place: Place
  readonly label: string
  readonly href: string
}> = [
  { place: 'home', label: 'Home', href: '/' },
  { place: 'learn', label: 'Learn', href: '/learn' },
  { place: 'packages', label: 'Packages', href: '/#packages' },
  { place: 'components', label: 'Components', href: '/components' },
  { place: 'demos', label: 'Demos', href: '/demos' },
]

const rail = ({ model, library }: Input, slots: Slots, h: H): Html =>
  h.aside(slots.rail.attrs([h.Id(RAIL)]), [
    h.div(slots.railTop.attrs(), [
      h.a(slots.brand.attrs([h.Href('/')]), [
        h.span(slots.brandMark.attrs([h.AriaHidden(true)]), ['F+']),
        'Foldkit Plus',
      ]),
      h.button(
        slots.menuButton.attrs([
          h.Type('button'),
          h.AriaExpanded(model.menuOpen),
          h.AriaControls('rail-body'),
          h.OnClick(Message.ToggledMenu()),
        ]),
        [model.menuOpen ? 'Close' : 'Menu'],
      ),
    ]),
    h.div(
      slots.railBody.attrs([h.Id('rail-body'), h.DataAttribute('open', String(model.menuOpen))]),
      [
        h.nav(slots.nav.attrs([h.AriaLabel('Site')]), [
          ...places.map(({ place, label, href }) =>
            h.a(
              [h.Href(href), ...(place === placeOf(model.page) ? [h.AriaCurrent('page')] : [])],
              [label],
            ),
          ),
          h.a([h.Href('https://github.com/doeixd/foldkit-plus')], ['GitHub ↗']),
        ]),
        h.hr(slots.railRule.attrs()),
        ...Page.match(model.page, {
          Home: () => homeContents(slots, h),
          Demos: () => [
            h.p(slots.railNote.attrs(), [
              'Built as static files.',
              h.br([]),
              'Servers run in your browser.',
            ]),
          ],
          Components: () => componentsContents(model.path, slots, h),
          Component: () => componentsContents(model.path, slots, h),
          Create: () => componentsContents(model.path, slots, h),
          Doc: () => [
            h.nav(slots.sidebar.attrs([h.AriaLabel('Documentation')]), [
              SSR.static('sidebar', library.sidebar(model.path)),
            ]),
          ],
          Missing: () => [],
        }),
        h.hr(slots.railRule.attrs()),
        h.p(slots.railNote.attrs(), ['Open source, MIT', h.br([]), 'Foldkit 0.165 · Effect 4']),
      ],
    ),
  ])

const missing = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.section(slots.hero.attrs(), [
    h.h1(slots.heroTitle.attrs(), [
      'Not found. ',
      h.span(slots.quiet.attrs(), ['Nothing lives here.']),
    ]),
    h.p(slots.lede.attrs(), [
      `There is no page at ${model.path}. Start from `,
      h.a([h.Href('/')], ['the home page']),
      ', or pick a package below it.',
    ]),
  ]),
]

const footer = (slots: Slots, h: H): Html =>
  h.footer(slots.footer.attrs(), [
    h.p(
      [],
      [
        'This site is a Foldkit Plus application, rendered at build time with foldkit-ssr. ',
        h.a([h.Href(onGitHub('examples/site/src/main.ts'))], ['Its source']),
      ],
    ),
    h.nav(
      [h.AriaLabel('Elsewhere')],
      [
        h.a([h.Href('https://foldkit.dev')], ['Foldkit']),
        h.a([h.Href('https://effect.website')], ['Effect']),
        h.a([h.Href('https://github.com/doeixd/foldkit-plus')], ['GitHub']),
      ],
    ),
  ])

export const Body = SlotView.forMessages<Message>()
  .define(SiteStyle.slots, (input: Input, slots, h) =>
    h.div(slots.shell.attrs(), [
      rail(input, slots, h),
      h.main(slots.main.attrs([h.Id('main')]), [
        ...Page.match(input.model.page, {
          Home: () => homePage(input.model, input.library, slots, h),
          Demos: () => demosPage(slots, h),
          Components: () => componentsPage(input.model, slots, h),
          Component: ({ slug }) =>
            Option.match(showcaseOf(slug), {
              onNone: () => missing(input.model, slots, h),
              onSome: showcase => componentPage(input.model, showcase, input.library, slots, h),
            }),
          Create: () => createPage(input.model, slots, h),
          Doc: () => docPage(input.model, input.library, slots, h),
          Missing: () => missing(input.model, slots, h),
        }),
        footer(slots, h),
      ]),
    ]),
  )
  .pipe(Style.attach(SiteStyle.style))
