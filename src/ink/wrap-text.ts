import sliceAnsi from '../utils/sliceAnsi.js'
import { stringWidth } from './stringWidth.js'
import type { Styles } from './styles.js'
import { wrapAnsi } from './wrapAnsi.js'

const ELLIPSIS = '…'

// sliceAnsi may include a boundary-spanning wide char (e.g. CJK at position
// end-1 with width 2 overshoots by 1). Retry with a tighter bound once.
// Multi-codepoint graphemes (ZWJ emoji, VS16 sequences) can also leave the
// slice shorter than `end - start` when sliceAnsi splits a code-point — retry
// with a wider bound too. Capped at 3 retries to bound pathological inputs.
function sliceFit(text: string, start: number, end: number): string {
  const target = end - start
  let lo = start
  let hi = end
  let s = sliceAnsi(text, lo, hi)
  let w = stringWidth(s)
  let attempts = 0
  while (w > target && attempts < 3) {
    hi -= 1
    s = sliceAnsi(text, lo, hi)
    w = stringWidth(s)
    attempts++
  }
  attempts = 0
  while (w < target && hi < text.length && attempts < 3) {
    hi += 1
    s = sliceAnsi(text, lo, hi)
    w = stringWidth(s)
    attempts++
  }
  return s
}

function truncate(
  text: string,
  columns: number,
  position: 'start' | 'middle' | 'end',
): string {
  if (columns < 1) return ''
  if (columns === 1) return ELLIPSIS

  const length = stringWidth(text)
  if (length <= columns) return text

  if (position === 'start') {
    return ELLIPSIS + sliceFit(text, length - columns + 1, length)
  }
  if (position === 'middle') {
    // Total cells must equal `columns`. left (half) + ellipsis (1) + right (rest).
    // half = floor(columns/2) — right side is one shorter when columns is odd,
    // which keeps the ellipsis at the geometric midpoint.
    const half = Math.floor(columns / 2)
    const rightLen = columns - half - 1
    return (
      sliceFit(text, 0, half) +
      ELLIPSIS +
      sliceFit(text, length - rightLen, length)
    )
  }
  return sliceFit(text, 0, columns - 1) + ELLIPSIS
}

export default function wrapText(
  text: string,
  maxWidth: number,
  wrapType: Styles['textWrap'],
): string {
  if (wrapType === 'wrap') {
    return wrapAnsi(text, maxWidth, {
      trim: false,
      hard: true,
    })
  }

  if (wrapType === 'wrap-trim') {
    return wrapAnsi(text, maxWidth, {
      trim: true,
      hard: true,
    })
  }

  if (wrapType!.startsWith('truncate')) {
    let position: 'end' | 'middle' | 'start' = 'end'

    if (wrapType === 'truncate-middle') {
      position = 'middle'
    }

    if (wrapType === 'truncate-start') {
      position = 'start'
    }

    return truncate(text, maxWidth, position)
  }

  return text
}
