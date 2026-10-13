/**
 * The page: who the server says this tab is, the form or the sign-out that
 * follows from it, and the notes it may read. Everything shown of who is
 * signed in is read from `Me`; nothing here decides who may see what.
 */
import { Match, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { May } from 'foldkit-guard'
import { RemoteData, type RemoteError } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { Message, type Model, NoteList, Session } from './app.js'
import { OpenAdmin } from './domain.js'

/** A failed read, told apart: a refusal of who is asking, or anything else. */
const failure = (error: RemoteError): string =>
  Option.match(RemoteData.refused(error), {
    onNone: () => `Could not read: ${error.message}`,
    onSome: Match.valueTags({
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

const notes = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Id('notes')],
    [
      h.h2([], ['Notes']),
      ...RemoteData.render(Surface.read(NoteList, model).notes, {
        loading: () => [h.p([], ['Loading…'])],
        notFound: () => [h.p([], ['No list.'])],
        failed: error => [h.p([h.Role('alert')], [failure(error)])],
        data: page =>
          page.items.length === 0
            ? [h.p([], ['No notes you may read.'])]
            : [
                h.ul(
                  [],
                  page.items.map(note => h.li([], [`${note.title} (${note.authorId})`])),
                ),
              ],
      }),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main(
    [],
    [
      h.h1([], ['Notes, by who is signed in']),
      ...session(model, h),
      ...Option.match(model.notice, {
        onNone: () => [],
        onSome: notice => [h.p([h.Id('notice'), h.Role('alert')], [notice])],
      }),
      notes(model, h),
    ],
  )
