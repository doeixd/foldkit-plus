import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { loginRouter } from '../../../route.js'
import { HomeSlots, HomeStyle } from '../../../style.js'
import type { Message } from '../message.js'

type Slots = SlotBuilders<typeof HomeSlots, Message>

const featureCard = (
  title: string,
  description: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.feature.attrs(), [
    h.h2(slots.featureTitle.attrs(), [title]),
    h.p(slots.featureText.attrs(), [description]),
  ])

export const view = SlotView.forMessages<Message>()
  .define(HomeSlots, (_: void, slots, h) =>
    h.div(slots.content.attrs(), [
      h.div(slots.hero.attrs(), [
        h.h1(slots.title.attrs(), ['Welcome to Auth Example']),
        h.p(slots.lead.attrs(), [
          'A demonstration of authentication with Submodels and OutMessage in Foldkit.',
        ]),
        h.a(slots.signIn.attrs([h.Href(loginRouter())]), ['Sign In']),
      ]),
      h.div(slots.features.attrs(), [
        featureCard(
          'Model as Union',
          'App state is fundamentally LoggedOut | LoggedIn, not a flat struct with optional session.',
          slots,
          h,
        ),
        featureCard(
          'Route Guards',
          'Protected routes redirect to login. Auth routes redirect to dashboard when logged in.',
          slots,
          h,
        ),
        featureCard(
          'Session Persistence',
          'Session survives page refresh via localStorage and the Flags pattern.',
          slots,
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(HomeStyle))
