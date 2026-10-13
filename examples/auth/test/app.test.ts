// @vitest-environment jsdom
/**
 * The application's `update` on a change of principal: a sign-in or sign-out
 * here drops what Remote read and tells the other tabs; another tab's post
 * drops it too, and tells no one. The Model starts as ada's, read through the
 * real server's handlers.
 */
import { Effect, Option, Redacted } from 'effect'
import { SUBJECT_CHANGED } from 'foldkit-auth'
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
  TAB,
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
      { name: 'Broadcast.post', args: { name: PRINCIPAL_CHANNEL, data: TAB } },
    ])
  })

  it("forgets what was read on another tab's post, and keeps what was typed", () => {
    const returned = update(
      read,
      Message.GotBroadcastMessage({ message: BroadcastMessage.Received({ data: 'another tab' }) }),
    )
    expect([meOf(returned.model), notesOf(returned.model)]).toEqual(['Initial', 'Initial'])
    expect(returned.model.password).toBe('ada password')
    expect(commandsOf(returned)).toEqual([])
  })

  it.each([
    ['its own post went out', BroadcastMessage.Posted()],
    [
      'it hears its own post, a change it has already made',
      BroadcastMessage.Received({ data: TAB }),
    ],
  ])('changes nothing when %s', (_, message) => {
    expect(update(read, Message.GotBroadcastMessage({ message })).model).toBe(read)
  })

  it('says so when the other tabs could not be told, and keeps what was read', () => {
    const { model } = update(
      read,
      Message.GotBroadcastMessage({
        message: BroadcastMessage.BroadcastFailed({ message: 'No channel.' }),
      }),
    )
    expect([meOf(model), notesOf(model)]).toEqual(['Ready', 'Ready'])
    expect(model.notice).toEqual(Option.some('Other tabs were not told: No channel.'))
  })

  it.each([
    ['a sign-in', Message.SucceededSignIn()],
    ['a sign-out', Message.SucceededSignOut()],
  ])('clears the last notice on %s', (_, message) => {
    const noticed = update(read, Message.FailedSignIn({ reason: 'No.' })).model
    expect(update(noticed, message).model.notice).toEqual(Option.none())
  })

  it('asks who it is again when a sign-out fails, as the server may have signed out', () => {
    const { model } = update(read, Message.FailedSignOut({ reason: 'Could not sign out.' }))
    expect(meOf(model)).toBe('Initial')
    expect(model.notice).toEqual(Option.some('Could not sign out.'))
  })

  it('keeps what was read when a sign-in fails, and says why', () => {
    const { model } = update(read, Message.FailedSignIn({ reason: 'No.' }))
    expect([meOf(model), notesOf(model)]).toEqual(['Ready', 'Ready'])
    expect(model.notice).toEqual(Option.some('No.'))
  })

  it.each([
    [
      'ReadFailed',
      (error: { _tag: string; message: string; reason: string }) =>
        Remote.Message.ReadFailed({ requests: [], error }),
    ],
    [
      'QueryFailed',
      (error: { _tag: string; message: string; reason: string }) =>
        Remote.Message.QueryFailed({ connection: 'Notes', error }),
    ],
  ])('forgets everything on a %s refused because who is signed in changed', (_, failed) => {
    const refused = (reason: string) =>
      update(
        read,
        Message.GotRemoteMessage({
          message: failed({ _tag: 'Unauthenticated', message: reason, reason }),
        }),
      ).model
    expect([meOf(refused(SUBJECT_CHANGED)), notesOf(refused(SUBJECT_CHANGED))]).toEqual([
      'Initial',
      'Initial',
    ])
    // A session that ended is shown, not forgotten: forgetting would ask again forever.
    expect(meOf(refused('Your session ended.'))).toBe('Ready')
  })

  it('signs in with what was typed', () => {
    const typed = [
      Message.ChangedEmail({ value: 'ada@example.invalid' }),
      Message.ChangedPassword({ value: 'ada password' }),
    ].reduce((model, message) => update(model, message).model, initial)
    const [signIn] = commandsOf(update(typed, Message.SubmittedSignIn()))
    expect(signIn?.name).toBe('SignIn')
    const { email, password } = signIn!.args as { email: string; password: Redacted.Redacted }
    expect([email, Redacted.value(password)]).toEqual(['ada@example.invalid', 'ada password'])
    // What a span or DevTools records of the args shows no password.
    expect(JSON.stringify(signIn!.args)).not.toContain('ada password')
  })
})
