import { Array, Duration, Effect, Match, Option, Schema, Stream } from 'effect'
import { Command, Runtime, Subscription, type Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style } from 'foldkit-mixins'

import { GAME, GAME_SPEED } from './constants.js'
import { Apple, Direction, Position, Snake } from './domain/index.js'
import { BoardSlots, BoardStyle, SnakeSlots, SnakeStyle } from './style.js'

// MODEL

export const GameState = Schema.Literals(['NotStarted', 'Playing', 'Paused', 'GameOver'])
export type GameState = typeof GameState.Type

export const Model = Schema.Struct({
  snake: Snake.Snake,
  apple: Position.Position,
  direction: Direction.Direction,
  nextDirection: Direction.Direction,
  gameState: GameState,
  points: Schema.Number,
  highScore: Schema.Number,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  TickedClock: {},
  PressedKey: { key: Schema.String },
  PausedGame: {},
  RestartedGame: {},
  CompletedGenerateApplePosition: { position: Position.Position },
})

export type Message = typeof Message.Type

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const snake = Snake.create(GAME.INITIAL_POSITION)

  return {
    model: {
      snake,
      apple: { x: 15, y: 15 },
      direction: GAME.INITIAL_DIRECTION,
      nextDirection: GAME.INITIAL_DIRECTION,
      gameState: 'NotStarted',
      points: 0,
      highScore: 0,
    },
    commands: [GenerateApplePosition({ snake: snake })],
  }
}

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    PressedKey: ({ key }) =>
      Match.value(key).pipe(
        Match.withReturnType<UpdateReturn>(),
        Match.whenOr(
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'w',
          'a',
          's',
          'd',
          moveKey => {
            const nextDirection = Match.value(moveKey).pipe(
              Match.withReturnType<Direction.Direction>(),
              Match.whenOr('ArrowUp', 'w', () => 'Up'),
              Match.whenOr('ArrowDown', 's', () => 'Down'),
              Match.whenOr('ArrowLeft', 'a', () => 'Left'),
              Match.whenOr('ArrowRight', 'd', () => 'Right'),
              Match.exhaustive,
            )

            if (model.gameState === 'Playing') {
              return {
                model: modifyFields(model, {
                  nextDirection: () => nextDirection,
                }),
              }
            } else {
              return { model }
            }
          },
        ),
        Match.when(' ', () => {
          const nextGameState = Match.value(model.gameState).pipe(
            Match.withReturnType<GameState>(),
            Match.when('NotStarted', () => 'Playing'),
            Match.when('Playing', () => 'Paused'),
            Match.when('Paused', () => 'Playing'),
            Match.when('GameOver', () => 'GameOver'),
            Match.exhaustive,
          )
          return {
            model: modifyFields(model, {
              gameState: () => nextGameState,
            }),
          }
        }),
        Match.when('r', () => {
          const nextSnake = Snake.create(GAME.INITIAL_POSITION)

          return {
            model: modifyFields(model, {
              snake: () => nextSnake,
              direction: () => GAME.INITIAL_DIRECTION,
              nextDirection: () => GAME.INITIAL_DIRECTION,
              gameState: () => 'NotStarted',
              points: () => 0,
            }),
            commands: [GenerateApplePosition({ snake: nextSnake })],
          }
        }),
        Match.orElse(() => ({ model })),
      ),

    TickedClock: () => {
      if (model.gameState !== 'Playing') {
        return { model }
      }

      const currentDirection = Direction.isOpposite(model.direction, model.nextDirection)
        ? model.direction
        : model.nextDirection

      const newHead = Position.move(model.snake[0], currentDirection)
      const willEatApple = Position.equivalence(newHead, model.apple)

      const nextSnake = willEatApple
        ? Snake.grow(model.snake, currentDirection)
        : Snake.move(model.snake, currentDirection)

      if (Snake.hasCollision(nextSnake)) {
        return {
          model: modifyFields(model, {
            gameState: () => 'GameOver',
            highScore: highScore => Math.max(model.points, highScore),
          }),
        }
      }

      const commands = willEatApple ? [GenerateApplePosition({ snake: nextSnake })] : []

      return {
        model: modifyFields(model, {
          snake: () => nextSnake,
          direction: () => currentDirection,
          points: points => (willEatApple ? points + GAME.POINTS_PER_APPLE : points),
        }),
        commands,
      }
    },

    PausedGame: () => ({
      model: modifyFields(model, {
        gameState: gameState => (gameState === 'Playing' ? 'Paused' : 'Playing'),
      }),
    }),

    RestartedGame: () => {
      const startPosition: Position.Position = { x: 10, y: 10 }
      const nextSnake = Snake.create(startPosition)

      return {
        model: modifyFields(model, {
          snake: () => nextSnake,
          direction: () => 'Right',
          nextDirection: () => 'Right',
          gameState: () => 'NotStarted',
          points: () => 0,
        }),
        commands: [GenerateApplePosition({ snake: nextSnake })],
      }
    },

    CompletedGenerateApplePosition: ({ position }) => ({
      model: modifyFields(model, {
        apple: () => position,
      }),
    }),
  })

