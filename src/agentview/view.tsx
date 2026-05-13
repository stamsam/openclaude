import React from 'react'
import { render } from '../ink.js'
import { AlternateScreen } from '../ink/components/AlternateScreen.js'
import { isFullscreenEnvEnabled, isMouseTrackingEnabled } from '../utils/fullscreen.js'
import { AgentViewDashboard } from './Dashboard.js'
import { attachToJob } from './runner.js'

export async function openAgentView(options: {
  cwd: string
  provider?: string
  model?: string
  permissionMode?: string
}): Promise<void> {
  let keepOpen = true
  while (keepOpen) {
    let attachId: string | undefined
    const fullscreen = isFullscreenEnvEnabled()
    const dashboard = (
      <AgentViewDashboard
        cwd={options.cwd}
        provider={options.provider}
        model={options.model}
        permissionMode={options.permissionMode}
        fullscreen={fullscreen}
        onAttach={id => {
          attachId = id
        }}
      />
    )
    const instance = await render(
      fullscreen
        ? <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{dashboard}</AlternateScreen>
        : dashboard,
    )
    await instance.waitUntilExit()
    if (!attachId) return
    const result = await attachToJob(attachId)
    keepOpen = result === 'dashboard'
  }
}
