import * as React from 'react'
import { PRODUCT_DISPLAY_NAME } from '../../constants/product.js'
import { Box, Text } from '../../ink.js'
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js'

export function General(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box>
        <Text>
          {PRODUCT_DISPLAY_NAME} understands your codebase, makes edits with
          your permission, and executes commands - right from your terminal.
        </Text>
      </Box>
      <Box flexDirection="column" gap={1}>
        <Box>
          <Text bold>New surfaces</Text>
        </Box>
        <Text dimColor>/tui flicker-free for fixed prompt and smooth scroll</Text>
        <Text dimColor>/logo to pick the startup/header mascot</Text>
        <Text dimColor>
          /bg or openclaude --bg to start detached background sessions
        </Text>
        <Text dimColor>
          left arrow on an empty prompt, or openclaude agents, to open Agent View
        </Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text bold>Shortcuts</Text>
        </Box>
        <PromptInputHelpMenu gap={2} fixedWidth />
      </Box>
    </Box>
  )
}
