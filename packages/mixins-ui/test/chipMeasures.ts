/** Where the label's capitals and x-height band and the button's middle lie against the pill's middle, and the room at each end. */
export const chipMeasures = (chip: HTMLElement) => {
  const pill = chip.getBoundingClientRect()
  const button = chip.querySelector('button')!.getBoundingClientRect()
  const face = getComputedStyle(chip)
  const context = document.createElement('canvas').getContext('2d')!
  context.font = `${face.fontWeight} ${face.fontSize} ${face.fontFamily}`
  // A zero-size inline box in the label's line sits on its baseline.
  const probe = document.createElement('i')
  probe.style.cssText = 'display:inline-block;inline-size:0;block-size:0'
  chip.prepend(probe)
  const baseline = probe.getBoundingClientRect().bottom
  probe.remove()
  const labelLeft = (() => {
    const range = document.createRange()
    range.selectNodeContents(chip.firstChild!)
    return range.getBoundingClientRect().left
  })()
  const middle = pill.top + pill.height / 2
  return {
    xBand: baseline - context.measureText('x').actualBoundingBoxAscent / 2 - middle,
    cap: baseline - context.measureText('H').actualBoundingBoxAscent / 2 - middle,
    mark: button.top + button.height / 2 - middle,
    startRoom: labelLeft - pill.left,
    endRoom: pill.right - button.right,
    verticalRoom: button.top - pill.top,
    height: pill.height,
    // What the pill is without `text-box`: the line and an inset above and below.
    untrimmedHeight:
      parseFloat(face.lineHeight) +
      2 * 0.1 * parseFloat(getComputedStyle(document.documentElement).fontSize),
  }
}
