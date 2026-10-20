// Written by `pnpm icons` from icons.json. Do not edit.
// Tabler Icons (MIT, Paweł Kuna): @iconify-json/tabler 1.2.42, https://github.com/tabler/tabler-icons/blob/master/LICENSE
import type { IconData } from 'foldkit-media'

export type IconName =
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'pipette'
  | 'rotate-ccw'
  | 'rotate-cw'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'lock'
  | 'close'

export const icons: { readonly [Name in IconName]: IconData } = {
  search: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6',
        },
        children: [],
      },
    ],
  },
  eye: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M10 12a2 2 0 1 0 4 0a2 2 0 0 0-4 0' }, children: [] },
          { tag: 'path', attributes: { d: 'M21 12q-3.6 6-9 6t-9-6q3.6-6 9-6t9 6' }, children: [] },
        ],
      },
    ],
  },
  'eye-off': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M10.585 10.587a2 2 0 0 0 2.829 2.828' }, children: [] },
          {
            tag: 'path',
            attributes: {
              d: 'M16.681 16.673A8.7 8.7 0 0 1 12 18q-5.4 0-9-6q1.908-3.18 4.32-4.674m2.86-1.146A9 9 0 0 1 12 6q5.4 0 9 6q-1 1.665-2.138 2.87M3 3l18 18',
            },
            children: [],
          },
        ],
      },
    ],
  },
  pipette: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm11 7l6 6M4 16L15.7 4.3a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4L8 20H4z',
        },
        children: [],
      },
    ],
  },
  'rotate-ccw': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M19.95 11a8 8 0 1 0-.5 4m.5 5v-5h-5',
        },
        children: [],
      },
    ],
  },
  'rotate-cw': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5',
        },
        children: [],
      },
    ],
  },
  success: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0' }, children: [] },
          { tag: 'path', attributes: { d: 'm9 12l2 2l4-4' }, children: [] },
        ],
      },
    ],
  },
  warning: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M12 9v4m-1.637-9.409L2.257 17.125a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87L13.637 3.59a1.914 1.914 0 0 0-3.274 0M12 16h.01',
        },
        children: [],
      },
    ],
  },
  error: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0m7-2l4 4m0-4l-4 4',
        },
        children: [],
      },
    ],
  },
  info: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0m9-3h.01' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M11 12h1v4h1' }, children: [] },
        ],
      },
    ],
  },
  lock: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: { d: 'M11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V7a4 4 0 1 1 8 0v4' },
            children: [],
          },
        ],
      },
    ],
  },
  close: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M18 6L6 18M6 6l12 12',
        },
        children: [],
      },
    ],
  },
}

/** Where an application imports each icon from: its set, and its name in `virtual:foldkit-icons/<set>`. */
export const imports: {
  readonly [Name in IconName]: { readonly set: string; readonly name: string }
} = {
  search: { set: 'tabler', name: 'search' },
  eye: { set: 'tabler', name: 'eye' },
  'eye-off': { set: 'tabler', name: 'eyeOff' },
  pipette: { set: 'tabler', name: 'colorPicker' },
  'rotate-ccw': { set: 'tabler', name: 'rotate' },
  'rotate-cw': { set: 'tabler', name: 'rotateClockwise' },
  success: { set: 'tabler', name: 'circleCheck' },
  warning: { set: 'tabler', name: 'alertTriangle' },
  error: { set: 'tabler', name: 'circleX' },
  info: { set: 'tabler', name: 'infoCircle' },
  lock: { set: 'tabler', name: 'lock' },
  close: { set: 'tabler', name: 'x' },
}
