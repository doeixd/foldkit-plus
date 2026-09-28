import { Match } from 'effect'
import { Submodel } from 'foldkit'
import { SlotView, Style } from 'foldkit-mixins'

import { makeNotFoundView } from '../../notFoundView.js'
import { homeRouter } from '../../route.js'
import { LoggedOutPart } from '../../style.js'
import { Message } from './message.js'
import type { Model } from './model.js'
import * as Home from './page/home.js'
import * as Login from './page/login.js'

const NotFound = makeNotFoundView<Message>()

export const LoggedOutPage = SlotView.forMessages<Message>()
  .define(LoggedOutPart.slots, (model: Model, slots, h) =>
    h.div(slots.content.attrs(), [
      Match.value(model.route).pipe(
        Match.tagsExhaustive({
          Home: () => Home.view(undefined, h),
          Login: () =>
            h.submodel({
              slotId: 'login',
              model: model.loginModel,
              view: Login.view,
              toParentMessage: message => Message.GotLoginMessage({ message }),
            }),
          NotFound: ({ path }) =>
            NotFound({ path, backLinkHref: homeRouter(), backLinkText: 'Go Home' }, h),
        }),
      ),
    ]),
  )
  .pipe(Style.attach(LoggedOutPart.style))

export const view = Submodel.defineView<Model, Message>(LoggedOutPage)
