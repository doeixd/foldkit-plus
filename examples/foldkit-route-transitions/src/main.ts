import { Array, Duration, Effect, Option, Schema, pipe } from 'effect'
import { Command, type Runtime, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { Transition } from 'foldkit/route'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'
import { type SlotBuilders, SlotView, Style } from 'foldkit-mixins'

import { type Painting, findPaintingWithIndex, paintings } from './data.js'
import {
  AppRoute,
  galleryRouter,
  homeRouter,
  paintingRouter,
  studioRouter,
  urlToAppRoute,
} from './route.js'
import { PageSlots, PageStyle } from './style.js'

export { AppRoute } from './route.js'

const CATALOG_LATENCY = Duration.millis(600)
const PAINTING_LATENCY = Duration.millis(400)
const SAVE_LATENCY = Duration.millis(300)
const MAX_LOGGED_TRANSITIONS = 20

// MODEL

export const CatalogStatus = Schema.Literals(['Idle', 'Loading', 'Ready'])
export type CatalogStatus = typeof CatalogStatus.Type

export const PaintingStatus = defineTaggedUnion({
  Idle: {},
  Loading: { paintingId: Schema.Number },
  Ready: { paintingId: Schema.Number },
})
export type PaintingStatus = typeof PaintingStatus.Type

export const LoggedTransition = Schema.Struct({
  sequenceNumber: Schema.Number,
  maybePreviousRoute: Schema.Option(AppRoute),
  nextRoute: AppRoute,
})
export type LoggedTransition = typeof LoggedTransition.Type

export const Model = Schema.Struct({
  route: AppRoute,
  transitionLog: Schema.Array(LoggedTransition),
  catalogStatus: CatalogStatus,
  paintingStatus: PaintingStatus,
  studioDraft: Schema.String,
  maybeSavedDraft: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  SucceededLoadCatalog: {},
  SucceededLoadPainting: { paintingId: Schema.Number },
  UpdatedStudioDraft: { value: Schema.String },
  SucceededSaveDraft: { draft: Schema.String },
})

export type Message = typeof Message.Type

// COMMAND

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

export const LoadCatalog = Command.define('LoadCatalog', {
  messages: [Message.SucceededLoadCatalog],
  execute: Effect.sleep(CATALOG_LATENCY).pipe(Effect.as(Message.SucceededLoadCatalog())),
})

export const LoadPainting = Command.define('LoadPainting', {
  args: { paintingId: Schema.Number },
  messages: [Message.SucceededLoadPainting],
  execute: ({ paintingId }) =>
    Effect.sleep(PAINTING_LATENCY).pipe(Effect.as(Message.SucceededLoadPainting({ paintingId }))),
})

export const SaveDraft = Command.define('SaveDraft', {
  args: { draft: Schema.String },
  messages: [Message.SucceededSaveDraft],
  execute: ({ draft }) =>
    Effect.sleep(SAVE_LATENCY).pipe(Effect.as(Message.SucceededSaveDraft({ draft }))),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>
type Step = Update.Step<Model, Message>

export type AppTransition = Transition.Transition<AppRoute>

const nextSequenceNumber = (transitionLog: ReadonlyArray<LoggedTransition>): number =>
  Option.match(Array.head(transitionLog), {
    onNone: () => 1,
    onSome: newestEntry => newestEntry.sequenceNumber + 1,
  })

const logTransition =
  (transition: AppTransition): Step =>
  model => ({
    model: modifyFields(model, {
      transitionLog: transitionLog =>
        pipe(
          transitionLog,
          Array.prepend({
            sequenceNumber: nextSequenceNumber(transitionLog),
            maybePreviousRoute: transition.maybePreviousRoute,
            nextRoute: transition.nextRoute,
          }),
          Array.take(MAX_LOGGED_TRANSITIONS),
        ),
    }),
  })

const loadCatalogOnGalleryEntry =
  (transition: AppTransition): Step =>
  model =>
    Transition.isEntering(transition, 'Gallery') && model.catalogStatus !== 'Loading'
      ? {
          model: modifyFields(model, { catalogStatus: () => 'Loading' }),
          commands: [LoadCatalog()],
        }
      : { model }

const loadPaintingOnEntry =
  (transition: AppTransition): Step =>
  model =>
    Option.match(Transition.entered(transition, 'Painting'), {
      onNone: () => ({ model }),
      onSome: ({ paintingId }) => ({
        model: modifyFields(model, {
          paintingStatus: () => PaintingStatus.Loading({ paintingId }),
        }),
        commands: [LoadPainting({ paintingId })],
      }),
    })

const reloadPaintingOnIdChange =
  (transition: AppTransition): Step =>
  model =>
    Option.match(Transition.stayed(transition, 'Painting'), {
      onNone: () => ({ model }),
      onSome: ({ previousRoute, nextRoute }) =>
        previousRoute.paintingId === nextRoute.paintingId
          ? { model }
          : {
              model: modifyFields(model, {
                paintingStatus: () =>
                  PaintingStatus.Loading({
                    paintingId: nextRoute.paintingId,
                  }),
              }),
              commands: [LoadPainting({ paintingId: nextRoute.paintingId })],
            },
    })

const saveDraftOnStudioExit =
  (transition: AppTransition): Step =>
  model =>
    Option.match(Transition.exited(transition, 'Studio'), {
      onNone: () => ({ model }),
      onSome: () =>
        model.studioDraft === ''
          ? { model }
          : { model, commands: [SaveDraft({ draft: model.studioDraft })] },
    })

const handleTransition = (model: Model, transition: AppTransition): UpdateReturn =>
  Update.combine(model, [
    logTransition(transition),
    loadCatalogOnGalleryEntry(transition),
    loadPaintingOnEntry(transition),
    reloadPaintingOnIdChange(transition),
    saveDraftOnStudioExit(transition),
  ])

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),

    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)
      const transition = Transition.make(model.route, nextRoute)
      return handleTransition(modifyFields(model, { route: () => nextRoute }), transition)
    },

    SucceededLoadCatalog: () => ({
      model: modifyFields(model, { catalogStatus: () => 'Ready' }),
    }),

    SucceededLoadPainting: ({ paintingId }) =>
      PaintingStatus.match<UpdateReturn>(model.paintingStatus, {
        Idle: () => ({ model }),
        Loading: loading =>
          loading.paintingId === paintingId
            ? {
                model: modifyFields(model, {
                  paintingStatus: () => PaintingStatus.Ready({ paintingId }),
                }),
              }
            : { model },
        Ready: () => ({ model }),
      }),

    UpdatedStudioDraft: ({ value }) => ({
      model: modifyFields(model, { studioDraft: () => value }),
    }),

    SucceededSaveDraft: ({ draft }) => ({
      model: modifyFields(model, { maybeSavedDraft: () => Option.some(draft) }),
    }),
  })

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => {
  const route = urlToAppRoute(url)
  const initialModel = Model.make({
    route,
    transitionLog: [],
    catalogStatus: 'Idle',
    paintingStatus: PaintingStatus.Idle(),
    studioDraft: '',
    maybeSavedDraft: Option.none(),
  })
  return handleTransition(initialModel, Transition.coldLoad(route))
}

