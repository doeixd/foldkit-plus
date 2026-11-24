import { Effect, Layer } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Action,
  Checkbox,
  KeyedList,
  Text,
  TextInput,
  type Requirements,
} from 'foldkit-successor/surface'
import { todoSurface } from './fixtures/todoSurface.js'
import { initial } from './fixtures/todos.js'

const todos = todoSurface(['7', '8'])
expectTypeOf<Requirements<typeof todos>>().toEqualTypeOf<
  Action | Checkbox | KeyedList | Text | TextInput
>()

const surface = todos.mount({ ...initial('work'), draft: '' })
const set = () => {}
const terminalWithoutCheckbox = Layer.mergeAll(
  Layer.succeed(Action, { set }),
  Layer.succeed(KeyedList, { set }),
  Layer.succeed(TextInput, { set }),
  Layer.succeed(Text, { set }),
)
const partial = Effect.provide(surface, terminalWithoutCheckbox)
expectTypeOf<Effect.Services<typeof partial>>().toEqualTypeOf<Checkbox>()
// @ts-expect-error Todos.rows' completion slot needs Checkbox from the renderer.
Effect.runSync(partial)
Effect.runSync(Effect.provideService(partial, Checkbox, { set }))
