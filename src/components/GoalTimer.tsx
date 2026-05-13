import { useEffect, useState, useRef } from 'react'
import { Text, Box } from '../ink.js'
import {
  beginGoalRuntimeSession,
  endGoalRuntimeSession,
  getGoalElapsedSeconds,
  heartbeatGoalRuntimeSession,
} from './goalCore.js'

export function GoalTimer() {
  const [display, setDisplay] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let mounted = true

    const tick = async () => {
      if (!mounted) return
      try {
        const goal = await heartbeatGoalRuntimeSession()
        if (!mounted) return
        if (!goal || goal.status !== 'active') {
          setDisplay(null)
          return
        }
        const elapsed = getGoalElapsedSeconds(goal)
        const h = Math.floor(elapsed / 3600)
        const m = Math.floor((elapsed % 3600) / 60)
        const s = Math.floor(elapsed % 60)
        const timeStr =
          h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
        const tokens = goal.tokens_used
        const tokensStr =
          tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`
        setDisplay(`goal ${timeStr}  ${tokensStr} tokens`)
      } catch {
        if (mounted) setDisplay(null)
      }
    }

    void beginGoalRuntimeSession().then(() => tick())
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      mounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      void endGoalRuntimeSession()
    }
  }, [])

  if (!display) return null

  return (
    <Box>
      <Text dimColor>{display}</Text>
    </Box>
  )
}