// VIEW

type Slots = SlotBuilders<typeof PageSlots, Message>

const routeLabel = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => 'Home',
    Gallery: () => 'Gallery',
    Painting: ({ paintingId }) => `Painting ${paintingId}`,
    Studio: () => 'Studio',
    NotFound: () => 'Not found',
  })

const NavSection = Schema.Literals(['Home', 'Gallery', 'Studio'])
type NavSection = typeof NavSection.Type

const navSectionOf = (route: AppRoute): Option.Option<NavSection> =>
  AppRoute.match(route, {
    Home: () => Option.some('Home' as const),
    Gallery: () => Option.some('Gallery' as const),
    Painting: () => Option.some('Gallery' as const),
    Studio: () => Option.some('Studio' as const),
    NotFound: () => Option.none(),
  })

const navigationHrefBySection: Readonly<Record<NavSection, () => string>> = {
  Home: homeRouter,
  Gallery: galleryRouter,
  Studio: studioRouter,
}

const navigationView = (currentRoute: AppRoute, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const currentSection = navSectionOf(currentRoute)

  return h.nav(slots.nav.attrs(), [
    h.ul(
      slots.navList.attrs(),
      Array.map(NavSection.literals, section =>
        h.li(slots.navItem.attrs(), [
          h.a(
            slots.navLink.attrs([
              h.Href(navigationHrefBySection[section]()),
              ...(Option.contains(currentSection, section) ? [h.AriaCurrent('page')] : []),
            ]),
            [section],
          ),
        ]),
      ),
    ),
  ])
}

const homeView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Route Transitions']),
    h.p(slots.lead.attrs(), [
      'Every navigation in this app is described by the Transition helpers from foldkit/route, and the log on the right narrates what each one said. The cold load that brought you here is already in it.',
    ]),
    h.p(slots.tipsLabel.attrs(), ['Things to try:']),
    h.ul(slots.tips.attrs(), [
      h.li(slots.tip.attrs(), [
        'Open the Gallery. Entering it fires a catalog load once; navigating back and forth fires it again only on each fresh entry.',
      ]),
      h.li(slots.tip.attrs(), [
        'Open a painting and flip to the next one. Staying on the Painting route is not an entry, so the log shows a stayed transition and only the changed id refetches.',
      ]),
      h.li(slots.tip.attrs(), [
        'Write a draft in the Studio and leave. Exiting the route is a fact, and it becomes a one-shot save Command.',
      ]),
      h.li(slots.tip.attrs(), [
        'Reload the page anywhere. A cold load has no previous route and still counts as an entry.',
      ]),
    ]),
  ])

