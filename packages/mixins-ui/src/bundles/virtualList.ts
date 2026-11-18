import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Schema } from 'effect'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

/** Told when a scroll brings the list's end within `nearEndPx` of the view: load more there. */
const NearEnd = Schema.TaggedStruct('NearEnd', {})
type NearEnd = typeof NearEnd.Type

type Step = ReturnWithOutMessage<UiVirtualList.Model, UiVirtualList.Message, NearEnd>

const Args = Schema.Struct({
  /** Unique in the document; the list's element ids derive from it. */
  id: Schema.String,
  /** A row's height, or the estimate for rows measured as drawn. */
  rowHeightPx: Schema.Number,
  initialScrollTop: Schema.optionalKey(Schema.Number),
  /** Keeps the end in view as rows are added there, while within this many pixels of it. */
  followEnd: Schema.optionalKey(Schema.Struct({ thresholdPx: Schema.optionalKey(Schema.Number) })),
  /** Reports `NearEnd` when a scroll brings the end this close to the view; not reported when not given. */
  nearEndPx: Schema.optionalKey(Schema.Number),
})

/**
 * The step for `nearEndPx`: upstream's update, and `NearEnd` when the scroll
 * just observed crossed into the band. Crossing, not standing in it, so a
 * list that grows past the band and is scrolled to it again asks again.
 */
const stepFor =
  (nearEndPx: number | undefined) =>
  (model: UiVirtualList.Model, message: UiVirtualList.Message): Step => {
    const result = UiVirtualList.update(model, message)
    if (nearEndPx === undefined || message._tag !== 'ObservedContainerScroll') return result
    const { scrollTop, scrollHeight, containerHeight } = message
    const before = scrollHeight - (model.scrollTop + containerHeight)
    const after = scrollHeight - (scrollTop + containerHeight)
    return before >= nearEndPx && after < nearEndPx
      ? { ...result, outMessage: NearEnd.make({}) }
      : result
  }

/**
 * A VirtualList's scroll state for `foldkit-bundle`: upstream's Model, with
 * `init`'s options as the args. With `nearEndPx`, it reports `NearEnd` in
 * `onOut` when a scroll brings the end of the list that close to the view,
 * where an infinite list loads its next page. `helpers.scrollToIndex`,
 * `scrollToKey`, `scrollToEnd` and `informItemsChanged` are upstream's. It
 * holds no view: draw the placed Model with `VirtualList.view`.
 */
export const VirtualList = Bundle.make('VirtualList', {
  Model: UiVirtualList.Model,
  Message: UiVirtualList.Message,
  args: Args,
  init: ({ nearEndPx: _, ...config }) => ({ model: UiVirtualList.init(config) }),
  update: (model, message, args) => stepFor(args.nearEndPx)(model, message),
  helpers: {
    scrollToIndex: UiVirtualList.scrollToIndex,
    scrollToKey: UiVirtualList.scrollToKey,
    scrollToEnd: UiVirtualList.scrollToEnd,
    informItemsChanged: UiVirtualList.informItemsChanged,
  },
})
