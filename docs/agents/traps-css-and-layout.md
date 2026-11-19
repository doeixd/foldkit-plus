# Traps: CSS and layout

Read before styling or laying out a component, a theme knob, an animation or an overlay.

- **A positioned sibling drawn later paints over an absolute overlay.**
  The OtpField's input lay over its cells with `position: absolute`, but each cell was `position: relative` and came after it, so every press landed on a cell and the input never took focus (unit tests read only markup). Let presses through (`pointer-events: none`) or raise the overlay; test with a real click at the covered spot (`otpField.browser.test.ts`).
- **A sized `svg` in a squeezed flex row shrinks to nothing.**
  Its `width` attribute is no floor: a 16px icon beside unshrinkable words in a 40px row measured 0 wide. The CMS's hand-written icon carried `flex-shrink: 0`; moving it onto `Icon.draw` dropped it on a guess and a browser probe said otherwise (`Icon.draw` now writes it). Probe a layout claim in a browser before deleting the rule.
- **A zero-duration animation filled `forwards` shows its last frame.**
  The Marquee filled forwards, so with the `motion` knob at 0 every copy stood one length on and the copy in view was an `inert` clone; a finite round ended the same way. With no fill, a round of no duration, or one that ended, shows its first frame.
- **`color-scheme: normal` resolves `light-dark()` to its light half.**
  Mutating the QR code's `colorScheme: 'light'` to `'normal'` survived on a dark page; only deleting the declaration let the code follow the page. Mutate such a declaration by deleting it.
- **`text-box` trims a block container's lines, and nothing else.**
  On the `inline-flex` Button it did nothing (a 20px line stayed 20px; on a block it was 10px) and it does not inherit into the anonymous box holding the words. Measure a trimmed element's height before claiming the trim works.
- **A knob set on a region does not reach a portaled panel, unless the Mount that portals it is wrapped.**
  Upstream's Menu, Listbox and Combobox portal their panel to the document, so a popup's `size` set on its `wrapper` never reached its rows (a test drawing slots as static markup passed). Set what a panel needs on the panel's own slot and test by opening the real component (`popupLadder.browser.test.ts`). `Anchor.inheritRegion` carries the region's custom properties onto such a panel; it must watch from the panel's own Mount, since a parent's Mount (the Popover's `layer`) runs after its children's and misses the move.
- **`scrollBy` stops at every `scroll-snap-stop: always`.**
  A carousel drawn at its third slide landed on its second. Use `scrollTo` or `scrollIntoView` to pass snaps.
- **A cutout drawn by a wrapper drifts from the avatar's shape.**
  Chirp's profile portrait sat in a span with a 9999px radius and page-coloured border around an Avatar the theme rounds to a square (radius factor 0.45): a circle showed behind a rounded square. Draw the band on the avatar itself (the Avatar recipe's `ring: 'page'`, a shadow, which follows its own corner).
- **A `ch` is the width of a zero, not of a character.**
  The blog set its measure at `65ch`, "about 65 characters", and Geist at 18px drew 84 characters a line (a zero is 0.66em there; a letter averages 0.47em). Read the characters a line holds from the rendered text (a `Range` over each character, grouped by its top) and size the measure from that: `48ch` gives 68. A test asserts the `ch` bound, which holds in any font; the characters per line move with the face.