const loadingView = (label: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.loading.attrs(), [label])

/** The painting's own colours, as the custom property its swatch and banner Slots paint with. */
const paintingGradient = (painting: Painting, h: HtmlBuilder<Message>) =>
  h.Style({ '--painting-gradient': painting.gradient })

const paintingGridView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.ul(
    slots.paintingGrid.attrs(),
    Array.map(paintings, painting =>
      h.keyed('li')(String(painting.id), slots.paintingItem.attrs(), [
        h.a(slots.paintingCard.attrs([h.Href(paintingRouter({ paintingId: painting.id }))]), [
          h.div(slots.swatch.attrs([paintingGradient(painting, h)])),
          h.div(slots.cardBody.attrs(), [
            h.h3(slots.cardTitle.attrs(), [painting.title]),
            h.p(slots.cardArtist.attrs(), [painting.artist]),
          ]),
        ]),
      ]),
    ),
  )

const galleryView = (catalogStatus: CatalogStatus, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const isCatalogReady = catalogStatus === 'Ready'

  return h.div(slots.content.attrs(), [
    h.h1(slots.sectionHeading.attrs(), ['Gallery']),
    h.p(slots.intro.attrs(), [
      'The catalog loads when a transition enters this route, whether by navigation or by cold load.',
    ]),
    isCatalogReady ? paintingGridView(slots, h) : loadingView('Hanging the paintings…', slots, h),
  ])
}

const neighborView = (
  label: string,
  maybeNeighbor: Option.Option<Painting>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeNeighbor, {
    onNone: () => h.span(slots.neighborMissing.attrs(), [label]),
    onSome: neighbor =>
      h.a(slots.neighborLink.attrs([h.Href(paintingRouter({ paintingId: neighbor.id }))]), [label]),
  })

const paintingNeighborsView = (
  paintingIndex: number,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.neighbors.attrs(), [
    neighborView('← Previous', Array.get(paintings, paintingIndex - 1), slots, h),
    h.span(slots.position.attrs(), [`${paintingIndex + 1} of ${paintings.length}`]),
    neighborView('Next →', Array.get(paintings, paintingIndex + 1), slots, h),
  ])

const missingPaintingView = (paintingId: number, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.errorHeading.attrs(), ['Painting Not Found']),
    h.p(slots.lead.attrs(), [`No painting with id ${paintingId} hangs in this gallery.`]),
    h.a(slots.link.attrs([h.Href(galleryRouter())]), ['← Back to Gallery']),
  ])

const isShowing = (paintingStatus: PaintingStatus, painting: Painting): boolean =>
  PaintingStatus.match(paintingStatus, {
    Idle: () => false,
    Loading: () => false,
    Ready: ({ paintingId }) => paintingId === painting.id,
  })

const foundPaintingView = (
  painting: Painting,
  paintingIndex: number,
  paintingStatus: PaintingStatus,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.content.attrs(), [
    h.a(slots.backLink.attrs([h.Href(galleryRouter())]), ['← Back to Gallery']),
    isShowing(paintingStatus, painting)
      ? h.article(slots.article.attrs(), [
          h.div(slots.banner.attrs([paintingGradient(painting, h)])),
          h.div(slots.articleBody.attrs(), [
            h.h1(slots.articleTitle.attrs(), [painting.title]),
            h.p(slots.articleArtist.attrs(), [painting.artist]),
          ]),
        ])
      : loadingView('Unpacking the painting…', slots, h),
    paintingNeighborsView(paintingIndex, slots, h),
  ])

const paintingView = (
  paintingId: number,
  paintingStatus: PaintingStatus,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(findPaintingWithIndex(paintingId), {
    onNone: () => missingPaintingView(paintingId, slots, h),
    onSome: ({ painting, paintingIndex }) =>
      foundPaintingView(painting, paintingIndex, paintingStatus, slots, h),
  })

const studioView = (
  studioDraft: string,
  maybeSavedDraft: Option.Option<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.sectionHeading.attrs(), ['Studio']),
    h.p(slots.intro.attrs(), [
      'Write something, then leave. Exiting this route fires a one-shot SaveDraft Command with whatever is here.',
    ]),
    h.textarea(
      // A Slot's attributes are typed for any element, InnerHTML included, which
      // `h.textarea` refuses; nothing here supplies InnerHTML (a mixin cannot).
      slots.draft.attrs([
        h.Value(studioDraft),
        h.OnInput(value => Message.UpdatedStudioDraft({ value })),
        h.Placeholder('A half-finished thought…'),
      ]) as Parameters<typeof h.textarea>[0],
    ),
    h.div(slots.saved.attrs(), [
      Option.match(maybeSavedDraft, {
        onNone: () => h.p(slots.nothingSaved.attrs(), ['Nothing saved yet.']),
        onSome: savedDraft =>
          h.div(slots.savedCard.attrs(), [
            h.h2(slots.savedLabel.attrs(), ['Last saved draft']),
            h.p(slots.savedText.attrs(), [savedDraft]),
          ]),
      }),
    ]),
  ])

