/**
 * The Primitives gallery's data: the package's subpaths as families, and one
 * card for each module a subpath's index re-exports. A card names the export
 * a reader imports; `test/primitives.test.ts` holds the cards against the
 * package's source and its runtime exports, so a new primitive without a card
 * fails there.
 */

/** What shape a primitive takes, as the package README names the forms. */
export type Form =
  | 'bundle'
  | 'bundle factory'
  | 'entry'
  | 'Mount'
  | 'Command'
  | 'function'
  | 'service'
  | 'Behavior'

export interface Card {
  /** The module under the family's folder, without its extension. */
  readonly module: string
  /** The export a reader imports from the family's subpath. */
  readonly name: string
  readonly form: Form
  readonly about: string
}

export interface Family {
  readonly id: string
  readonly title: string
  readonly about: string
  readonly cards: ReadonlyArray<Card>
}

/** Where the family's README is served: a guide of the primitives subsite, not a page of its own at the root. */
export const guideOf = (family: string) => `/primitives/guides/${family}`

/** The family's import path: its subpath of the package. */
export const importPath = (family: string) => `foldkit-primitives/${family}`

/**
 * Modules a subpath's index re-exports that are no primitive of their own: a
 * constant or a helper another card's primitive reads. Each says whose.
 */
export const partsOf: Readonly<Record<string, string>> = {
  'dom/edge-scroll': 'the `edge` option of PointerDrag and Marquee',
  'dom/edge-scroller': 'what EdgeScroll runs',
  'dom/focusable': 'the marks FocusScope, FocusReturn and FocusRecovery read',
}

const bundle = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'bundle',
  about,
})
const factory = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'bundle factory',
  about,
})
const entry = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'entry',
  about,
})
const mount = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'Mount',
  about,
})
const command = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'Command',
  about,
})
const pure = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'function',
  about,
})
const behavior = (module: string, name: string, about: string): Card => ({
  module,
  name,
  form: 'Behavior',
  about,
})

