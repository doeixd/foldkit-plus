import { Match } from 'effect'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'

import { Message } from './message.js'
import { LoggedIn, LoggedOut, type Model } from './model.js'
import { AppRoute } from './route.js'
import { AuthPage } from './style.js'

export const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => 'Auth',
    Login: () => 'Login | Auth',
    Dashboard: () => 'Dashboard | Auth',
    Settings: () => 'Settings | Auth',
    NotFound: () => 'NotFound | Auth',
  })

export const Page = SlotView.forMessages<Message>()
  .define(AuthPage.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      Match.value(model).pipe(
        Match.tagsExhaustive({
          LoggedOut: loggedOutModel =>
            h.submodel({
              slotId: 'logged-out',
              model: loggedOutModel,
              view: LoggedOut.view,
              toParentMessage: message => Message.GotLoggedOutMessage({ message }),
            }),
          LoggedIn: loggedInModel =>
            h.submodel({
              slotId: 'logged-in',
              model: loggedInModel,
              view: LoggedIn.view,
              toParentMessage: message => Message.GotLoggedInMessage({ message }),
            }),
        }),
      ),
    ]),
  )
  .pipe(Style.attach(AuthPage.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Page(model, h),
})
