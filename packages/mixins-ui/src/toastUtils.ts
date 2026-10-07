/**
 * Pure view-supporting functions vendored verbatim (logic, names, and doc
 * comments) from `@foldkit/ui@0.165.0`, MIT License (c) 2025 Devin Jameson.
 * Source: `packages/ui/src/toast/swipeTarget.ts` at tag
 * `@foldkit/ui@0.165.0` in foldkit/foldkit.
 *
 * Why vendored instead of imported: `@foldkit/ui`'s exports map exposes only
 * its `public.js` subpaths, and this helper is not re-exported there. It is
 * small, pure, and dependency-free, so copying it keeps the toast view fork
 * compiling without a deep import that the package boundary forbids.
 * Behavior (Model, Message, update, Commands, Mounts) stays upstream in
 * `@foldkit/ui/toast`; only this view input is copied.
 *
 * If `@foldkit/ui` later publishes it (or a `toView` seam that removes the
 * need for the fork), delete this module and import from the package.
 */
const SWIPE_EXCLUDED_TARGET_SELECTOR =
  'button, a, input, select, textarea, [contenteditable], [role="button"], [role="link"]'

/** Whether a pointerdown originated on a child that should not start a
 *  Toast swipe. Mouse and pen presses on explicitly marked text preserve
 *  selection, while touch can still swipe across that content. @internal */
export const isSwipeExcludedTarget = (pointerType: string, target: EventTarget | null): boolean => {
  const targetElement = target instanceof Element ? target : null
  const parentElement = target instanceof Node ? target.parentElement : null
  const element = targetElement ?? parentElement

  if (element === null) {
    return false
  }

  if (element.closest(SWIPE_EXCLUDED_TARGET_SELECTOR) !== null) {
    return true
  }

  return pointerType !== 'touch' && element.closest('[data-toast-swipe-ignore]') !== null
}
