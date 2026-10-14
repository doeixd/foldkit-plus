// @vitest-environment jsdom
/**
 * The application's `update` on a change of principal: a sign-in or sign-out
 * here drops what Remote read and tells the other tabs; another tab's post
 * drops it too, and tells no one. The Model starts as ada's, read through the
 * real server's handlers.
 */
import { Effect, Option, Redacted } from 'effect'
import { fromString } from 'foldkit/url'
import { SUBJECT_CHANGED } from 'foldkit-auth'
import { ME } from 'foldkit-guard'
import { Surface } from 'foldkit-surface'
import { BroadcastMessage } from 'foldkit-primitives/net'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  AppRoute,
  Data,
  Message,
  type Model,
  NoteList,
  PRINCIPAL_CHANNEL,
  Session,
  TAB,
  accessOf,
  actives,
  initial,
  update,
} from '../src/app.js'
import { type User } from '../src/domain.js'
import { accounts, server } from '../src/server.js'

const ada = accounts.find(account => account.subjectId === 'ada')!.user

/** Remote answering as `principal`, through the real server's handlers. */
const as = (principal: Option.Option<User>) =>
  Remote.clientLayer(RemoteServer.handlers(server, principal))

let read: Model
let visitor: Model
beforeAll(async () => {
  read = await Effect.runPromise(
    Data.satisfy(
      { ...initial, password: 'ada password' },
      { session: Surface.at(Session, undefined), notes: Surface.at(NoteList, undefined) },
    ).pipe(Effect.provide(as(Option.some(ada)))),
  )
  visitor = await Effect.runPromise(
    Data.satisfy(initial, actives).pipe(Effect.provide(as(Option.none()))),
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

  it("lets go of its belief on another tab's post, then forgets what was read", () => {
    const heard = update(
      read,
      Message.GotBroadcastMessage({ message: BroadcastMessage.Received({ data: 'another tab' }) }),
    )
    // The belief first: a read sent with the old one would be refused once more.
    expect(heard.model).toBe(read)
    expect(commandsOf(heard).map(command => command.name)).toEqual(['ForgetBelief'])
    const forgot = update(heard.model, Message.ForgotBelief())
    expect([meOf(forgot.model), notesOf(forgot.model)]).toEqual(['Initial', 'Initial'])
    expect(forgot.model.password).toBe('ada password')
    expect(commandsOf(forgot)).toEqual([])
  })

  it.each([
    ['its own post went out', BroadcastMessage.Posted()],
    [
      'it hears its own post, a change it has already made',
      BroadcastMessage.Received({ data: TAB }),
    ],
  ])('changes nothing when %s', (_, message) => {
    const returned = update(read, Message.GotBroadcastMessage({ message }))
    expect(returned.model).toBe(read)
    expect(commandsOf(returned)).toEqual([])
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

const urlOf = (path: string) => Option.getOrThrow(fromString(`http://127.0.0.1:5176${path}`))
const goTo = (model: Model, path: string) => update(model, Message.ChangedUrl({ url: urlOf(path) }))

/** `Me` read as `principal` for `model`'s page, as the Message that brings it. */
const meArrives = (model: Model, principal: Option.Option<User>) =>
  Effect.runPromise(
    Data.preload(model, { session: actives.session }).effect.pipe(Effect.provide(as(principal))),
  ).then(message => update(model, Message.GotRemoteMessage({ message })))

const toHome = { name: 'ReplaceUrl', args: { url: '/?returnTo=%2Fnotes' } }

describe('who may be shown a page', () => {
  it('sends a visitor who opens the notes home, replacing the address', () => {
    const returned = goTo(visitor, '/notes')
    expect(returned.model.route).toEqual(AppRoute.Notes())
    expect(commandsOf(returned)).toEqual([toHome])
  })

  it('lets a reader who is signed in open the notes', () => {
    const returned = goTo(read, '/notes')
    expect(accessOf(returned.model)._tag).toBe('Allowed')
    expect(commandsOf(returned)).toEqual([])
  })

  it('waits for Me without navigating, then sends a visitor home once', async () => {
    const pending = goTo(initial, '/notes')
    expect(accessOf(pending.model)._tag).toBe('Pending')
    expect(commandsOf(pending)).toEqual([])

    const answered = await meArrives(pending.model, Option.none())
    expect(commandsOf(answered)).toEqual([toHome])
    // Another answer before the address is replaced sends nothing more.
    expect(commandsOf(await meArrives(answered.model, Option.none()))).toEqual([])
  })

  it('sends a reader whose session ended home, as the page tells them why', () => {
    const pending = goTo(initial, '/notes').model
    const ended = update(
      pending,
      Message.GotRemoteMessage({
        message: Remote.Message.ReadFailed({
          requests: [{ entity: 'Me', id: ME, fields: ['signedIn', 'key', 'may'] }],
          error: { _tag: 'Unauthenticated', message: 'Your session ended.' },
        }),
      }),
    )
    expect(meOf(ended.model)).toBe('Failed')
    expect(commandsOf(ended)).toEqual([toHome])
  })

  it('stays when Me arrives as someone signed in', async () => {
    const pending = goTo(initial, '/notes').model
    expect(commandsOf(await meArrives(pending, Option.some(ada)))).toEqual([])
  })

  it.each([
    ['shown', () => read, '/'],
    ['being replaced', () => goTo(visitor, '/notes').model, '/notes'],
  ])('treats the address already %s as nothing new', (_, modelOf, path) => {
    const model = modelOf()
    const returned = goTo(model, path)
    expect(returned.model).toBe(model)
    expect(commandsOf(returned)).toEqual([])
  })

  it.each([
    ['the page that sent the reader', '/notes', ['/notes']],
    ['another host', '//elsewhere.example/notes', []],
    ['another host, by backslash', '/\\elsewhere.example/notes', []],
    ['a full address', 'https://elsewhere.example/notes', []],
    ['another host, behind a tab a parser drops', '/\t/elsewhere.example/notes', []],
    ['another host, behind a line break', '/\n/elsewhere.example', []],
    ['a path with its query', '/notes?sort=title', ['/notes?sort=title']],
    ['a path here, as a parser reads it', '/no\ttes', ['/notes']],
  ])('goes on after a sign-in to %s only if it is a path here', (_, returnTo, to) => {
    const sent = { ...read, route: AppRoute.Home({ returnTo: Option.some(returnTo) }) }
    const replaced = commandsOf(update(sent, Message.SucceededSignIn()))
      .filter(command => command.name === 'ReplaceUrl')
      .map(command => (command.args as { url: string }).url)
    expect(replaced).toEqual(to)
  })
})