// COMMAND

export const GenerateApplePosition = Command.define('GenerateApplePosition', {
  args: { snake: Snake.Snake },
  messages: [Message.CompletedGenerateApplePosition],
  execute: ({ snake }) =>
    Apple.generatePosition(snake).pipe(
      Effect.map(position => Message.CompletedGenerateApplePosition({ position })),
    ),
})

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()(entry => ({
  gameClock: entry(
    {
      isPlaying: Schema.Boolean,
      interval: Schema.Number,
    },
    {
      modelToDependencies: model => ({
        isPlaying: model.gameState === 'Playing',
        interval: Math.max(GAME_SPEED.MIN_INTERVAL, GAME_SPEED.BASE_INTERVAL - model.points),
      }),
      dependenciesToStream: ({ isPlaying, interval }) =>
        Stream.when(
          Stream.tick(Duration.millis(interval)).pipe(Stream.map(Message.TickedClock)),
          Effect.sync(() => isPlaying),
        ),
    },
  ),

  keyboard: Subscription.persistent(
    Subscription.fromEventFilterMapPreventDefault({
      // Read when the Subscription starts, not on import, so the module loads
      // without a DOM (the story and view tests, a server).
      target: () => document,
      type: 'keydown',
      filterMapEvent: keyboardEvent => Option.some(Message.PressedKey({ key: keyboardEvent.key })),
    }),
  ),
}))

// VIEW

/** What one cell of the board shows. Drawn as `data-cell`, which `BoardStyle` colors. */
export type Cell = 'Empty' | 'Head' | 'Body' | 'Apple'

/**
 * Each row of the board as its cells' names joined by spaces. A row is text,
 * compared by value, so the lazy row below is drawn again only when one of
 * its cells changed: a tick redraws the few rows the snake and the apple
 * touch, not all of them. Painted once per render, so no cell searches the
 * snake. Later paints win: the head over the body over the apple, as
 * upstream's `cellClass` orders them.
 */
const boardRows = (model: Model): ReadonlyArray<string> => {
  const cells = Array.makeBy(GAME.GRID_SIZE, () =>
    Array.makeBy<Cell>(GAME.GRID_SIZE, () => 'Empty'),
  )
  const paint = ({ x, y }: Position.Position, cell: Cell): void => {
    cells[y]![x] = cell
  }
  paint(model.apple, 'Apple')
  Array.forEach(Array.tailNonEmpty(model.snake), segment => paint(segment, 'Body'))
  paint(model.snake[0], 'Head')
  return Array.map(cells, row => row.join(' '))
}

const drawRow = (
  slots: SlotView.SlotBuilders<typeof BoardSlots, Message>,
  h: HtmlBuilder<Message>,
  { cells }: { readonly cells: string },
): Html =>
  h.div(
    slots.row.attrs(),
    cells.split(' ').map(cell => h.div(slots.cell.attrs([h.DataAttribute('cell', cell)]))),
  )

export const Board = SlotView.forMessages<Message>()
  .define(BoardSlots, (model: Model, slots, h) =>
    h.div(
      slots.board.attrs(),
      boardRows(model).map((cells, y) => slots.row.lazy({ index: y }, drawRow, { cells })),
    ),
  )
  .pipe(Style.attach(BoardStyle))

const gameStateView = (gameState: GameState): string =>
  Match.value(gameState).pipe(
    Match.when('NotStarted', () => 'Press SPACE to start'),
    Match.when('Playing', () => 'Playing - SPACE to pause'),
    Match.when('Paused', () => 'Paused - SPACE to continue'),
    Match.when('GameOver', () => 'Game Over - Press R to restart'),
    Match.exhaustive,
  )

export const Game = SlotView.forMessages<Message>()
  .define(SnakeSlots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h1(slots.title.attrs(), ['Snake Game']),
      h.div(slots.scores.attrs(), [
        h.p(slots.score.attrs(), [`Score: ${model.points}`]),
        h.p(slots.score.attrs(), [`High Score: ${model.highScore}`]),
      ]),
      h.p(slots.status.attrs(), [gameStateView(model.gameState)]),
      Board(model, h),
      h.div(slots.instructions.attrs(), [
        h.p(slots.instruction.attrs(), ['Use ARROW KEYS or WASD to move']),
        h.p(slots.instruction.attrs(), ['SPACE to pause/start']),
        h.p(slots.instruction.attrs(), ['R to restart']),
      ]),
    ]),
  )
  .pipe(Style.attach(SnakeStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `Snake | ${model.points} pts`,
  body: Game(model, h),
})
