/** How far a button answers a pointer along and across the row, found by asking the page what is under it. */
export const reach = (button: HTMLElement): { readonly inline: number; readonly block: number } => {
  const box = button.getBoundingClientRect()
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const hits = (x: number, y: number) => document.elementsFromPoint(x, y)[0] === button
  let inline = 0
  for (let x = Math.floor(box.left) - 40; x < box.right + 40; x++) if (hits(x, cy)) inline++
  let block = 0
  for (let y = Math.floor(box.top) - 40; y < box.bottom + 40; y++) if (hits(cx, y)) block++
  return { inline, block }
}
