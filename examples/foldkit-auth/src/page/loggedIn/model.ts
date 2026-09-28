import { taggedStruct } from 'foldkit/schema'

import { Session } from '../../domain/session.js'
import { LoggedInRoute } from '../../route.js'

// MODEL

export const Model = taggedStruct('LoggedIn', {
  route: LoggedInRoute,
  session: Session,
})

export type Model = typeof Model.Type

// INIT

export const init = (route: LoggedInRoute, session: Session): Model =>
  Model({
    route,
    session,
  })
