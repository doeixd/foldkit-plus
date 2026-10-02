import { Option } from 'effect'
import { Transition } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { type Url, fromString } from 'foldkit/url'

import { AppRoute, Model, PaintingStatus } from '../src/main.js'

export const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

/** The Model on `route` with nothing loaded and nothing logged, as upstream's story test builds it. */
export const on = (route: AppRoute): Model =>
  Model.make({
    route,
    transitionLog: [],
    catalogStatus: 'Idle',
    paintingStatus: PaintingStatus.Idle(),
    studioDraft: '',
    maybeSavedDraft: Option.none(),
  })

/** The Model on the transition's next route, with that transition as its only log entry. */
export const logging = (transition: Transition.Transition<AppRoute>): Model =>
  modifyFields(on(transition.nextRoute), {
    transitionLog: () => [{ sequenceNumber: 1, ...transition }],
  })
