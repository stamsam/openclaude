import { useEffect, useState, useRef } from 'react'
import { Text, Box } from '../ink.js'
import { loadGoal } from '../../goal/core.js'

export function GoalTimer() {
  const [display, setDisplay] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let mounted = true

    const tick = async () => {
      if (!mounted) return
      try {
        const goal = await loadGoal()
        if (!mounted) return
        if (!goal || goal.status !== 'active') {
          setDisplay(null)
          return
        }
        const elapsed = Date.now() - new Date(goal.start_time).getTime()
        const h = Math.floor(elapsed / 3600000)
        const m = Math.floor((elapsed % 3600000) / 60000)
        const s = Math.floor((elapsed % 60000) / 1000)
        const timeStr = h > 0
          ? `${h}h ${m}m ${s}s`
          : m > 0
            ? `${m}m ${s}s`
            : `${s}s`
        const tokens = goal.tokens_used
        const tokensStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`
        setDisplay(`? ${timeStr}  ${tokensStr} tokens`)
      } catch {
        if (mounted) setDisplay(null)
      }
    }

    tick()
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      mounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (!display) return null

  return (
    <Box>
      <Text dimColor>{display}</Text>
    </Box>
  )
}
