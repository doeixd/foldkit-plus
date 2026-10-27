/**
 * The page: who the server says this tab is, the form or the sign-out that
 * follows from it, and on `/notes` the notes it may read. Everything shown of
 * who is signed in is read from `Me`; nothing here decides who may see what,
 * and whether `/notes` is drawn is `accessOf`'s answer.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { Alert, AppShell, Badge, Button, Card, Input, PasswordInput } from 'foldkit-mixins-ui'
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
import {
  BadgeStyle,
  CardStyle,
  FieldStyle,
  NoticeStyle,
  Page,
  PasswordStyle,
  PrimaryButtonStyle,
  QuietButtonStyle,
  ShellStyle,
} from './style.js'

type Slots = SlotBuilders<typeof Page.slots, Message>

/** A failed read, told apart: a refusal of who is asking, or anything else. */
const failure = (error: RemoteError): string =>
  Option.match(RemoteData.denied(error), {
    onNone: () => `Could not read: ${error.message}`,
    onSome: Denied.match({
      Unauthenticated: () => 'Your session ended. Sign in again.',
      Forbidden: () => 'You may not read this.',
    }),
  })

const signInForm = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.form(slots.form.attrs([h.Id('sign-in'), h.OnSubmit(Message.SubmittedSignIn())]), [
    Input.view(
      {
        id: 'email',
        type: 'email',
        value: model.email,
        onInput: value => Message.ChangedEmail({ value }),
        style: FieldStyle,
        draw: (resolved, h) =>
          h.div(slots.field.attrs(), [h.label(resolved.label, ['Email']), h.input(resolved.input)]),
      },
      h,
    ),
    PasswordInput.view(
      {
        id: 'password',
        label: 'Password',
        value: model.password,
        onInput: value => Message.ChangedPassword({ value }),
        visible: model.passwordShown,
        onToggle: Message.ToggledPassword(),
        autocomplete: 'current-password',
        style: PasswordStyle,
      },
      h,
    ),
    Button.view({ label: 'Sign in', type: 'submit', style: PrimaryButtonStyle }, h),
  ])

/** Who the server says this tab is: a line the reader and the tests read, with its badges. */
const who = (
  slots: Slots,
  h: HtmlBuilder<Message>,
  text: string,
  badges: ReadonlyArray<Html> = [],
) => h.div(slots.account.attrs(), [h.p(slots.who.attrs([h.Id('who')]), [text]), ...badges])

/** Who this tab is could not be read: the same line says why, and interrupts to say it. */
const unknown = (slots: Slots, h: HtmlBuilder<Message>, text: string) =>
  h.p(slots.who.attrs([h.Id('who'), h.Role('alert'), h.DataAttribute('failed', '')]), [text])

const session = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  RemoteData.render(Surface.read(Session, model).me, {
    loading: () => [who(slots, h, 'Checking who you are…')],
    notFound: () => [who(slots, h, 'The server did not say who you are.')],
    failed: error => [unknown(slots, h, failure(error)), signInForm(model, slots, h)],
    data: me =>
      Option.match(me.key, {
        onNone: () => [who(slots, h, 'Visitor'), signInForm(model, slots, h)],
        onSome: key => [
          who(slots, h, `Signed in as ${key}`, [
            Badge.view({ text: 'Member', tone: 'member', style: BadgeStyle }, h),
            // The server's answer, read with the row: no rule runs here.
            ...(May.can(me.may, OpenAdmin.key)
              ? [Badge.view({ text: 'Admin', tone: 'admin', style: BadgeStyle }, h)]
              : []),
          ]),
          Button.view(
            { label: 'Sign out', onClick: Message.ClickedSignOut(), style: QuietButtonStyle },
            h,
          ),
        ],
      }),
  })

const noteList = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  RemoteData.render(Surface.read(NoteList, model).notes, {
    loading: () => [h.p(slots.status.attrs([h.Role('status')]), ['Loading…'])],
    notFound: () => [h.p(slots.status.attrs(), ['No list.'])],
    // A refusal is announced once, by the session line above.
    failed: error =>
      Option.isSome(RemoteData.denied(error))
        ? [h.p(slots.status.attrs(), [failure(error)])]
        : [
            Alert.view(
              { layout: 'inline', title: failure(error), assertive: true, style: NoticeStyle },
              h,
            ),
          ],
    data: page =>
      page.items.length === 0
        ? [h.p(slots.status.attrs(), ['No notes you may read.'])]
        : [
            h.ul(
              slots.notes.attrs(),
              page.items.map(note => h.li([], [`${note.title} (${note.authorId})`])),
            ),
          ],
  })

const notes = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  Card.view(
    {
      title: 'Notes',
      content: h.section(
        [h.Id('notes')],
        Access.match(accessOf(model), {
          Allowed: () => noteList(model, slots, h),
          // `Me` is still loading: no sign-in page flashed at someone signed in.
          Pending: () => [h.p(slots.status.attrs([h.Role('status')]), ['Loading…'])],
          // `update` is replacing the address.
          Denied: () => [h.p(slots.status.attrs(), ['Taking you to sign in…'])],
        }),
      ),
      style: CardStyle,
    },
    h,
  )

const page = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  AppRoute.match(model.route, {
    Home: () => [],
    Notes: () => [notes(model, slots, h)],
    NotFound: ({ path }) => [
      h.p(slots.status.attrs([h.Id('not-found')]), [`Nothing is at ${path}.`]),
    ],
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const slots = SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h })
  return {
    title: Site.titleOf(AppSite, model.route) ?? 'Not found',
    body: AppShell.view(
      { title: 'Notes', style: ShellStyle },
      [
        h.div(slots.content.attrs(), [
          h.h1(slots.heading.attrs(), ['Notes, by who is signed in']),
          h.nav(slots.links.attrs([h.AriaLabel('Pages')]), [
            h.a(slots.link.attrs([h.Href(homeHref)]), ['Home']),
            h.a(slots.link.attrs([h.Href(notesHref)]), ['Your notes']),
          ]),
          ...Option.match(model.notice, {
            onNone: () => [],
            onSome: notice => [
              Alert.view(
                { layout: 'inline', title: notice, assertive: true, style: NoticeStyle },
                h,
              ),
            ],
          }),
          Card.view(
            {
              title: 'Your account',
              content: h.div(slots.form.attrs(), session(model, slots, h)),
              style: CardStyle,
            },
            h,
          ),
          ...page(model, slots, h),
        ]),
      ],
      h,
    ),
  }
}
