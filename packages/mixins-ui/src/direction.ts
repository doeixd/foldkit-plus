/**
 * `key` as a left-to-right reader would press it: under `rtl` ArrowLeft and
 * ArrowRight swap, as Zag's `getEventKey` swaps them. A view reads its keys
 * through this, so its Messages and `update` take ArrowRight to mean "toward
 * the inline end" in either direction.
 */
export const readingKey = (key: string, direction: 'ltr' | 'rtl' | undefined): string => {
  if (direction !== 'rtl') return key
  if (key === 'ArrowLeft') return 'ArrowRight'
  if (key === 'ArrowRight') return 'ArrowLeft'
  return key
}
