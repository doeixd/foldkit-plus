import type { Effect } from 'effect'
import type { RemoteMessage, RemoteMessageInput } from '../src/model.js'

// TypeScript infers one type from several Effects (a page's commands, each over
// a bundle's Messages beside Remote's) as the one that is a strict *subtype*
// of the rest, and a strict subtype must declare every optional property of
// its supertype. A field `remoteMessageCases` gives that `RemoteMessage` omits
// leaves `RemoteMessage` outside the application's Message union, so a
// function generic over an Effect's value could not take its commands
// (`settled` was `unknown`).
declare const pick: <T>(a: T, b: T) => T
declare const message: RemoteMessage
declare const input: RemoteMessageInput
// `message` is first: were it no subtype of `input`, `T` would be `RemoteMessage`
// and `input`, whose runtime slots are `unknown`, would be refused.
pick(message, input)

declare const settle: <A>(effect: Effect.Effect<A>) => A
declare const commands: Effect.Effect<RemoteMessage> | Effect.Effect<RemoteMessageInput>
settle(commands)
