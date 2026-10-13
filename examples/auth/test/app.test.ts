// @vitest-environment jsdom
/**
 * The application's `update` on a change of principal: a sign-in or sign-out
 * here drops what Remote read and tells the other tabs; another tab's post
 * drops it too, and tells no one. The Model starts as ada's, read through the
 * real server's handlers.
 */
import { Effect, Option } from 'effect'
import { Surface } from 'foldkit-surface'
import { BroadcastMessage } from 'foldkit-primitives/net'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  Data,
  Message,
  type Model,
  NoteList,
  PRINCIPAL_CHANNEL,
  Session,
  initial,
  update,
} from '../src/app.js'
import { accounts, server } from '../src/server.js'

let read: Model
beforeAll(async () => {
  const ada = accounts.find(account => account.subjectId === 'ada')!.user
  read = await Effect.runPromise(
    Data.satisfy(
      { ...initial, password: 'ada password' },
      { session: Surface.at(Session, undefined), notes: Surface.at(NoteList, undefined) },
    ).pipe(Effect.provide(Remote.clientLayer(RemoteServer.handlers(server, Option.some(ada))))),
  )
})

const meOf = (model: Model) => Surface.read(Session, model).me._tag
const notesOf = (model: Model) => Surface.read(NoteList, model).notes._tag

/** The Commands `update` returned, by name and args. */
const commandsOf = (returned: ReturnType<typeof update>) =>
  (returned.commands ?? []).map(command => ({ name: command.name, args: command.args }))

describe('a change of principal', () => {
  it('starts from what was read as ada', () => {
    expect([meOf(read), notesOf(read)]).toEqual(['Ready', 'Ready'])
  })

  it.each([
    ['a sign-in', Message.SucceededSignIn()],
    ['a sign-out', Message.SucceededSignOut()],
  ])('forgets what was read and tells the other tabs on %s here', (_, message) => {
    const returned = update(read, message)
    expect([meOf(returned.model), notesOf(returned.model)]).toEqual(['Initial', 'Initial'])
    expect(returned.model.password).toBe('')
    expect(commandsOf(returned)).toEqual([
      { name: 'Broadcast.post', args: { name: PRINCIPAL_CHANNEL, data: 'changed' } },
    ])
  })

  it("forgets what was read on another tab's post, and keeps what was typed", () => {
    const returned = update(
      read,
      Message.GotBroadcastMessage({ message: BroadcastMessage.Received({ data: 'changed' }) }),
    )
    expect([meOf(returned.model), notesOf(returned.model)]).toEqual(['Initial', 'Initial'])
    expect(returned.model.password).toBe('ada password')
    expect(commandsOf(returned)).toEqual([])
  })

  it('changes nothing when its own post went out', () => {
    expect(
      update(read, Message.GotBroadcastMessage({ message: BroadcastMessage.Posted() })).model,
    ).toBe(read)
  })

  it('keeps what was read when a sign-in fails, and says why', () => {
    const { model } = update(read, Message.FailedSignIn({ reason: 'No.' }))
    expect([meOf(model), notesOf(model)]).toEqual(['Ready', 'Ready'])
    expect(model.notice).toEqual(Option.some('No.'))
  })

  it('signs in with what was typed', () => {
    const typed = [
      Message.ChangedEmail({ value: 'ada@example.invalid' }),
      Message.ChangedPassword({ value: 'ada password' }),
    ].reduce((model, message) => update(model, message).model, initial)
    expect(commandsOf(update(typed, Message.SubmittedSignIn()))).toEqual([
      { name: 'SignIn', args: { email: 'ada@example.invalid', password: 'ada password' } },
    ])
  })
})
