/**
 * The board as one SlotView over four attachments on two Slots: the board
 * takes the arrows (`SpatialNavigation`), the lasso (`Marquee`) and the
 * listbox state (`Selection`); each card takes its roving stop, its mark for
 * the lasso, its id and `aria-selected`. A card is a button, so Space presses
 * it and `Selection`'s click wiring is the keyboard's way to select too.
 */
import { Match, Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { LiveAnnounce, Marquee, Selection, SpatialNavigation } from 'foldkit-primitives/interaction'
import { active, control, focus, panel, t } from '../style.js'
import { BOARD, Message, Nav, Picks, navArgs, pickArgs, type Card, type Model } from './app.js'

export const BoardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  board: Slot.make({ capability: Capability.Container }),
  card: Slot.make({ capability: Capability.Focusable }),
  lasso: Slot.make({ capability: Capability.Base }),
  clear: Slot.make({ capability: Capability.Interactive }),
  live: Slot.make({ capability: Capability.Container }),
})

const Board = SlotView.over(BoardSlots)<Model, Message>()

const itemsByCards = new WeakMap<ReadonlyArray<Card>, Behaviors.Collection.Items<Card>>()

/** The cards as one Collection, built once per list of cards: every behavior and card asks for it. */
export const itemsOf = (model: Model): Behaviors.Collection.Items<Card> => {
  const known = itemsByCards.get(model.cards)
  if (known !== undefined) return known
  const items = Behaviors.Collection.of(model.cards, { id: card => card.id })
  itemsByCards.set(model.cards, items)
  return items
}

export const Arrows = SpatialNavigation.behavior(Nav, navArgs)(Board)({
  container: 'board',
  item: 'card',
  items: itemsOf,
})

export const Picked = Selection.behavior(Picks, pickArgs)(Board)({
  container: 'board',
  item: 'card',
  items: itemsOf,
})

/** The attribute that marks a card for the lasso, holding its id. */
export const CARD_MARK = 'data-card'

export const Lassos = Marquee.behavior(Board)({
  container: 'board',
  attribute: CARD_MARK,
  toMessage: fact =>
    Match.valueTags(fact, {
      MarqueeStarted: ({ additive }) => Message.LassoStarted({ additive }),
      MarqueeChanged: ({ rect, ids, additive }) => Message.LassoChanged({ rect, ids, additive }),
      MarqueeEnded: ({ ids, additive }) => Message.LassoEnded({ ids, additive }),
      MarqueeCancelled: () => Message.LassoCancelled(),
    }),
})

export const Ids = Behaviors.Collection.behavior(Board)({ item: 'card', items: itemsOf })

export const BoardStyle = Style.forSlots(BoardSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.xs, justifyItems: 'start' }),
    board: Style.compose(
      panel,
      Style.self({
        position: 'relative',
        inlineSize: 'var(--board-width)',
        blockSize: 'var(--board-height)',
        userSelect: 'none',
        overflow: 'hidden',
      }),
    ),
    card: Style.compose(
      control,
      focus,
      active,
      Style.self({
        position: 'absolute',
        insetInlineStart: 'var(--card-x)',
        insetBlockStart: 'var(--card-y)',
        inlineSize: 'var(--card-width)',
        blockSize: 'var(--card-height)',
        paddingBlock: '0',
        paddingInline: '0',
      }),
      Style.pseudo('[aria-selected="true"]', { borderColor: t.outline.focus }),
    ),
    lasso: Style.self({
      position: 'absolute',
      insetInlineStart: 'var(--lasso-x)',
      insetBlockStart: 'var(--lasso-y)',
      inlineSize: 'var(--lasso-width)',
      blockSize: 'var(--lasso-height)',
      border: `${t.border.thin} dashed ${t.outline.focus}`,
      background: t.surface.muted,
      opacity: '0.6',
      pointerEvents: 'none',
    }),
    clear: Style.compose(control, focus),
    // Spoken, never drawn: `display: none` would silence the regions.
    live: Style.nest('& [data-foldkit-plus-live]', {
      position: 'absolute',
      inlineSize: '1px',
      blockSize: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    }),
  },
  { name: 'BoardStyle' },
)

const px = (value: number): string => `${value}px`

export const SelectableBoard = Board.define((model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.div(
      slots.board.attrs([
        h.Role('listbox'),
        h.AriaLabel('Cards'),
        h.Style({ '--board-width': px(BOARD.width), '--board-height': px(BOARD.height) }),
      ]),
      [
        ...model.cards.map((card, index) =>
          h.button(
            slots.card.attrs(
              [
                h.Key(card.id),
                h.Type('button'),
                h.Role('option'),
                h.DataAttribute('card', card.id),
                h.Style({
                  '--card-x': px(card.x),
                  '--card-y': px(card.y),
                  '--card-width': px(card.width),
                  '--card-height': px(card.height),
                }),
              ],
              { index, id: card.id },
            ),
            [card.label],
          ),
        ),
        ...Option.match(model.lasso, {
          onNone: () => [],
          onSome: ({ rect }) => [
            h.div(
              slots.lasso.attrs([
                h.Key('lasso'),
                h.Style({
                  '--lasso-x': px(rect.x),
                  '--lasso-y': px(rect.y),
                  '--lasso-width': px(rect.width),
                  '--lasso-height': px(rect.height),
                }),
              ]),
              [],
            ),
          ],
        }),
      ],
    ),
    h.button(slots.clear.attrs([h.Type('button'), h.OnClick(Message.ClearedSelection())]), [
      'Clear selection',
    ]),
    h.div(slots.live.attrs(), [LiveAnnounce.view(model.live, h)]),
  ]),
).pipe(
  Behavior.attach(Arrows),
  Behavior.attach(Picked),
  Behavior.attach(Lassos),
  Behavior.attach(Ids),
  Style.attach(BoardStyle),
)
