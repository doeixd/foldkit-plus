/**
 * The page: who the server says this tab is, the form or the sign-out that
 * follows from it, and on `/notes` the notes it may read. Everything shown of
 * who is signed in is read from `Me`; nothing here decides who may see what,
 * and whether `/notes` is drawn is `accessOf`'s answer.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { May } from 'foldkit-guard'
import { Denied, RemoteData, type RemoteError } from 'foldkit-remote'
import { Access, Site } from 'foldkit-site'
import { Surface } from 'foldkit-surface'
import {
  AppRoute,
  AppSite,
  Message,
  type Model,
  NoteList,
  Session,
  accessOf,
  homeHref,
  notesHref,
} from './app.js'
import { OpenAdmin } from './domain.js'

/** A failed read, told apart: a refusal of who is asking, or anything else. */
const failure = (error: RemoteError): string =>
  Option.match(RemoteData.denied(error), {
    onNone: () => `Could not read: ${error.message}`,
    onSome: Denied.match({
      Unauthenticated: () => 'Your session ended. Sign in again.',
      Forbidden: () => 'You may not read this.',
    }),
  })

const signInForm = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.form(
    [h.Id('sign-in'), h.OnSubmit(Message.SubmittedSignIn())],
    [
      h.label(
        [],
        [
          'Email',
          h.input([
            h.Type('email'),
            h.Value(model.email),
            h.OnInput(value => Message.ChangedEmail({ value })),
          ]),
        ],
      ),
      h.label(
        [],
        [
          'Password',
          h.input([
            h.Type('password'),
            h.Value(model.password),
            h.OnInput(value => Message.ChangedPassword({ value })),
          ]),
        ],
      ),
      h.button([h.Type('submit')], ['Sign in']),
    ],
  )

const session = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  RemoteData.render(Surface.read(Session, model).me, {
    loading: () => [h.p([h.Id('who')], ['Checking who you are…'])],
    notFound: () => [h.p([h.Id('who')], ['The server did not say who you are.'])],
    failed: error => [h.p([h.Id('who'), h.Role('alert')], [failure(error)]), signInForm(model, h)],
    data: me =>
      Option.match(me.key, {
        onNone: () => [h.p([h.Id('who')], ['Visitor']), signInForm(model, h)],
        onSome: key => [
          h.p([h.Id('who')], [`Signed in as ${key}`]),
          // The server's answer, read with the row: no rule runs here.
          ...(May.can(me.may, OpenAdmin.key) ? [h.p([h.Id('admin')], ['Admin'])] : []),
          h.button([h.OnClick(Message.ClickedSignOut())], ['Sign out']),
        ],
      }),
  })

const noteList = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  RemoteData.render(Surface.read(NoteList, model).notes, {
    loading: () => [h.p([], ['Loading…'])],
    notFound: () => [h.p([], ['No list.'])],
    // A refusal is announced once, by the session line above.
    failed: error => [
      h.p(Option.isSome(RemoteData.denied(error)) ? [] : [h.Role('alert')], [failure(error)]),
    ],
    data: page =>
      page.items.length === 0
        ? [h.p([], ['No notes you may read.'])]
        : [
            h.ul(
              [],
              page.items.map(note => h.li([], [`${note.title} (${note.authorId})`])),
            ),
          ],
  })

const notes = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Id('notes')],
    [
      h.h2([], ['Notes']),
      ...Access.match(accessOf(model), {
        Allowed: () => noteList(model, h),
        // `Me` is still loading: no sign-in page flashed at someone signed in.
        Pending: () => [h.p([], ['Loading…'])],
        // `update` is replacing the address.
        Denied: () => [h.p([], ['Taking you to sign in…'])],
      }),
    ],
  )

const page = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  AppRoute.match(model.route, {
    Home: () => [],
    Notes: () => [notes(model, h)],
    NotFound: ({ path }) => [h.p([h.Id('not-found')], [`Nothing is at ${path}.`])],
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: Site.titleOf(AppSite, model.route) ?? 'Not found',
  body: h.main(
    [],
    [
      h.h1([], ['Notes, by who is signed in']),
      h.nav([], [h.a([h.Href(homeHref)], ['Home']), ' ', h.a([h.Href(notesHref)], ['Your notes'])]),
      ...session(model, h),
      ...Option.match(model.notice, {
        onNone: () => [],
        onSome: notice => [h.p([h.Id('notice'), h.Role('alert')], [notice])],
      }),
      ...page(model, h),
    ],
  ),
})
