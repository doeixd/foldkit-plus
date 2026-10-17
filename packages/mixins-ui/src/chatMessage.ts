import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A chat message publishes its regions as slots; it owns no state, messages
 * or bundles. Who sent it, when, what it says, whether it reached the
 * server, and what can be done with it are the application's, passed in
 * each draw; a streamed answer is the same message drawn again with more
 * `content`.
 *
 * The root carries `data-from` (`user`, `assistant`, `system`), which the
 * recipe reads to set the user's messages at the end in a bubble, and
 * `data-continued`, `data-status` and `data-streaming` for a style. A
 * message still streaming is `aria-busy`, so a log around it announces the
 * answer once it is whole rather than word by word. The `body` holds the
 * content: plain text, or Markdown rendered to Html (`foldkit-richtext-
 * markdown`'s `parse`, then `foldkit-richtext-dom`'s `renderDocument`),
 * which the recipe's `content: 'markdown'` spaces as Prose.
 */
export const ChatMessageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The sender's picture: an `Avatar`, or nothing in a continued message, which keeps its room. */
  avatar: Slot.make({ capability: Capability.Container }),
  main: Slot.make({ capability: Capability.Container }),
  /** The author and the time; a continued message hides it from sight but not from a reader. */
  header: Slot.make({ capability: Capability.Container }),
  author: Slot.make({ capability: Capability.Container }),
  time: Slot.make({ capability: Capability.Container }),
  /** The frame the body sits in: a bubble for the user's messages in the default look. */
  bubble: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  /** The status and the actions, its height kept so revealing the actions moves nothing. */
  footer: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  actions: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  action: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaPressed, Attr.AriaDisabled],
  }),
})

/** Who a message is from: the user's own, an assistant's (or another person's), or the system's. */
export type ChatMessageFrom = 'user' | 'assistant' | 'system'

/** Where a message the user sent stands: on its way, received, or refused. */
export type ChatMessageStatus = 'sending' | 'sent' | 'failed'

const statusWords: Readonly<Record<ChatMessageStatus, string>> = {
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Not sent',
}

/** One thing a message offers: copy, edit, regenerate, a thumb up. */
export interface ChatMessageAction<Message> {
  /** Keeps the button's DOM when the actions before it change. */
  readonly key: string
  /** The button's accessible name, and its words when it has no icon. */
  readonly label: string
  /** What the button shows in place of its label, which a reader still hears. */
  readonly icon?: Html | undefined
  readonly onClick: Message
  /** A toggle's state (a thumb up given), as `aria-pressed`. */
  readonly pressed?: boolean | undefined
  readonly disabled?: boolean | undefined
}

/** When a message was sent: `at` for the machine (`datetime`), `label` for the reader. */
export interface ChatMessageTime {
  readonly at: string
  readonly label: string
}

/**
 * A message in one call: who sent it and when, what it says, where it
 * stands, what it offers, a style for its slots, and mixins beside the
 * style. No upstream component stands behind it.
 */
