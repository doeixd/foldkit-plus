/**
 * The page: the nav, the column of posts for the route, and the accounts.
 * Every part is drawn through a slot of `style.ts`, or a component from
 * `foldkit-mixins-ui` with its recipe; the icons are Lucide's, by name.
 */
import { Option } from 'effect'
import { chirpDemo } from 'foldkit-example-site/demos'
import { demoGuide } from 'foldkit-example-site/guide'
import { May } from 'foldkit-guard'
import { Icon, type IconData } from 'foldkit-media'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Avatar } from 'foldkit-mixins-ui'
import type { RemoteData } from 'foldkit-remote'
import { RemoteData as Data } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import { Surface } from 'foldkit-surface'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import {
  arrowLeft,
  bird,
  feather,
  heart,
  house,
  pencil,
  trash2,
  user,
} from 'virtual:foldkit-icons/lucide'
import {
  ComposeForm,
  Data as Chirps,
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
import { AvatarStyle, ChirpPage, GuideOffset, PortraitStyle } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof ChirpPage.slots, Message>

const NAMES: Record<Person, string> = {
  you: 'You',
  ada: 'Ada Lovelace',
  grace: 'Grace Hopper',
  linus: 'Linus Kay',
}
/** Who `server/server.ts` makes an admin, said beside her name. */
const ADMIN: Person = 'ada'

const icon = (data: IconData, h: H): Html => Icon.draw(data, h)

/** When a post was written, as a short date in the reader's own calendar. */
const when = (createdAt: number): string =>
  new Date(createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })

/** A post as a row: who wrote it and when, what it says, and what you may do with it. */
const chirp = (post: Row, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.div(slots.postHead.attrs(), [
    h.a(slots.name.attrs([h.Href(profileHref(post.author.handle))]), [post.author.name]),
    h.span(slots.quiet.attrs(), [`@${post.author.handle}`]),
    h.span(slots.quiet.attrs([h.AriaHidden(true)]), ['·']),
    h.a(slots.stamp.attrs([h.Href(statusHref(post.author.handle, post.id))]), [
      when(post.createdAt),
    ]),
  ]),
  h.p(slots.body.attrs(), [post.body]),
  h.div(slots.actions.attrs(), [
    // #region like
    h.button(
      slots.like.attrs([
        h.Type('button'),
        h.AriaPressed(Option.isSome(post.liked) ? 'true' : 'false'),
        h.AriaLabel(`Like, ${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'}`),
        h.OnClick(Message.ClickedLike({ postId: post.id })),
      ]),
      [h.span(slots.round.attrs(), [icon(heart, h)]), h.span([], [String(post.likeCount)])],
    ),
    // #endregion
    ...(May.can(post.may, 'Update')
      ? [
          h.button(
            slots.edit.attrs([h.Type('button'), h.OnClick(Message.ClickedEdit({ id: post.id }))]),
            [h.span(slots.round.attrs(), [icon(pencil, h)]), h.span([], ['Edit'])],
          ),
        ]
      : []),
    ...(May.can(post.may, 'Delete')
      ? [
          h.button(
            slots.remove.attrs([
              h.Type('button'),
              h.OnClick(Message.ClickedDelete({ id: post.id })),
            ]),
            [h.span(slots.round.attrs(), [icon(trash2, h)]), h.span([], ['Delete'])],
          ),
        ]
      : []),
  ]),
]
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

/** A post, keyed by its id: its author's avatar beside it, or beside its editor while open. */
const article = (row: Row, slots: Slots, h: H, body: ReadonlyArray<Html>): Html =>
  h.article(slots.post.attrs([h.Key(row.id), h.AriaLabel(`Post by ${row.author.name}`)]), [
    Avatar.view({ name: row.author.name, style: AvatarStyle }, h),
    h.div([], body),
  ])

// Remote hands out a row as the object it was while its data is the same, so
// a post not being edited is drawn again only when it changed.
const drawPost = (slots: Slots, h: H, { row }: { readonly row: Row }): Html =>
  article(row, slots, h, chirp(row, slots, h))

const post = (row: Row, model: Model, slots: Slots, h: H): Html =>
  PostEditor.target(model) === row.id
    ? article(row, slots, h, [
        h.div(slots.editing.attrs(), [
          EditorForm.view(model, h, { words: { submit: 'Save' } }),
          h.p(slots.note.attrs([h.AriaLive('polite')]), [editorNote(model)]),
          h.button(slots.done.attrs([h.Type('button'), h.OnClick(Message.ClosedEditor())]), [
            'Done',
          ]),
        ]),
      ])
    : slots.post.lazy({ index: 0, id: row.id }, drawPost, { row })

