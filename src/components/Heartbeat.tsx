import React, { useEffect, useState } from 'react'
import { Text } from '../ink.js'

const FRAMES = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'] as const
const INTERVAL_MS = 500

type Props = {
  color?: string
}

/**
 * Idle heartbeat dot — cycles through a braille pattern at 0.5 Hz.
 * Used in the footer when no external status line command is configured
 * and the agent is idle. Matches the "updateable footer with heartbeat"
 * pattern seen in gemini-cli, codex, and plandex.
 */
export function Heartbeat({ color = 'dim' }: Props): React.ReactNode {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length)
    }, INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return <Text color={color}>{FRAMES[frame]}</Text>
}