export interface ChatMessageView<Message = never> {
  readonly from: ChatMessageFrom
  /** Plain text, or Html such as rendered Markdown. */
  readonly content: Html | string
  readonly author?: string | undefined
  /** The sender's picture, such as an `Avatar.view`. */
  readonly avatar?: Html | undefined
  readonly time?: ChatMessageTime | undefined
  readonly status?: ChatMessageStatus | undefined
  /** The status as shown and read; `Sending…`, `Sent` or `Not sent` when omitted. */
  readonly statusLabel?: string | undefined
  /** What the retry button beside a failed status sends; a failed message without it draws none. */
  readonly onRetry?: Message | undefined
  /** Default `Retry`. */
  readonly retryLabel?: string | undefined
  readonly actions?: ReadonlyArray<ChatMessageAction<Message>> | undefined
  /** Names the actions as a group; default `Message actions`. */
  readonly actionsLabel?: string | undefined
  /**
   * Shows the actions at rest, as the latest answer shows its own; others
   * reveal theirs on hover or focus, and always where nothing can hover.
   */
  readonly pinActions?: boolean | undefined
  /** The content is still arriving: the root is `aria-busy` and carries `data-streaming`. */
  readonly streaming?: boolean | undefined
  /** Follows a message by the same sender: no picture, and a header only a reader meets. */
  readonly continued?: boolean | undefined
  /** A style of `ChatMessageSlots`, for the message's look. */
  readonly style?: NamedStyle<typeof ChatMessageSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const flag = (on: boolean | undefined) => (on === true ? 'true' : 'false')

const draw = <Message>(
  options: ChatMessageView<Message>,
  h: HtmlBuilder<Message>,
  key: string | undefined,
): Html => {
  const builders = SlotView.buildersFor(
    ChatMessageSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const continued = options.continued === true
  const { status, time, onRetry } = options
  const actions = options.actions ?? []
  const header =
    options.author === undefined && time === undefined
      ? []
      : [
          h.div(builders.header.attrs([h.DataAttribute('continued', flag(continued))]), [
            ...(options.author === undefined
              ? []
              : [h.span(builders.author.attrs(), [options.author])]),
            ...(time === undefined
              ? []
              : [h.time(builders.time.attrs([h.Attribute('datetime', time.at)]), [time.label])]),
          ]),
        ]
  const footer =
    status === undefined && actions.length === 0
      ? []
      : [
          h.div(builders.footer.attrs(), [
            ...(status === undefined
              ? []
              : [h.span(builders.status.attrs(), [options.statusLabel ?? statusWords[status]])]),
            ...(status === 'failed' && onRetry !== undefined
              ? [
                  h.button(builders.retry.attrs([h.Type('button'), h.OnClick(onRetry)]), [
                    options.retryLabel ?? 'Retry',
                  ]),
                ]
              : []),
            ...(actions.length === 0
              ? []
              : [
                  h.div(
                    builders.actions.attrs([
                      h.Role('group'),
                      h.AriaLabel(options.actionsLabel ?? 'Message actions'),
                      h.DataAttribute('pinned', flag(options.pinActions)),
                    ]),
                    actions.map(action =>
                      h.button(
                        builders.action.attrs([
                          h.Key(action.key),
                          h.Type('button'),
                          h.AriaLabel(action.label),
                          h.Title(action.label),
                          ...(action.pressed === undefined
                            ? []
                            : [h.AriaPressed(flag(action.pressed))]),
                          // `aria-disabled`, so the button keeps the focus it may hold.
                          ...(action.disabled === true
                            ? [h.AriaDisabled(true)]
                            : [h.OnClick(action.onClick)]),
                        ]),
                        [action.icon ?? action.label],
                      ),
                    ),
                  ),
                ]),
          ]),
        ]
  return h.div(
    builders.root.attrs([
      h.DataAttribute('from', options.from),
      h.DataAttribute('continued', flag(continued)),
      h.DataAttribute('streaming', flag(options.streaming)),
      ...(status === undefined ? [] : [h.DataAttribute('status', status)]),
      ...(options.streaming === true ? [h.AriaBusy(true)] : []),
      ...(key === undefined ? [] : [h.Key(key)]),
    ]),
    [
      ...(options.avatar === undefined
        ? []
        : [h.div(builders.avatar.attrs(), continued ? [] : [options.avatar])]),
      h.div(builders.main.attrs(), [
        ...header,
        h.div(builders.bubble.attrs(), [h.div(builders.body.attrs(), [options.content])]),
        ...footer,
      ]),
    ],
  )
}

export const view = <Message = never>(
  options: ChatMessageView<Message>,
  h: HtmlBuilder<Message>,
): Html => draw(options, h, undefined)

/** A run of messages: each `ChatMessageSlots` message, the root only their frame. */
export const ChatMessageGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

/** A message of a group, keyed; the group decides whether it continues the one before. */
export type ChatMessageItem<Message> = Omit<
  ChatMessageView<Message>,
  'style' | 'mixins' | 'continued'
> & { readonly key: string }

/** Messages in order, those that follow one by the same sender drawn as continued. */
export interface ChatMessageGroupView<Message = never> {
  readonly items: ReadonlyArray<ChatMessageItem<Message>>
  /**
   * Whether `next` continues `previous`: by default the same `from` and the
   * same `author`. Pass one that also reads the times to start a run again
   * after a pause.
   */
  readonly continues?:
    | ((previous: ChatMessageItem<Message>, next: ChatMessageItem<Message>) => boolean)
    | undefined
  /** A style of `ChatMessageGroupSlots`, for the run. */
  readonly style?: NamedStyle<typeof ChatMessageGroupSlots> | undefined
  /** A style of `ChatMessageSlots` for every message. */
  readonly messageStyle?: NamedStyle<typeof ChatMessageSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const sameSender = <Message>(
  previous: ChatMessageItem<Message>,
  next: ChatMessageItem<Message>,
): boolean => previous.from === next.from && previous.author === next.author

export const group = <Message = never>(
  options: ChatMessageGroupView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ChatMessageGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const continues = options.continues ?? sameSender
  return h.div(
    builders.root.attrs(),
    options.items.map((item, place) => {
      const { key, ...message } = item
      const previous = options.items[place - 1]
      return draw(
        {
          ...message,
          continued: previous !== undefined && continues(previous, item),
          style: options.messageStyle,
        },
        h,
        key,
      )
    }),
  )
}
