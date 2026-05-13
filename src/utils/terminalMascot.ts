import type { RGB } from '../components/StartupScreen.palettes.js'

export type TerminalMascot =
  | 'shiba'
  | 'crabby'
  | 'axo'
  | 'moth'
  | 'dump'
  | 'cacti'
  | 'bat'
  | 'toast'
  | 'shroom'
  | 'gorilla'
  | 'shark'
  | 'ostrich'
  | 'snail'
  | 'bandit'
  | 'jelly'

export const DEFAULT_TERMINAL_MASCOT: TerminalMascot = 'shiba'

export const TERMINAL_MASCOTS: Record<TerminalMascot, readonly string[]> = {
  shiba: [
    ' /\\_/\\ ',
    '( o.o )',
    ' > ^ < ',
    ' /|_|\\ ',
  ],
  crabby: [
    '\\  _  /',
    ' (o o) ',
    '/|___|\\',
    '  / \\  ',
  ],
  axo: [
    '<\\   />',
    ' (o o) ',
    ' /___\\ ',
    '/|   |\\',
  ],
  moth: [
    '/\\ | /\\',
    '( o.o )',
    ' \\ | / ',
    '  / \\  ',
  ],
  dump: [
    ' .---. ',
    '/ o o \\',
    '|  ^  |',
    ' \\___/ ',
  ],
  cacti: [
    '  Y   ',
    ' /o\\_ ',
    '|  _ \\',
    ' \\/ \\/',
  ],
  bat: [
    '/\\   /\\',
    '( o.o )',
    ' \\_^_/ ',
    '  / \\  ',
  ],
  toast: [
    ' .--.  ',
    '|o  o| ',
    '|_--_| ',
    ' /__\\  ',
  ],
  shroom: [
    ' .---. ',
    '/ o o \\',
    '\\__^__/',
    '  / \\  ',
  ],
  gorilla: [
    ' .-""-. ',
    '/ o  o \\',
    '|  __  |',
    ' \\_||_/ ',
  ],
  shark: [
    '   /\\__ ',
    '__/ o  \\',
    '\\_    _/',
    '  \\__/  ',
  ],
  ostrich: [
    '  __   ',
    ' /o \\  ',
    ' \\__|_ ',
    '  / /\\ ',
  ],
  snail: [
    ' _@/\\  ',
    '/ o o\\ ',
    '\\_--_/ ',
    '  /_/  ',
  ],
  bandit: [
    ' .--.  ',
    '|o--o| ',
    '|_[]_| ',
    ' /__\\  ',
  ],
  jelly: [
    ' .--.  ',
    '( o o )',
    ' \\__/ ',
    ' ||||  ',
  ],
}

export const TERMINAL_MASCOT_PIXELS: Partial<Record<TerminalMascot, readonly string[]>> = {
  shiba: [
    ' OO  OO ',
    'OOOOOOOO',
    'OOKOOKOO',
    'OOCCCCOO',
    ' OOKKOO ',
  ],
  crabby: [
    'R  RR  R',
    ' RRRRRR ',
    'RRKRRKRR',
    ' RRRRRR ',
    'R R  R R',
  ],
  gorilla: [
    '  DDDD  ',
    ' DDDDDD ',
    'DGKKKKGD',
    'DDGKKGDD',
    'D LDD L ',
  ],
  shark: [
    '  BBB   ',
    ' BBBBB  ',
    'BBBKBB  ',
    'BBCCCCBB',
    '  BB  B ',
  ],
}

export const TERMINAL_PIXEL_COLORS: Record<string, RGB> = {
  O: [224, 126, 76],
  C: [245, 226, 185],
  K: [18, 18, 18],
  R: [220, 108, 72],
  D: [77, 73, 70],
  G: [126, 121, 115],
  L: [170, 164, 157],
  B: [90, 133, 163],
}

export const TERMINAL_MASCOT_COLORS: Record<TerminalMascot, RGB> = {
  shiba: [224, 126, 76],
  crabby: [220, 108, 72],
  axo: [235, 142, 158],
  moth: [190, 142, 82],
  dump: [237, 218, 180],
  cacti: [98, 143, 101],
  bat: [116, 78, 112],
  toast: [107, 158, 162],
  shroom: [220, 90, 64],
  gorilla: [128, 122, 116],
  shark: [90, 133, 163],
  ostrich: [224, 126, 112],
  snail: [184, 137, 89],
  bandit: [115, 115, 112],
  jelly: [217, 105, 91],
}

export function getTerminalMascotRows(mascot: TerminalMascot): readonly string[] {
  return TERMINAL_MASCOT_PIXELS[mascot] ?? TERMINAL_MASCOTS[mascot]
}

export const TERMINAL_MASCOT_LABELS: Record<TerminalMascot, string> = {
  shiba: 'Shiba',
  crabby: 'Crabby',
  axo: 'Axo',
  moth: 'Moth',
  dump: 'Dump',
  cacti: 'Cacti',
  bat: 'Bat',
  toast: 'Toast',
  shroom: 'Shroom',
  gorilla: 'Gorilla',
  shark: 'Shark',
  ostrich: 'Ostrich',
  snail: 'Snail',
  bandit: 'Bandit',
  jelly: 'Jelly',
}

export const TERMINAL_MASCOT_NAMES = Object.keys(TERMINAL_MASCOTS) as TerminalMascot[]

export function isTerminalMascot(value: unknown): value is TerminalMascot {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TERMINAL_MASCOTS, value)
}

export function resolveTerminalMascot(value = process.env.OPENCLAUDE_MASCOT): TerminalMascot {
  if (isTerminalMascot(value)) return value
  return DEFAULT_TERMINAL_MASCOT
}
