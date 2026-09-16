import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-bundle example', () => {
  const lines = runDemo()

  it('places one bundle twice, a @foldkit/ui component, and a collection in one list', () => {
    expect(lines).toContain(
      'placements: MediaQuery@dark, MediaQuery@narrow, SectionTabs@tabs, Upload@uploads[]',
    )
    expect(lines).toContain('subscriptions: MediaQuery@dark/changes, MediaQuery@narrow/changes')
    expect(lines).toContain('init: dark=false tabs=settings section=general')
  })

  it('routes each placement’s Messages to its own slice', () => {
    expect(lines).toContain('dark after its subscription: true, narrow: false')
    expect(lines).toContain('dark after GotDarkMessage: false')
    expect(lines).toContain('section after the Tabs OutMessage: uploads')
  })

  it('adds, updates, and restarts collection items and folds their OutMessage', () => {
    expect(lines).toContain('uploads: u1=photo.png, u2=notes.txt')
    expect(lines).toContain('progress: u1=100%, u2=40%')
    expect(lines).toContain('finished: photo.png')
    expect(lines).toContain('u1 after restart: 0%')
  })

  it('validates ownership with placements beside a Sync contract', () => {
    expect(lines).toContain('findings: 0')
    expect(lines).toContain('├── dark      BUNDLE MediaQuery@dark')
    expect(lines).toContain('├── uploads   BUNDLE Upload@uploads[]')
    expect(lines).toContain('├── section   LOCAL')
    expect(lines).toContain('└── savedAt   SYNC Settings')
  })
})
