# Primitives we lack, compared with solid-primitives (#596)

On 2026-11-18 every package of [solid-primitives](https://primitives.solidjs.community/) was compared with `foldkit-primitives`, its neighbouring packages, and what Foldkit and Effect provide. Most of it we have or cover; about twenty-five packages are Solid's signal, store, props or JSX internals, which the Model, Messages and Effect replace. This note lists what is missing and the shape each would take here.

## How far the comparison can be trusted

- The package list came from the solid-primitives README through a summarising fetch. It kept names and blurbs but lost most per-package export lists, and it was not checked against the live site or the npm scope, so a few packages may be absent.
- A "have" was confirmed by reading the export lines of the named file, not its implementation.
- A "missing" rests on case-insensitive searches of `packages/*/src` under several spellings.

## Missing, in the order worth building

| # | Primitive | Shape here | Home | Demand | Size |
| --- | --- | --- | --- | --- | --- |
| 1 | Leave guard: confirm before unload while the Model says there are unsaved changes | A Subscription or Mount that listens for `beforeunload` only while a predicate over the Model holds | `foldkit-primitives/events` | Medium: forms and editors need it, and `foldkit-form` has none. Only `dom/scroll.ts` and `sync/src/mount.ts` touch `beforeunload` today | Small |
| 2 | Audio and video element | A Mount reporting play, pause, time, duration, buffered and ended as Messages; Commands for play, pause and seek; a Bundle holding `{ playing, time, duration }` | `foldkit-primitives/dom`, or a module of its own. Not `foldkit-media`, which owns images | Medium: common in content applications | Medium |
| 3 | i18n | A pure function over a typed dictionary with `{blanks}` (the `words` convention), and `Intl` formatters, read with the `Locale` Bundle | Extend `state/locale.ts`, which holds only the locale string; a package of its own if it grows | Medium: every application in two languages | Small to medium |
| 4 | Web Worker | A Command that posts a message and a Subscription of the worker's replies, typed by a Schema on both sides | `foldkit-primitives/net`, beside `sharedHost.ts` | Low to medium: CPU-heavy applications | Medium |
| 5 | Notification | A Command, composed with `device/permissions.ts` | `foldkit-primitives/device` | Low: push needs a service worker, which is another job | Small |
| 6 | Vibrate | A Command | `foldkit-primitives/device` | Low | Small |
| 7 | Battery | A Bundle or Subscription of level and charging | `foldkit-primitives/device` | Low | Small |
| 8 | Device orientation | A Subscription of the screen's and the device's orientation | `foldkit-primitives/device` | Low | Small |
| 9 | Motion sensors: accelerometer, gyroscope, compass | Subscriptions, behind `permissions` where the browser asks | `foldkit-primitives/device` | Low | Small each |
| 10 | File System Access | Commands for open, save and a directory picker | `foldkit-primitives/device` or `dom`. Foldkit's `file` already reads a `File` | Low | Small to medium |
| 11 | Favicon | A Command, or a field of `foldkit-site`. A `Document` view already returns the title | `foldkit-site` or `dom` | Low | Small |
| 12 | Cursor | A Style piece or a Mount setting the document's cursor during an interaction | `foldkit-mixins` | Low | Small |
| 13 | Match highlighting (solid's `marker`) | A pure function from text and a query to ranges | `foldkit-primitives/state` | Low | Small |
| 14 | Scroll and view timelines | Style pieces over `animation-timeline` | `foldkit-mixins` | Low | Medium |
| 15 | Analytics | A Command wrapper. The application owns its provider, so there may be nothing to ship | None decided | Low | Small |

Items 5 to 9 complete the `device` subpath and are cheapest taken together.

## Not classified with confidence

Each needs a look at the source before it is called missing or covered.

- **Text selection.** No `selectionchange` handler was found in `foldkit-primitives`, but `packages/richtext-dom` may already track selection for its own island. If it does, a general Mount in `foldkit-primitives/events` would share it.
- **Native drag and drop of text, links or items between windows.** `PointerDrag`, `Reorder` and `Move` cover drags within the page, and `FileDrop` covers files. Whether anything handles other `dataTransfer` kinds is unknown.
- **`Mirror.kv` across tabs.** A `storage` event stream exists in `packages/mixins/src/theme/storageChanges.ts`; whether `foldkit-mirror`'s key-value store uses one is unconfirmed.
- **General colour helpers.** `packages/mixins/src/theme/oklch.ts` derives a palette from knobs; whether `mix`, `lighten` or a contrast ratio is exported for applications was not checked.

## Have or covered, for the record

| solid-primitives | Here |
| --- | --- |
| a11y, active-element, focus, input-mask, keyboard, list-state, mouse, pointer, scroll | `foldkit-primitives`: `interaction/live-announce.ts`, `events/active-element.ts`, `interaction/focus-scope.ts` and `focus-recovery.ts`, `dom/input-mask.ts`, `events/keyboard.ts` and `hotkeys.ts`, `interaction/selection.ts` and `list-navigation.ts`, `dom/pointer-position.ts`, `events/pointer.ts`, `events/scroll.ts` |
| date, history, platform, scheduled, script-loader, share | `time/relative.ts`, `time/timer.ts`, `state/history.ts`, `media/platform.ts`, `time/debounce.ts`, `time/throttle.ts`, `dom/script-loader.ts`, `dom/share.ts` |
| presence, transition-group, spring, tween | `motion/presence.ts`, `motion/spring.ts`, `motion/tween.ts` |
| bounds, devices, idle, intersection-observer, media, resize-observer, mutation-observer, page visibility | `observers/*`, `device/media-devices.ts`, `events/idle.ts`, `media/mediaquery.ts`, `media/breakpoints.ts`, `events/visibility.ts` |
| broadcast-channel, clipboard, fullscreen, geolocation, mediastream, permission, timer | `net/broadcast.ts`, `dom/clipboard.ts`, `device/fullscreen.ts`, `device/geolocation.ts`, `device/media-stream.ts`, `device/permissions.ts`, `time/interval.ts` |
| connectivity, sse, websocket | `net/online.ts`, `net/sse.ts`, `net/websocket.ts` |
| masonry, pagination, virtual, sortable, drag-drop within a page | `state/virtual.ts`, `state/pagination.ts`, `interaction/reorder.ts`, `interaction/pointer-drag.ts` |
| storage, url, cookies | `foldkit-mirror` (`Mirror.kv`, `Mirror.url`, `Mirror.cookie`) |
| fetch, resource, graphql | Foldkit's `http`, `foldkit-remote` |
| upload, form, styles | `foldkit-mixins-ui` (`FileUpload`, `FileDrop`, `FileInput`), `foldkit-form`, `foldkit-mixins` `Style` |
| promise, queue, async, event-listener, raf | Effect (`Schedule`, `Queue`, fibers, `Stream.fromEventListener`) and Foldkit's render loop |
| state-machine, keyed | `update` over the Model and Foldkit's `experimental/machine`; `h.Key` |

Not applicable in an Elm architecture: controlled-props, event-bus, event-dispatcher, flux-store, props, the array, object and math utilities, event-props, context, jsx-tokenizer, list, match, range, refs, and the reactivity packages (controlled-signal, deep, destructure, lifecycle, map, memo, mutable, rootless, set, signal-builders, static-store, trigger).