const notFoundView = (path: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.errorHeading.attrs(), ['404 - Page Not Found']),
    h.p(slots.lead.attrs(), [`The path "${path}" was not found.`]),
    h.a(slots.link.attrs([h.Href(homeRouter())]), ['← Go Home']),
  ])

/** Which of the log's colours a badge takes: the `data-tone` its Slot is styled by. */
type BadgeTone = 'coldLoad' | 'entered' | 'exited' | 'stayed' | 'within'

const badgeView = (tone: BadgeTone, label: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.span(slots.badge.attrs([h.DataAttribute('tone', tone)]), [label])

const logEntryBadges = (
  transition: AppTransition,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const coldLoadBadges = Option.match(transition.maybePreviousRoute, {
    onNone: () => [badgeView('coldLoad', 'Cold load', slots, h)],
    onSome: () => [],
  })

  const maybeEnteredBadge = Option.map(Transition.enteredAny(transition), route =>
    badgeView('entered', `Entered ${route._tag}`, slots, h),
  )

  const maybeExitedBadge = Option.map(Transition.exitedAny(transition), route =>
    badgeView('exited', `Exited ${route._tag}`, slots, h),
  )

  const maybeStayedBadge = Option.map(
    Transition.stayed(transition, 'Painting'),
    ({ previousRoute, nextRoute }) =>
      badgeView(
        'stayed',
        `Stayed on Painting: ${previousRoute.paintingId} → ${nextRoute.paintingId}`,
        slots,
        h,
      ),
  )

  const helperBadges = Array.getSomes([maybeEnteredBadge, maybeExitedBadge, maybeStayedBadge])

  return Array.match([...coldLoadBadges, ...helperBadges], {
    onEmpty: () => [badgeView('within', 'Stayed within route', slots, h)],
    onNonEmpty: badges => badges,
  })
}

const logEntryView = (entry: LoggedTransition, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const sourceLabel = Option.match(entry.maybePreviousRoute, {
    onNone: () => 'Cold load',
    onSome: routeLabel,
  })

  return h.keyed('li')(String(entry.sequenceNumber), slots.logEntry.attrs(), [
    h.p(slots.logSummary.attrs(), [
      `#${entry.sequenceNumber} ${sourceLabel} → ${routeLabel(entry.nextRoute)}`,
    ]),
    h.div(slots.badges.attrs(), logEntryBadges(entry, slots, h)),
  ])
}

const transitionLogView = (
  transitionLog: ReadonlyArray<LoggedTransition>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.aside(slots.log.attrs(), [
    h.h2(slots.logTitle.attrs(), ['Transition Log']),
    h.p(slots.logIntro.attrs(), [
      'The most recent navigations, described by the Transition helpers.',
    ]),
    h.ul(
      slots.logList.attrs(),
      Array.map(transitionLog, entry => logEntryView(entry, slots, h)),
    ),
  ])

export const routeTitle = (route: AppRoute): string => {
  const titled = () => `${routeLabel(route)} | Route Transitions`

  return AppRoute.match(route, {
    Home: () => 'Route Transitions',
    Gallery: titled,
    Painting: titled,
    Studio: titled,
    NotFound: titled,
  })
}

export const Page = SlotView.forMessages<Message>()
  .define(PageSlots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.header(slots.header.attrs(), [navigationView(model.route, slots, h)]),
      h.main(slots.main.attrs(), [
        AppRoute.match(model.route, {
          Home: () => homeView(slots, h),
          Gallery: () => galleryView(model.catalogStatus, slots, h),
          Painting: ({ paintingId }) => paintingView(paintingId, model.paintingStatus, slots, h),
          Studio: () => studioView(model.studioDraft, model.maybeSavedDraft, slots, h),
          NotFound: ({ path }) => notFoundView(path, slots, h),
        }),
        transitionLogView(model.transitionLog, slots, h),
      ]),
    ]),
  )
  .pipe(Style.attach(PageStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Page(model, h),
})