export const families: ReadonlyArray<Family> = [
  {
    id: 'media',
    title: 'Media',
    about:
      'What the browser says about its surroundings: a media query, the viewport, the platform.',
    cards: [
      bundle(
        'mediaquery',
        'MediaQuery',
        'Whether a CSS media query matches, kept in your Model. `PrefersDark` and `PrefersReducedMotion` are presets.',
      ),
      bundle(
        'breakpoints',
        'Breakpoints',
        'The window’s width and the named breakpoint it falls in, from a table you pass.',
      ),
      pure(
        'platform',
        'platformFromUA',
        'The platform read from a user-agent string passed in, so a test pins it; `isBrowser` and `isServer` say where the code runs.',
      ),
    ],
  },
  {
    id: 'net',
    title: 'Network',
    about:
      'What the network reported last: online or not, a socket, an event stream, a post from another tab.',
    cards: [
      bundle('online', 'Online', 'Whether the browser reports a network connection.'),
      factory(
        'websocket',
        'websocket',
        'A WebSocket as a bundle: its status, the last error, and each message received or sent.',
      ),
      factory(
        'sse',
        'sse',
        'A server-sent events connection as a bundle: its status, the last error, and each message received.',
      ),
      entry(
        'broadcast',
        'broadcastMessages',
        'Messages other tabs post on a named channel, as an entry; `postBroadcast` is the Command that posts one.',
      ),
      pure(
        'sharedHost',
        'SharedHost',
        'One host for every tab: a SharedWorker serving a conversation per opening, or the page itself where there is no SharedWorker.',
      ),
    ],
  },
  {
    id: 'time',
    title: 'Time',
    about:
      'What the clock said last: a count of ticks, when the last one was, a value that settled after typing stopped.',
    cards: [
      bundle('timer', 'Timer', 'A count of ticks at an interval, started and stopped by Messages.'),
      bundle(
        'interval',
        'Interval',
        'Ticks stamped with Effect’s clock, for a view that shows a clock or an elapsed time.',
      ),
      entry(
        'ticks',
        'ticks',
        'A clock your Model drives: whether it runs and how fast are read from your Model, so no second running flag exists.',
      ),
      factory(
        'debounce',
        'debounce',
        'A value that settles after it stops changing for a delay, then reports once.',
      ),
      bundle(
        'throttle',
        'Throttle',
        'Lets an attempt through at most once per interval and reports when it did.',
      ),
      pure(
        'relative',
        'formatRelativeTime',
        'Relative time as a function: picks the unit and leaves the wording to `Intl.RelativeTimeFormat`.',
      ),
    ],
  },
  {
    id: 'state',
    title: 'State',
    about:
      'Application state with nowhere else to live: the page, the undo stack, the locale, a selection, a window of rows.',
    cards: [
      bundle(
        'pagination',
        'Pagination',
        'The current page, the page size and the total, with the steps between pages.',
      ),
      factory(
        'history',
        'History',
        'An undo stack: past, present and future values, with push, undo, redo and a capacity.',
      ),
      bundle('locale', 'Locale', 'The reader’s locale, set by a Message.'),
      bundle(
        'selection',
        'SelectionSet',
        'Which ids are selected: select, deselect, toggle, replace all, clear.',
      ),
      bundle(
        'virtual',
        'Virtual',
        'The scroll, row heights and layout of a virtualized list, so the Model knows which rows to draw.',
      ),
      pure(
        'box',
        'Box',
        'Boxes that move and resize as pure functions: constraints, aspect ratio, a grid and keyboard steps.',
      ),
      pure(
        'range',
        'range',
        'A numeric range as an array, `range(1, 4)` is `[1, 2, 3]`: the pagination companion.',
      ),
    ],
  },
  {
    id: 'motion',
    title: 'Motion',
    about:
      'Where an animation is, as a number in the Model: a tween, a spring, a mount that leaves before it is removed.',
    cards: [
      bundle('tween', 'Tween', 'A value moving from one number to another over a fixed time.'),
      bundle('spring', 'Spring', 'A value that settles on a target by stiffness and damping.'),
      bundle(
        'presence',
        'Presence',
        'Show and hide with a leave phase, so content can animate out before it is removed.',
      ),
      {
        module: 'motion',
        name: 'Motion',
        form: 'service',
        about:
          'Whether motion should be reduced, a service read when a transition starts; absent, motion is full.',
      },
    ],
  },
  {
    id: 'device',
    title: 'Device',
    about:
      'What the hardware reported last: a position, cameras, a live stream, a permission, fullscreen.',
    cards: [
      bundle(
        'geolocation',
        'Geolocation',
        'The device’s position: its status, the coordinates, and a denial the view can say.',
      ),
      factory(
        'media-devices',
        'mediaDevices',
        'The cameras and microphones present, refreshed when they change.',
      ),
      factory(
        'media-stream',
        'mediaStream',
        'A live camera or microphone stream: started, stopped, denied or ended.',
      ),
      factory(
        'permissions',
        'permissions',
        'The state of named permissions, watched as the browser changes them.',
      ),
      command(
        'fullscreen',
        'enterFullscreen',
        'Fullscreen as Commands, with `fullscreenChanges` reporting what the document says.',
      ),
    ],
  },
  {
    id: 'events',
    title: 'Events',
    about:
      'Window-level events: visibility, size, idleness, input modality, keys, pointer, scroll and focus.',
    cards: [
      bundle('visibility', 'Visibility', 'Whether the page is visible.'),
      bundle('window-size', 'WindowSize', 'The window’s width and height.'),
      bundle('idle', 'Idle', 'Whether the reader has been inactive for a timeout.'),
      bundle(
        'input-modality',
        'InputModality',
        'Whether the page is being driven by keyboard, mouse or touch.',
      ),
      entry(
        'keyboard',
        'keyboardEvents',
        'Key presses and releases, reported to your Message; the parent keeps whatever key state it wants.',
      ),
      entry('pointer', 'pointerEvents', 'Pointer moves, reported as positions.'),
      entry('scroll', 'scrollEvents', 'The window’s scroll position, as it changes.'),
      entry(
        'active-element',
        'activeElementEvents',
        'The focused element’s tag and id, as focus moves.',
      ),
      pure(
        'hotkeys',
        'matchHotkey',
        'Matches a key press against a hotkey pattern; `formatHotkey` and `ariaKeyshortcuts` write it for display and for assistive technology.',
      ),
    ],
  },
  {
    id: 'observers',
    title: 'Observers',
    about:
      'Element-scoped observation as Mounts: attach one with `h.OnMount` on the element it watches.',
    cards: [
      mount('resize', 'Resize', 'An element’s content box size, reported as it changes.'),
      mount(
        'intersection',
        'Intersection',
        'Whether an element crosses the viewport, and how much of it shows.',
      ),
      mount(
        'mutation',
        'Mutation',
        'Changes to an element’s subtree: nodes added or removed, attributes changed.',
      ),
      mount('bounds', 'Bounds', 'An element’s rectangle, the current one first.'),
    ],
  },
  {
    id: 'dom',
    title: 'DOM',
    about:
      'Element Mounts that act while attached, and one-shot Commands that run once and report back.',
    cards: [
      command(
        'clipboard',
        'copyText',
        'Copies text to the clipboard, and `readText` reads it; each answers with a Message.',
      ),
      command(
        'share',
        'share',
        'Opens the Web Share sheet; a dismissal is its own outcome, not a failure.',
      ),
      command(
        'script-loader',
        'loadScript',
        'Appends a script to the head unless it is there, once per URL.',
      ),
      command(
        'image-decode',
        'decodeImage',
        'Fetches and decodes an image before it is shown, so a switch never passes through a blank.',
      ),
      mount('autofocus', 'Autofocus', 'Focuses its element when it is drawn.'),
      mount(
        'input-mask',
        'InputMask',
        'Formats typed text by a pattern, reporting the masked value and the raw one.',
      ),
      mount(
        'keep-in-view',
        'KeepInView',
        'Scrolls what newly matches a selector, such as the row just selected, into view the least amount that shows it.',
      ),
      mount(
        'measure',
        'Measure',
        'Writes where marked elements are to custom properties, with no Message and no Model, for a view to draw over them.',
      ),
      mount(
        'track-box',
        'TrackBox',
        'Follows one element by id and writes its box to custom properties.',
      ),
      mount(
        'fluid-hover',
        'FluidHover',
        'Writes a moving highlight’s place to custom properties on its container, for a stylesheet to draw.',
      ),
      mount(
        'scroll-bars',
        'ScrollBars',
        'Overlay scroll bars: marks the bars beside a scroller and writes their custom properties.',
      ),
      mount(
        'scroll-settle',
        'ScrollSettle',
        'Hears a scroller come to rest and reports which item starts nearest its start: a snapping carousel reads it as the slide shown.',
      ),
      mount(
        'keyboard-inset',
        'KeyboardInset',
        'Writes how much of the layout viewport the on-screen keyboard covers to `--fk-keyboard-inset`.',
      ),
      mount(
        'focus-scope',
        'FocusScope',
        'Contains focus within an element, and restores it on the way out.',
      ),
      mount(
        'focus-return',
        'FocusReturn',
        'Returns focus, when an overlay closes, to what had it before the overlay took it.',
      ),
      mount(
        'focus-recovery',
        'FocusRecovery',
        'Where focus goes, tried in order, when the part that had it is gone.',
      ),
      mount(
        'follow-tab-stop',
        'FollowTabStop',
        'Keeps focus inside a container of roving tab stops on its stop when a transition moves or removes it.',
      ),
      mount(
        'layers',
        'ScrollLock',
        'Locks the page’s scroll under an overlay; `HideOutside` hides the rest of the page from assistive technology.',
      ),
      mount(
        'pointer-position',
        'PointerPosition',
        'A pointer’s press, move and release as places in the element’s padding box, with pressure.',
      ),
      mount(
        'pointer-drag',
        'PointerDrag',
        'A drag over marked items, reporting the zone of the item it is over.',
      ),
      mount(
        'drag-preview',
        'DragPreview',
        'Shows a drag’s preview in the top layer, on an element with `popover="manual"`.',
      ),
      mount(
        'move',
        'Move',
        'Moves a draggable element, reporting where it started, went and ended.',
      ),
      mount('targets', 'Targets', 'Reports which marked descendant the pointer hovers or presses.'),
      mount(
        'marquee',
        'Marquee',
        'A lasso over marked descendants, reporting the rectangle and what it touches.',
      ),
      mount(
        'swipe',
        'Swipe',
        'A swipe on its element: where it started, and where it ended with the release velocity.',
      ),
      mount(
        'editable-text',
        'EditableText',
        'Text edited in place, reporting each edit, a commit and a cancel.',
      ),
      pure(
        'scroll',
        'keepScroll',
        'Keeps the window’s scroll across an application’s own navigations.',
      ),
      pure(
        'pointed-links',
        'pointedLinks',
        'The address of the link a reader means to follow, once a pointer or focus has rested on it, for a preload.',
      ),
      pure(
        'visible-links',
        'visibleLinks',
        'The address of each same-origin link that scrolls into view, for a preload; opt-in.',
      ),
    ],
  },
  {
    id: 'interaction',
    title: 'Interaction',
    about:
      'Keyboard, pointer and focus patterns whose state a view’s slots must reflect: a Bundle for the state and a Behavior for the slots.',
    cards: [
      bundle('press', 'Press', 'Pointer and keyboard activation of one element as one fact.'),
      bundle('long-press', 'LongPress', 'Holding an element down for a threshold is one fact.'),
      bundle(
        'repeat',
        'Repeat',
        'A held stepper: one step on press, then another every interval while held.',
      ),
      bundle(
        'selection',
        'Selection',
        'Which ids are selected, in single, multiple or range mode, and the anchor a range extends from.',
      ),
      bundle(
        'roving-tabindex',
        'RovingTabindex',
        'One tab stop for a set of items: arrows move focus between them.',
      ),
      bundle(
        'list-navigation',
        'ListNavigation',
        'Keyboard navigation of a list: a roving tab stop, type to find, and PageUp and PageDown.',
      ),
      bundle(
        'grid-navigation',
        'GridNavigation',
        'Arrow keys over items laid out in rows of a number of columns.',
      ),
      bundle(
        'spatial-navigation',
        'SpatialNavigation',
        'Arrow keys over freely placed items: each arrow moves to the nearest one that way.',
      ),
      bundle(
        'tree-navigation',
        'TreeNavigation',
        'Keyboard navigation of a tree after the WAI-ARIA tree pattern: one tab stop, rows shown or folded.',
      ),
      bundle(
        'typeahead',
        'Typeahead',
        'Printable keys build a query that a timer clears, and the query picks the item to move to.',
      ),
      bundle(
        'reorder',
        'Reorder',
        'Moving an item to another place in a list or tree, by keyboard and by pointer.',
      ),
      bundle(
        'inline-edit',
        'InlineEdit',
        'Editing a value where it is shown: Enter or F2 starts, Enter saves, Escape puts it back.',
      ),
      bundle(
        'swipe-actions',
        'SwipeActions',
        'Swipe-to-reveal actions behind a row, with a way in that needs no pointer.',
      ),
      bundle(
        'live-announce',
        'LiveAnnounce',
        'Polite and assertive announcements for assistive technology, debounced so a burst reads once.',
      ),
      bundle(
        'dismiss-layer',
        'DismissLayer',
        'Dismissable layers: Escape closes the topmost, and a press outside closes the layers it is outside of.',
      ),
      behavior(
        'presence',
        'Presence',
        'Draws a phase the Model already holds: a leaving row is inert for the whole exit.',
      ),
      behavior(
        'focus-visible',
        'FocusVisible',
        'Marks the target while the page is driven by keyboard, so a stylesheet can show a ring only then.',
      ),
      behavior('focus-scope', 'FocusScope', 'Contains focus within a container slot.'),
      behavior(
        'focus-recovery',
        'FocusRecovery',
        'Marks an owner slot and its parts, and recovers focus when a part goes.',
      ),
      behavior(
        'layers',
        'Layers',
        'The scroll lock and the hidden-outside set, wired as Behaviors to a container slot.',
      ),
      behavior(
        'move',
        'Move',
        'A draggable slot, mapping its drag facts into the view’s Messages.',
      ),
      behavior(
        'pointer-drag',
        'PointerDrag',
        'A container slot whose marked items can be dragged over each other.',
      ),
      behavior('marquee', 'Marquee', 'A lasso over the container’s marked descendants.'),
      behavior(
        'targets',
        'Targets',
        'Reports which descendant of a container slot is hovered or pressed.',
      ),
      behavior('editable-text', 'EditableText', 'Text edited in place, wired to a container slot.'),
      behavior(
        'bundle-behavior',
        'BundleBehavior',
        'The mixin half of a Bundle: a Behavior whose slots are wired to the Bundle’s Messages.',
      ),
      behavior(
        'overlay',
        'Overlay',
        'One overlay policy, modal or non-modal, instead of nine subtly different overlays.',
      ),
      pure(
        'placing',
        'Placing',
        'Keeps a floating panel inside the viewport: shifts it from an edge and flips it above its trigger.',
      ),
    ],
  },
]
