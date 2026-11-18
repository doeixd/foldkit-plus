import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

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
  /** The reactions under the bubble: pills of a mark and a count. */
  reactions: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  /** One reaction; a button when it has an `onClick`, a mark otherwise. */
  reaction: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaPressed],
  }),
  /** How many gave a reaction. */
  reactionCount: Slot.make({ capability: Capability.Container }),
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

/** The text a message draws that is not one use's content. */
export interface ChatMessageWords {
  /** Where a message stands: on its way, received, refused. */
  readonly sending: string
  readonly sent: string
  readonly failed: string
  /** The retry button beside a failed message. */
  readonly retry: string
  /** Names the actions as a group. */
  readonly actions: string
  /** Names the reactions as a group. */
  readonly reactions: string
  /** A reaction's name for a reader; `{label}` and `{count}`. */
  readonly reactionCount: string
}

export const words: ChatMessageWords = {
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Not sent',
  retry: 'Retry',
  actions: 'Message actions',
  reactions: 'Reactions',
  reactionCount: '{label}, {count}',
}

/** An emoji or a glyph someone gave a message, with how many did. */
export interface ChatMessageReaction<Message> {
  /** Keeps the reaction's DOM when the ones before it change. */
  readonly key: string
  /** What is drawn: an emoji or a glyph. */
  readonly mark: string
  /** Its name for a reader: `Thumbs up`. */
  readonly label: string
  readonly count?: number | undefined
  /** A toggle's state (you gave this one), as `aria-pressed`. */
  readonly pressed?: boolean | undefined
  /** Makes it a button that sends this; without it the reaction is shown, not pressed. */
  readonly onClick?: Message | undefined
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
  /** The status, the retry and the groups' names. */
  readonly words?: Partial<ChatMessageWords> | undefined
  /** What the retry button beside a failed status sends; a failed message without it draws none. */
  readonly onRetry?: Message | undefined
  /** Pressable or shown reactions under the bubble, before the footer. */
  readonly reactions?: ReadonlyArray<ChatMessageReaction<Message>> | undefined
  readonly actions?: ReadonlyArray<ChatMessageAction<Message>> | undefined
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
  const text = wordsOf(words, options.words)
  const reactions = options.reactions ?? []
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
            ...(status === undefined ? [] : [h.span(builders.status.attrs(), [text[status]])]),
            ...(status === 'failed' && onRetry !== undefined
              ? [
                  h.button(builders.retry.attrs([h.Type('button'), h.OnClick(onRetry)]), [
                    text.retry,
                  ]),
                ]
              : []),
            ...(actions.length === 0
              ? []
              : [
                  h.div(
                    builders.actions.attrs([
                      h.Role('group'),
                      h.AriaLabel(text.actions),
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
        ...(reactions.length === 0
          ? []
          : [
              h.div(
                builders.reactions.attrs([h.Role('group'), h.AriaLabel(text.reactions)]),
                reactions.map(reaction => {
                  const count = reaction.count
                  const inner: ReadonlyArray<Html | string> = [
                    reaction.mark,
                    ...(count === undefined
                      ? []
                      : [
                          h.span(builders.reactionCount.attrs([h.AriaHidden(true)]), [
                            String(count),
                          ]),
                        ]),
                  ]
                  const name = h.AriaLabel(
                    count === undefined
                      ? reaction.label
                      : fill(text.reactionCount, { label: reaction.label, count }),
                  )
                  return reaction.onClick === undefined
                    ? h.span(
                        builders.reaction.attrs([h.Key(reaction.key), h.Role('img'), name]),
                        inner,
                      )
                    : h.button(
                        builders.reaction.attrs([
                          h.Key(reaction.key),
                          h.Type('button'),
                          name,
                          ...(reaction.pressed === undefined
                            ? []
                            : [h.AriaPressed(flag(reaction.pressed))]),
                          h.OnClick(reaction.onClick),
                        ]),
                        inner,
                      )
                }),
              ),
            ]),
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

/** What a ChatMessage is given once: its look, words and how its actions show. */
export type ChatMessagePreset = Pick<ChatMessageView<never>, 'style' | 'words' | 'pinActions'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own ChatMessage: `view` and `group` over `base` for every
 * use, `presets` chosen at a use with `preset`, and the call over both.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ChatMessagePreset, Names>,
): {
  readonly view: <Outer>(
    options: ChatMessageView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly group: <Outer>(
    options: ChatMessageGroupView<Outer> & {
      readonly preset?: [Names] extends [never] ? undefined : Names
    },
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
  group: (options, h) => {
    const { preset, items, messageStyle, ...rest } = options
    // A run takes the preset's look for its messages (their mixins stay the
    // view's), and its words and pinned actions for each, unless a message says.
    const given = layered<ChatMessagePreset & { readonly preset?: string }>(
      config,
      preset === undefined ? {} : { preset },
    )
    return group(
      {
        ...rest,
        messageStyle: messageStyle ?? given.style,
        items: items.map(item => ({
          ...item,
          words: { ...given.words, ...item.words },
          pinActions: item.pinActions ?? given.pinActions,
        })),
      },
      h,
    )
  },
})
