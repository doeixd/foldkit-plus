/**
 * The page: the frame, then the sign-in form, the notebook or one note, as
 * the route says. What is shown of who is signed in is read from `Me`; what
 * may be edited is the server's `may`; whether a page is drawn at all is
 * `accessOf`'s answer, the one the Worker's 303 gives.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { May } from 'foldkit-plus/guard'
import { SlotView, type SlotBuilders } from 'foldkit-plus/mixins'
import { Alert, AppShell, Button, Card, Input, PasswordInput } from 'foldkit-plus/mixins-ui'
import { Denied, RemoteData, type RemoteError } from 'foldkit-plus/remote'
import { Access, Site } from 'foldkit-plus/site'
import { Surface } from 'foldkit-plus/surface'
import {
  AddingForm,
  AppRoute,
  AppSite,
  Data,
  EditorForm,
  Message,
  NoteEditor,
  NotePage,
  NotebookPage,
  Session,
  accessOf,
  noteHref,
  notebookHref,
  viewerOf,
  type Model,
} from './main.js'
import {
  CardStyle,
  DangerStyle,
  InputStyle,
  NoticeStyle,
  Page,
  PasswordStyle,
  PrimaryStyle,
  QuietStyle,
  ShellStyle,
} from './style.js'

type H = HtmlBuilder<Message>
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

const status = (slots: Slots, h: H, text: string): Html =>
  h.p(slots.status.attrs([h.Role('status')]), [text])

const notice = (h: H, title: string): Html =>
  Alert.view({ layout: 'inline', title, assertive: true, style: NoticeStyle }, h)

const textField = (
  slots: Slots,
  h: H,
  options: {
    readonly id: string
    readonly label: string
    readonly type: string
    readonly value: string
    readonly onInput: (value: string) => Message
  },
): Html =>
  Input.view(
    {
      id: options.id,
      type: options.type,
      value: options.value,
      onInput: options.onInput,
      style: InputStyle,
      draw: (resolved, h) =>
        h.div(slots.field.attrs(), [
          h.label(resolved.label, [options.label]),
          h.input(resolved.input),
        ]),
    },
    h,
  )

const signIn = (model: Model, slots: Slots, h: H): Html => {
  const signingUp = model.mode === 'signUp'
  return Card.view(
    {
      title: signingUp ? 'Sign up' : 'Sign in',
      content: h.form(slots.form.attrs([h.Id('auth'), h.OnSubmit(Message.SubmittedAuth())]), [
        ...(signingUp
          ? [
              textField(slots, h, {
                id: 'name',
                label: 'Your name',
                type: 'text',
                value: model.name,
                onInput: value => Message.ChangedName({ value }),
              }),
            ]
          : []),
        textField(slots, h, {
          id: 'email',
          label: 'Email',
          type: 'email',
          value: model.email,
          onInput: value => Message.ChangedEmail({ value }),
        }),
        PasswordInput.view(
          {
            id: 'password',
            label: 'Password',
            value: model.password,
            onInput: value => Message.ChangedPassword({ value }),
            visible: model.passwordShown,
            onToggle: Message.ToggledPassword(),
            autocomplete: signingUp ? 'new-password' : 'current-password',
            style: PasswordStyle,
          },
          h,
        ),
        ...Option.match(model.notice, { onNone: () => [], onSome: text => [notice(h, text)] }),
        h.div(slots.actions.attrs(), [
          Button.view(
            { label: signingUp ? 'Sign up' : 'Sign in', type: 'submit', style: PrimaryStyle },
            h,
          ),
          Button.view(
            {
              label: signingUp ? 'I have an account' : 'Create an account',
              onClick: Message.SwitchedMode({ mode: signingUp ? 'signIn' : 'signUp' }),
              style: QuietStyle,
            },
            h,
          ),
        ]),
      ]),
      style: CardStyle,
    },
    h,
  )
}

/**
 * What a failed write says. A write nothing answered may have landed; the
 * notes writer keeps a ledger, so Retry, which sends the same operation, is
 * written once either way.
 */
export const failedWriteWords = (failed: {
  readonly mutation: { readonly name: string }
  readonly error: RemoteError
}): string =>
  RemoteData.isUnreachable(failed.error)
    ? `${failed.mutation.name} may not have reached the server. Retry sends it again, and it is saved once.`
    : `${failed.mutation.name} failed: ${failed.error.message}`

/** Each write that failed: what it was, why, and a retry or a dismiss. */
const failedWrites = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> =>
  Data.failedWrites(model).map(failed =>
    h.div(slots.actions.attrs(), [
      notice(h, failedWriteWords(failed)),
      Button.view(
        {
          label: 'Retry',
          onClick: Message.ClickedRetry({ requestId: failed.requestId }),
          style: QuietStyle,
        },
        h,
      ),
      Button.view(
        {
          label: 'Dismiss',
          onClick: Message.ClickedDismiss({ requestId: failed.requestId }),
          style: QuietStyle,
        },
        h,
      ),
    ]),
  )