/** A read's answer drawn, or what it is doing meanwhile. */
const answered = <A>(
  data: RemoteData<A>,
  slots: Slots,
  h: H,
  draw: (value: A) => ReadonlyArray<Html>,
): ReadonlyArray<Html> =>
  Data.render(data, {
    loading: () => [h.p(slots.empty.attrs(), ['Loading…'])],
    notFound: () => [h.p(slots.empty.attrs(), ['Nothing here.'])],
    failed: error => [h.p(slots.empty.attrs(), [error.message])],
    data: draw,
  })

const feed = (rows: ReadonlyArray<Row>, model: Model, slots: Slots, h: H): ReadonlyArray<Html> =>
  rows.length === 0
    ? [h.p(slots.empty.attrs(), ['No posts yet.'])]
    : rows.map(row => post(row, model, slots, h))

const header = (slots: Slots, h: H, title: string, back: boolean): Html =>
  h.div(slots.header.attrs(), [
    ...(back
      ? [
          h.a(slots.back.attrs([h.Href('/'), h.AriaLabel('Back to the timeline')]), [
            icon(arrowLeft, h),
          ]),
        ]
      : []),
    h.h1(slots.title.attrs(), [title]),
    h.span(slots.headerLogo.attrs([h.AriaHidden(true)]), [icon(bird, h)]),
  ])

/** Who you are and who else you can be: beside the posts when there is room, above them when not. */
const switcher = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> =>
  PEOPLE.filter(person => person !== model.me).map(person =>
    h.button(
      slots.switchTo.attrs([h.Type('button'), h.OnClick(Message.SwitchedPerson({ person }))]),
      [`Be ${NAMES[person].split(' ')[0]}`],
    ),
  )

const strip = (model: Model, slots: Slots, h: H): Html =>
  h.div(slots.strip.attrs([h.AriaLabel('Accounts')]), [
    h.span([], [`Signed in as ${NAMES[model.me]}`]),
    ...switcher(model, slots, h),
  ])

/**
 * The chirps posted and not yet answered, said once a send went unanswered.
 * Every chirp waits while it is on its way, so a line said for that alone
 * stood above each new chirp for a frame or two and pushed it down.
 */
const waiting = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const { waiting: count, items } = Chirps.outboxStatus(model)
  const unanswered = items.some(item => item.state._tag === 'Waiting' && item.state.attempt > 0)
  return unanswered
    ? [
        h.p(slots.quiet.attrs([h.Role('status')]), [
          `${count} ${count === 1 ? 'chirp' : 'chirps'} waiting to send`,
        ]),
      ]
    : []
}

const home = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  header(slots, h, 'Home', false),
  strip(model, slots, h),
  h.div(slots.row.attrs(), [
    Avatar.view({ name: NAMES[model.me], style: AvatarStyle }, h),
    ComposeForm.view(model, h, { words: { submit: 'Chirp' } }),
  ]),
  ...waiting(model, slots, h),
  ...answered(Surface.read(Home, model).timeline, slots, h, page =>
    feed(page.items, model, slots, h),
  ),
]

const profile = (model: Model, handle: string, slots: Slots, h: H): ReadonlyArray<Html> => {
  const { person, posts } = Surface.read(Profile, model, { handle })
  return [
    header(slots, h, `@${handle}`, true),
    strip(model, slots, h),
    h.div(slots.banner.attrs(), []),
    h.div(
      slots.profile.attrs(),
      answered(person, slots, h, ({ name, postCount }) => [
        h.span(slots.portrait.attrs(), [Avatar.view({ name, style: PortraitStyle }, h)]),
        h.h2(slots.profileName.attrs(), [name]),
        h.p(slots.profileHandle.attrs(), [
          `@${handle} · ${postCount} ${postCount === 1 ? 'chirp' : 'chirps'}`,
        ]),
      ]),
    ),
    ...answered(posts, slots, h, page => feed(page.items, model, slots, h)),
  ]
}

const status = (model: Model, id: string, slots: Slots, h: H): ReadonlyArray<Html> => [
  header(slots, h, 'Post', true),
  ...answered(Surface.read(Status, model, { id }).post, slots, h, row => [
    post(row, model, slots, h),
  ]),
]

const notFound = (slots: Slots, h: H): ReadonlyArray<Html> => [
  header(slots, h, 'Not found', true),
  h.p(slots.empty.attrs(), [
    'This page does not exist. ',
    h.a(slots.link.attrs([h.Href('/')]), ['Back to the timeline']),
  ]),
]

