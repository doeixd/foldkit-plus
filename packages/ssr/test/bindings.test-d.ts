/**
 * Phase A: a Message with a hole is checked where it is written. The member
 * must be one of the view's Messages and leave exactly what its event fills.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { Resume, type ResumableBuilder } from 'foldkit-ssr'
import { App, Message } from './bindingsFixture.js'

const Other = defineMessageUnion({ Elsewhere: { value: Schema.String } })

export const view = (h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return rh.div(
    [
      // Accepted: one string field left, fixed fields given, key and modifiers left.
      rh.OnInput(Message.ChangedSearch),
      rh.OnChange(Message.Renamed, { id: 'p1' }),
      rh.OnKeyDown(Message.Pressed),
      rh.OnKeyUp(Message.Pressed),
      // A closure still works, and is simply not resumable.
      rh.OnInput(value => Message.ChangedSearch({ value })),

      // @ts-expect-error: leaves both id and title for the event to fill
      rh.OnInput(Message.Renamed),
      // @ts-expect-error: the field the event fills is a number
      rh.OnInput(Message.Counted),
      // @ts-expect-error: a key event fills key and modifiers, not value
      rh.OnKeyDown(Message.ChangedSearch),
      // @ts-expect-error: not one of this view's Messages
      rh.OnInput(Other.Elsewhere),
    ],
    [],
  )
}

/** A Surface that may send only Liked and ChangedSearch. */
const Like = App.surface('Like', {
  model: ({ model }) => ({ id: model.id }),
  messages: [Message.Liked, Message.ChangedSearch],
})

export const surfaceViews = (): number => {
  // A Surface renderer takes the resumable builder through Resume.view.
  const likeView = Surface.rootView(
    Like,
    undefined,
    Resume.view((like, rh) =>
      rh.div(
        [
          rh.OnClick(Message.Liked({ id: like.id })),
          rh.OnInput(Message.ChangedSearch),
          // @ts-expect-error: Renamed is not one of this Surface's Messages
          rh.OnChange(Message.Renamed, { id: like.id }),
        ],
        [],
      ),
    ),
  )

  // Or wraps the builder it is given itself.
  const plainView = Surface.rootView(Like, undefined, (like, h) =>
    Resume.builder(h).button([Resume.builder(h).OnClick(Message.Liked({ id: like.id }))], []),
  )
  return [likeView, plainView].length
}

// A helper typed with ResumableBuilder takes the builder of any view or Surface
// renderer whose Messages match; a builder that may send more is refused.
const likeButton = (rh: ResumableBuilder<Message>, id: string) =>
  rh.button([rh.OnClick(Message.Liked({ id }))], ['Like'])
const likeSubset = (
  rh: ResumableBuilder<typeof Message.Liked.Type | typeof Message.ChangedSearch.Type>,
  id: string,
) => rh.button([rh.OnClick(Message.Liked({ id }))], ['Like'])

export const helpers = (h: HtmlBuilder<Message>): number => {
  const inView = likeButton(Resume.builder(h), 'p1')
  const inSurface = Surface.rootView(
    Like,
    undefined,
    Resume.view((like, rh) => likeSubset(rh, like.id)),
  )
  const Wider = App.surface('Wider', {
    model: ({ model }) => ({ id: model.id }),
    messages: [Message.Liked, Message.ChangedSearch, Message.Renamed],
  })
  const tooWide = Surface.rootView(
    Wider,
    undefined,
    // @ts-expect-error: a builder that may send Renamed is not one limited to Like's Messages
    Resume.view((wider, rh) => likeSubset(rh, wider.id)),
  )
  return [inView, inSurface, tooWide].length
}
