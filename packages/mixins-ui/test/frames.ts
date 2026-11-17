/**
 * `requestAnimationFrame` as a loaded page runs it: the runtime's render
 * asked for while `WaitForPaint`'s frame starts the fade finds its Model
 * behind the queue and puts itself off a frame, as `renderFramePlain` does,
 * so any frame asked for meanwhile runs first. `panelId` is the popup's panel,
 * whose leave the test watches. Returns the function that puts the real one back.
 */
export const renderBehindTheQueue = (panelId: string) => {
  const real = window.requestAnimationFrame.bind(window)
  let inPaintWait = false
  window.requestAnimationFrame = callback => {
    const run = (time: number) => {
      const panel = document.getElementById(panelId)
      inPaintWait =
        callback.name === '' &&
        panel?.hasAttribute('data-leave') === true &&
        !panel.hasAttribute('data-closed')
      callback(time)
      inPaintWait = false
    }
    return callback.name === 'renderFramePlain' && inPaintWait ? real(() => real(run)) : real(run)
  }
  return () => {
    window.requestAnimationFrame = real
  }
}

/**
 * Holds `requestAnimationFrame`, as a loaded page does, so keys pressed meanwhile meet the
 * view the last frame drew. Returns the function that puts the real one back and runs what
 * was asked for.
 */
export const holdFrames = () => {
  const real = window.requestAnimationFrame.bind(window)
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  return () => {
    window.requestAnimationFrame = real
    for (const callback of held.splice(0)) real(callback)
  }
}