const onProfile = (model: Model): boolean =>
  AppRoute.match(model.route, {
    Home: () => false,
    Profile: ({ handle }) => handle === model.me,
    Status: () => false,
    NotFound: () => false,
  })

const current = (here: boolean, h: H) => (here ? [h.AriaCurrent('page')] : [])

const nav = (model: Model, slots: Slots, h: H): Html =>
  h.nav(slots.nav.attrs([h.AriaLabel('Chirp')]), [
    h.a(slots.logo.attrs([h.Href('/'), h.AriaLabel('Chirp home')]), [icon(bird, h)]),
    h.a(slots.navLink.attrs([h.Href('/'), ...current(model.route._tag === 'Home', h)]), [
      h.span(slots.icon.attrs(), [icon(house, h)]),
      h.span(slots.navLabel.attrs(), ['Home']),
    ]),
    h.a(slots.navLink.attrs([h.Href(profileHref(model.me)), ...current(onProfile(model), h)]), [
      h.span(slots.icon.attrs(), [icon(user, h)]),
      h.span(slots.navLabel.attrs(), ['Profile']),
    ]),
    // The compose box is at the top of Home: posting starts there.
    h.a(slots.postButton.attrs([h.Href('/'), h.AriaLabel('Post')]), [
      h.span(slots.postWord.attrs(), ['Post']),
      h.span(slots.postIcon.attrs(), [icon(feather, h)]),
    ]),
    h.div(slots.account.attrs(), [
      Avatar.view({ name: NAMES[model.me], style: AvatarStyle }, h),
      h.span(slots.accountText.attrs(), [
        h.span(slots.strong.attrs(), [NAMES[model.me]]),
        h.span(slots.quiet.attrs(), [`@${model.me}`]),
      ]),
    ]),
  ])

const aside = (model: Model, slots: Slots, h: H): Html =>
  h.aside(slots.aside.attrs(), [
    h.div(slots.panel.attrs(), [
      h.h2(slots.panelTitle.attrs(), ['Accounts']),
      ...PEOPLE.map(person =>
        h.div(slots.person.attrs(), [
          Avatar.view({ name: NAMES[person], style: AvatarStyle }, h),
          h.span(slots.personText.attrs(), [
            h.span(slots.strong.attrs(), [NAMES[person]]),
            h.span(slots.quiet.attrs(), [`@${person}${person === ADMIN ? ' · admin' : ''}`]),
          ]),
          person === model.me
            ? h.span(slots.here.attrs(), ['Signed in'])
            : h.button(
                slots.switchTo.attrs([
                  h.Type('button'),
                  h.OnClick(Message.SwitchedPerson({ person })),
                ]),
                ['Switch'],
              ),
        ]),
      ),
      h.p(slots.panelFoot.attrs(), [
        h.a(slots.link.attrs([h.Href(`/?reset&as=${model.me}`)]), ['Start the sandbox again']),
      ]),
    ]),
  ])

/** The bar along the bottom of a phone, in place of the nav. */
const tabbar = (model: Model, slots: Slots, h: H): Html =>
  h.nav(slots.tabbar.attrs([h.AriaLabel('Chirp, on a phone')]), [
    h.a(
      slots.tab.attrs([
        h.Href('/'),
        h.AriaLabel('Home'),
        ...current(model.route._tag === 'Home', h),
      ]),
      [icon(house, h)],
    ),
    h.a(
      slots.tab.attrs([
        h.Href(profileHref(model.me)),
        h.AriaLabel('Profile'),
        ...current(onProfile(model), h),
      ]),
      [icon(user, h)],
    ),
  ])

const DemoGuide = demoGuide<Message>().pipe(Style.attach(GuideOffset))

const PageView = SlotView.forMessages<Message>()
  .define(ChirpPage.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.div(slots.frame.attrs(), [
        nav(model, slots, h),
        h.main(
          slots.main.attrs(),
          AppRoute.match(model.route, {
            Home: () => home(model, slots, h),
            Profile: ({ handle }) => profile(model, handle, slots, h),
            Status: ({ id }) => status(model, id, slots, h),
            NotFound: () => notFound(slots, h),
          }),
        ),
        aside(model, slots, h),
      ]),
      tabbar(model, slots, h),
      DemoGuide(
        {
          demo: chirpDemo,
          more: [`You are signed in as ${NAMES[model.me]}.`],
          links: [{ label: 'Start again', href: `/?reset&as=${model.me}` }],
        },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(ChirpPage.style))

/** The page as `model.me` sees it. */
export const view = (model: Model, h: H): Document => ({
  title: Site.titleOf(ChirpSite, model.route) ?? 'Chirp',
  body: PageView(model, h),
})
