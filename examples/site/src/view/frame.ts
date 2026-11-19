/**
 * Every page's frame, for either application: the rail with the brand, the
 * site's places and what the page holds, and the page beside it. On a phone the
 * rail is a bar whose Menu button opens a Sheet that holds what the rail
 * does. The frame is written once, over the Message of whichever application
 * draws it, which hands it the two Messages it sends.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Sheet } from 'foldkit-mixins-ui'

import { onGitHub } from '../demos.js'
import { MENU_ID, PRIMITIVES_GALLERY } from '../library.js'
import { Page } from '../page.js'
import type { PageScheme } from '../page.js'
import { MenuSheetStyle, SiteStyle } from '../style.js'

/** The rail's id, which the template's script keeps the sidebar's place by (`index.html`). */
export const RAIL = 'rail'

export type Slots<M> = SlotBuilders<typeof SiteStyle.slots, M>
export type H<M> = HtmlBuilder<M>

/** What the frame needs of an application's Model. */
export interface FrameModel {
  readonly path: string
  readonly page: Page
  readonly menu: Sheet.Model
  readonly pageScheme: PageScheme
}

/** The Messages the frame sends. */
export interface Chrome<M> {
  /** The menu Sheet's own Messages, as the application wraps them. */
  readonly menu: (message: Sheet.Message) => M
  readonly chosePageScheme: (scheme: PageScheme) => M
}

export interface Input<M> {
  readonly model: FrameModel
  /** What the rail holds beside the places: the page's own contents. */
  readonly rail: (slots: Slots<M>, h: H<M>) => ReadonlyArray<Html>
  /** What the menu holds in its place, where the rail's would be drawn twice (a static region). */
  readonly menu?: (slots: Slots<M>, h: H<M>) => ReadonlyArray<Html>
  readonly page: (slots: Slots<M>, h: H<M>) => ReadonlyArray<Html>
}

/** Which of the rail's places the page belongs to. */
type Place = 'home' | 'learn' | 'packages' | 'components' | 'primitives' | 'demos' | 'none'

const placeOf = (page: Page): Place =>
  Page.match<Place>(page, {
    Home: () => 'home',
    Demos: () => 'demos',
    Components: () => 'components',
    Primitives: () => 'primitives',
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
  { place: 'primitives', label: 'Primitives', href: PRIMITIVES_GALLERY },
  { place: 'demos', label: 'Demos', href: '/demos' },
]

const schemes: ReadonlyArray<{ readonly scheme: PageScheme; readonly label: string }> = [
  { scheme: 'system', label: 'Auto' },
  { scheme: 'light', label: 'Light' },
  { scheme: 'dark', label: 'Dark' },
]

/** The page's light or dark, each a button pressed while chosen. */
const schemeChoice = <M>(chrome: Chrome<M>, model: FrameModel, slots: Slots<M>, h: H<M>): Html =>
  h.div(
    slots.schemeChoice.attrs([h.Role('group'), h.AriaLabel('Color scheme')]),
    schemes.map(({ scheme, label }) =>
      h.button(
        [
          h.Type('button'),
          h.AriaPressed(String(scheme === model.pageScheme)),
          h.OnClick(chrome.chosePageScheme(scheme)),
        ],
        [label],
      ),
    ),
  )

/** The places, in the rail and in the menu. */
const siteNav = <M>(model: FrameModel, label: string, slots: Slots<M>, h: H<M>): Html =>
  h.nav(slots.nav.attrs([h.AriaLabel(label)]), [
    ...places.map(({ place, label, href }) =>
      h.a(
        [h.Href(href), ...(place === placeOf(model.page) ? [h.AriaCurrent('page')] : [])],
        [label],
      ),
    ),
    h.a([h.Href('https://github.com/doeixd/foldkit-plus')], ['GitHub ↗']),
  ])

const note = <M>(slots: Slots<M>, h: H<M>): Html =>
  h.p(slots.railNote.attrs(), ['Open source, MIT', h.br([]), 'Foldkit 0.168 · Effect 4'])

const rail = <M>(
  chrome: Chrome<M>,
  { model, rail: contents }: Input<M>,
  slots: Slots<M>,
  h: H<M>,
): Html =>
  h.aside(slots.rail.attrs([h.Id(RAIL)]), [
    h.div(slots.railTop.attrs(), [
      h.a(slots.brand.attrs([h.Href('/')]), [
        h.span(slots.brandMark.attrs([h.AriaHidden(true)]), ['F+']),
        'Foldkit Plus',
      ]),
      h.button(
        slots.menuButton.attrs([
          h.Type('button'),
          h.AriaExpanded(Sheet.isOpen(model.menu)),
          h.AriaControls(MENU_ID),
          h.AriaHasPopup('dialog'),
          h.OnClick(
            chrome.menu(Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedOpen() })),
          ),
        ]),
        ['Menu'],
      ),
    ]),
    h.div(slots.railBody.attrs(), [
      siteNav(model, 'Site', slots, h),
      h.hr(slots.railRule.attrs()),
      ...contents(slots, h),
      h.hr(slots.railRule.attrs()),
      schemeChoice(chrome, model, slots, h),
      note(slots, h),
    ]),
  ])

/**
 * The phone menu: a Sheet from the inline-start edge that holds what the rail
 * does. Its panel is drawn closed as well, so a static region in it (the doc
 * sidebar) is in the page the server wrote and the browser adopts it; a
 * closed dialog shows nothing, and a wide window shows no menu.
 */
const menu = <M>(
  chrome: Chrome<M>,
  { model, rail: contents, menu: held }: Input<M>,
  slots: Slots<M>,
  h: H<M>,
): Html =>
  Sheet.view(
    {
      model: model.menu,
      onMessage: chrome.menu,
      style: MenuSheetStyle,
      draw: sheet =>
        h.dialog(sheet.dialog, [
          h.div(sheet.backdrop),
          h.div(sheet.panel, [
            h.div(slots.menuHead.attrs(), [
              h.h2(sheet.title, ['Menu']),
              h.button(sheet.closeButton, ['Close']),
            ]),
            h.div(slots.menuBody.attrs(), [
              siteNav(model, 'Site menu', slots, h),
              h.hr(slots.railRule.attrs()),
              ...(held ?? contents)(slots, h),
              h.hr(slots.railRule.attrs()),
              schemeChoice(chrome, model, slots, h),
              note(slots, h),
            ]),
          ]),
        ]),
    },
    h,
  )

/** The page where there is none. */
export const missing = <M>(model: FrameModel, slots: Slots<M>, h: H<M>): ReadonlyArray<Html> => [
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

const footer = <M>(slots: Slots<M>, h: H<M>): Html =>
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

/** The frame over `M`: its Messages from `chrome`, its page and rail from the input. */
export const frame = <M>(chrome: Chrome<M>) =>
  SlotView.forMessages<M>()
    .define(SiteStyle.slots, (input: Input<M>, slots, h) =>
      h.div(slots.shell.attrs(), [
        rail(chrome, input, slots, h),
        h.main(slots.main.attrs([h.Id('main')]), [...input.page(slots, h), footer(slots, h)]),
        menu(chrome, input, slots, h),
      ]),
    )
    .pipe(Style.attach(SiteStyle.style))
