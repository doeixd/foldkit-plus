import { Array, Match, Option, Schema } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import type { Session } from '../../domain/session.js'
import { makeNotFoundView } from '../../notFoundView.js'
import { type LoggedInRoute, dashboardRouter, settingsRouter } from '../../route.js'
import { LoggedInPart } from '../../style.js'
import type { Message } from './message.js'
import type { Model } from './model.js'
import * as Dashboard from './page/dashboard.js'
import * as Settings from './page/settings.js'

type Slots = SlotBuilders<typeof LoggedInPart.slots, Message>

const NavSection = Schema.Literals(['Dashboard', 'Settings'])
type NavSection = typeof NavSection.Type

const navSectionOf = (route: LoggedInRoute): Option.Option<NavSection> =>
  Match.value(route).pipe(
    Match.tagsExhaustive({
      Dashboard: () => Option.some('Dashboard' as const),
      Settings: () => Option.some('Settings' as const),
      NotFound: () => Option.none(),
    }),
  )

const navigationHrefBySection: Readonly<Record<NavSection, () => string>> = {
  Dashboard: dashboardRouter,
  Settings: settingsRouter,
}

const navigationView = (
  session: Session,
  route: LoggedInRoute,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const currentSection = navSectionOf(route)

  return h.nav(slots.nav.attrs(), [
    h.div(slots.navInner.attrs(), [
      h.ul(
        slots.navList.attrs(),
        Array.map(NavSection.literals, section =>
          h.li(slots.navItem.attrs(), [
            h.a(
              slots.navLink.attrs([
                h.Href(navigationHrefBySection[section]()),
                ...(Option.contains(currentSection, section) ? [h.AriaCurrent('page')] : []),
              ]),
              [section],
            ),
          ]),
        ),
      ),
      h.div(slots.signedInAs.attrs(), [`Signed in as ${session.email}`]),
    ]),
  ])
}

const NotFound = makeNotFoundView<Message>()

export const LoggedInPage = SlotView.forMessages<Message>()
  .define(LoggedInPart.slots, (model: Model, slots, h) =>
    h.div(slots.shell.attrs(), [
      navigationView(model.session, model.route, slots, h),
      h.main(slots.main.attrs(), [
        Match.value(model.route).pipe(
          Match.tagsExhaustive({
            Dashboard: () => Dashboard.view(model.session, h),
            Settings: () => Settings.view(model.session, h),
            NotFound: ({ path }) =>
              NotFound(
                { path, backLinkHref: dashboardRouter(), backLinkText: 'Go to Dashboard' },
                h,
              ),
          }),
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(LoggedInPart.style))

export const view = Submodel.defineView<Model, Message>(LoggedInPage)
