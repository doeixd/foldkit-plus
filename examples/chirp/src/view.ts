/**
 * The page: the nav on one side, and the route's own column on the other.
 * Every part is drawn through a slot of `style.ts`, or a component from
 * `foldkit-mixins-ui` with its recipe.
 */
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { May } from 'foldkit-guard'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Avatar, Button, Card } from 'foldkit-mixins-ui'
import { RemoteData } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import { Surface } from 'foldkit-surface'
import {
  ComposeForm,
  EditorForm,
  Home,
  Message,
  PostEditor,
  Profile,
  Status,
  type Model,
} from './app.js'
import type { Row } from './operations.js'
import { PEOPLE, type Person } from './server/seed.js'
import { AppRoute, ChirpSite, profileHref, statusHref } from './site.js'
import { AvatarStyle, CardStyle, ChirpPage, LikeStyle, QuietButtonStyle } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof ChirpPage.slots, Message>

// #region card
export const ChirpCard = (post: Row, liked: boolean, action: Html, h: H): Html =>
  Card.view(
    {
      media: Avatar.view({ name: post.author.name, style: AvatarStyle }, h),
      title: post.author.name,
      description: `@${post.author.handle}`,
      content: h.p([], [post.body]),
      press: { href: statusHref(post.author.handle, post.id) },
      action,
      footer: Button.view(
        {
          label: `♥ ${post.likeCount}`,
          pressed: liked,
          onClick: Message.Liked({ id: post.id }),
          style: LikeStyle,
        },
        h,
      ),
      style: CardStyle,
    },
    h,
  )
// #endregion

const NAMES: Record<Person, string> = {
  you: 'You',
  ada: 'Ada (admin)',
  grace: 'Grace',
  linus: 'Linus',
}

/** A post, keyed by its id: edited in place, or its card with Edit where the server says you may. */
const post = (row: Row, model: Model, slots: Slots, h: H): Html =>
  h.div(
    slots.post.attrs([h.Key(row.id)]),
    PostEditor.target(model) === row.id
      ? [
          EditorForm.view(model, h, { words: { submit: 'Save' } }),
          h.div(slots.actions.attrs(), [
            h.p(slots.note.attrs([h.AriaLive('polite')]), [editorNote(model)]),
            Button.view(
              { label: 'Done', onClick: Message.ClosedEditor(), style: QuietButtonStyle },
              h,
            ),
          ]),
        ]
      : [
          ChirpCard(
            row,
            model.liked.includes(row.id),
            May.can(row.may, 'Update')
              ? Button.view(
                  {
                    label: 'Edit',
                    onClick: Message.ClickedEdit({ id: row.id }),
                    style: QuietButtonStyle,
                  },
                  h,
                )
              : h.empty,
            h,
          ),
        ],
  )

const editorNote = (model: Model): string => {
  switch (PostEditor.status(model)) {
    case 'Loading':
      return 'Loading…'
    case 'Saving':
      return 'Saving…'
    case 'Saved':
      return 'Saved.'
    case 'SaveFailed':
      return PostEditor.saveError(model)?.message ?? 'The server refused it.'
    case 'NotFound':
      return 'This post is gone.'
    case 'LoadFailed':
      return 'Could not load it.'
    case 'Conflict':
    case 'Moved':
      return 'Someone changed it meanwhile.'
    case 'Editing':
    case 'Closed':
      return ''
  }
}

const feed = (rows: ReadonlyArray<Row>, model: Model, slots: Slots, h: H): ReadonlyArray<Html> =>
  rows.length === 0
    ? [h.p(slots.note.attrs(), ['Nothing here yet.'])]
    : rows.map(row => post(row, model, slots, h))

/** A read's answer drawn, or what it is doing meanwhile. */
const answered = <A>(
  data: RemoteData<A>,
  slots: Slots,
  h: H,
  draw: (value: A) => ReadonlyArray<Html>,
): ReadonlyArray<Html> =>
  RemoteData.render(data, {
    loading: () => [h.p(slots.note.attrs(), ['Loading…'])],
    notFound: () => [h.p(slots.note.attrs(), ['Not found.'])],
    failed: error => [h.p(slots.note.attrs(), [error.message])],
    data: draw,
  })

const home = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.h1(slots.header.attrs(), ['Home']),
  h.div(slots.section.attrs(), [ComposeForm.view(model, h, { words: { submit: 'Chirp' } })]),
  h.div(
    slots.feed.attrs(),
    answered(Surface.read(Home, model).timeline, slots, h, page =>
      feed(page.items, model, slots, h),
    ),
  ),
]

const profile = (model: Model, handle: string, slots: Slots, h: H): ReadonlyArray<Html> => {
  const { person, posts } = Surface.read(Profile, model, { handle })
  return [
    h.h1(slots.header.attrs(), [`@${handle}`]),
    h.div(
      slots.section.attrs(),
      answered(person, slots, h, ({ name }) => [
        Avatar.view({ name, style: AvatarStyle }, h),
        h.p(slots.note.attrs(), [name]),
      ]),
    ),
    h.div(
      slots.feed.attrs(),
      answered(posts, slots, h, page => feed(page.items, model, slots, h)),
    ),
  ]
}

const status = (model: Model, id: string, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.h1(slots.header.attrs(), ['Post']),
  h.div(
    slots.feed.attrs(),
    answered(Surface.read(Status, model, { id }).post, slots, h, row => [
      post(row, model, slots, h),
    ]),
  ),
]

const notFound = (slots: Slots, h: H): ReadonlyArray<Html> => [
  h.h1(slots.header.attrs(), ['Not found']),
  h.p(slots.section.attrs(), [h.a(slots.link.attrs([h.Href('/')]), ['Back to the timeline'])]),
]

const nav = (model: Model, person: Person, slots: Slots, h: H): Html => {
  const link = (label: string, href: string, current: boolean) =>
    h.a(slots.navLink.attrs([h.Href(href), ...(current ? [h.AriaCurrent('page')] : [])]), [label])
  return h.nav(slots.nav.attrs([h.AriaLabel('Chirp')]), [
    h.p(slots.brand.attrs(), ['Chirp']),
    link('Home', '/', model.route._tag === 'Home'),
    link('Profile', profileHref(person), false),
    h.p(slots.who.attrs(), [`Signed in as ${NAMES[person]}`]),
    h.div(
      slots.people.attrs([h.AriaLabel('Sign in as')]),
      PEOPLE.filter(other => other !== person).map(other =>
        Button.view(
          {
            label: NAMES[other],
            onClick: Message.SwitchedPerson({ person: other }),
            style: QuietButtonStyle,
          },
          h,
        ),
      ),
    ),
  ])
}

const PageView = SlotView.forMessages<Message>()
  .define(
    ChirpPage.slots,
    ({ model, person }: { readonly model: Model; readonly person: Person }, slots, h) =>
      h.div(slots.page.attrs(), [
        h.div(slots.frame.attrs(), [
          nav(model, person, slots, h),
          h.main(
            slots.main.attrs(),
            AppRoute.match(model.route, {
              Home: () => home(model, slots, h),
              Profile: ({ handle }) => profile(model, handle, slots, h),
              Status: ({ id }) => status(model, id, slots, h),
              NotFound: () => notFound(slots, h),
            }),
          ),
        ]),
      ]),
  )
  .pipe(Style.attach(ChirpPage.style))

/** The page as `person` sees it. */
export const viewAs =
  (person: Person) =>
  (model: Model, h: H): Document => ({
    title: Site.titleOf(ChirpSite, model.route) ?? 'Chirp',
    body: PageView({ model, person }, h),
  })