const notebook = (model: Model, viewer: string, slots: Slots, h: H): ReadonlyArray<Html> => {
  const { notes, mine } = Surface.read(NotebookPage, model, { viewer })
  return [
    ...RemoteData.render(mine, {
      loading: () => [],
      notFound: () => [],
      failed: () => [],
      data: me => [
        h.p(slots.status.attrs([h.Id('mine')]), [
          `${me.name}, you have written ${me.noteCount} ${me.noteCount === 1 ? 'note' : 'notes'}.`,
        ]),
      ],
    }),
    Card.view(
      {
        title: 'Add a note',
        content: AddingForm.view(model, h, { words: { submit: 'Add' } }),
        style: CardStyle,
      },
      h,
    ),
    h.section(
      [h.Id('notes'), h.AriaLabel('Notes')],
      RemoteData.render(notes, {
        loading: () => [status(slots, h, 'Loading…')],
        notFound: () => [status(slots, h, 'No notebook.')],
        failed: error => [notice(h, failure(error))],
        data: page =>
          page.items.length === 0
            ? [status(slots, h, 'No notes yet.')]
            : [
                h.ul(
                  slots.notes.attrs(),
                  page.items.map(note =>
                    h.li(slots.note.attrs([h.Key(note.id)]), [
                      h.a(slots.link.attrs([h.Href(noteHref(note.id))]), [note.title]),
                      h.span(slots.byline.attrs(), [`by ${note.author.name}`]),
                    ]),
                  ),
                ),
              ],
      }),
    ),
  ]
}

const notePage = (model: Model, id: string, slots: Slots, h: H): ReadonlyArray<Html> =>
  RemoteData.render(Surface.read(NotePage, model, { id }).note, {
    loading: () => [status(slots, h, 'Loading…')],
    notFound: () => [status(slots, h, 'This note does not exist, or was deleted.')],
    failed: error => [notice(h, failure(error))],
    data: note => {
      const mayEdit = May.can(note.may, 'Update')
      const editing = Option.contains(Option.fromNullOr(NoteEditor.target(model)), note.id)
      return [
        Card.view(
          {
            title: note.title,
            content: h.div(slots.form.attrs(), [
              h.p(slots.byline.attrs(), [`by ${note.author.name}`]),
              h.p(slots.body.attrs([h.Id('body')]), [note.body]),
              ...(editing ? [EditorForm.view(model, h, { words: { submit: 'Save' } })] : []),
              h.div(slots.actions.attrs(), [
                ...(mayEdit && !editing
                  ? [
                      Button.view(
                        {
                          label: 'Edit',
                          onClick: Message.ClickedEdit({ id: note.id }),
                          style: QuietStyle,
                        },
                        h,
                      ),
                    ]
                  : []),
                ...(May.can(note.may, 'Delete')
                  ? [
                      Button.view(
                        {
                          label: 'Delete',
                          onClick: Message.ClickedDelete({ id: note.id }),
                          style: DangerStyle,
                        },
                        h,
                      ),
                    ]
                  : []),
              ]),
            ]),
            style: CardStyle,
          },
          h,
        ),
      ]
    },
  })

/** The page the route names, if the reader may see it. */
const page = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const allowed = (draw: () => ReadonlyArray<Html>) =>
    Access.match(accessOf(model), {
      Allowed: draw,
      // `Me` is still loading: no sign-in form flashed at someone signed in.
      Pending: () => [status(slots, h, 'Loading…')],
      // `update` is loading the sign-in page.
      Denied: () => [status(slots, h, 'Taking you to sign in…')],
    })
  return AppRoute.match(model.route, {
    SignIn: () => [signIn(model, slots, h)],
    // Allowed only once `Me` is read, which names the reader.
    Notebook: () =>
      allowed(() =>
        Option.match(viewerOf(model), {
          onNone: () => [],
          onSome: viewer => notebook(model, viewer, slots, h),
        }),
      ),
    NotePage: ({ id }) => allowed(() => notePage(model, id, slots, h)),
    NotFound: ({ path }) => [status(slots, h, `Nothing is at ${path}.`)],
  })
}

const signedIn = (model: Model): boolean =>
  RemoteData.match(Surface.read(Session, model).me, {
    Initial: () => false,
    Loading: () => false,
    Ready: me => me.signedIn,
    Refreshing: me => me.signedIn,
    Failed: () => false,
    NotFound: () => false,
  })

export const view = (model: Model, h: H): Document => {
  const slots = SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h })
  return {
    title: Site.titleOf(AppSite, model.route) ?? 'Not found · Notebook',
    body: AppShell.view(
      {
        title: 'Notebook',
        style: ShellStyle,
        actions: signedIn(model)
          ? [
              h.nav(slots.nav.attrs([h.AriaLabel('Account')]), [
                h.a(slots.link.attrs([h.Href(notebookHref)]), ['All notes']),
                Button.view(
                  { label: 'Sign out', onClick: Message.ClickedSignOut(), style: QuietStyle },
                  h,
                ),
              ]),
            ]
          : [],
      },
      [
        h.div(slots.content.attrs(), [
          // The sign-in form says its own; elsewhere it is a sign-out that failed.
          ...AppRoute.matchOrElse(model.route, { SignIn: () => [] }, () =>
            Option.match(model.notice, { onNone: () => [], onSome: text => [notice(h, text)] }),
          ),
          ...failedWrites(model, slots, h),
          ...page(model, slots, h),
        ]),
      ],
      h,
    ),
  }
}
