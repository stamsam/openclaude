import React from 'react'
import { Text } from '../ink.js'

type Props = {
  children: React.ReactNode
  indent?: number
}

/**
 * Consistent tree line for diagnostic sections.
 * Replaces raw `└ ` prefixes with a padded component so all Doctor
 * sections use the same indent (2 spaces) and avoid the previous
 * two-space / four-space mix.
 */
export function TreeLine({ children, indent = 2 }: Props): React.ReactNode {
  return (
    <Text>
      {' '.repeat(indent)}└ {children}
    </Text>
  )
}
