import React from 'react'
import { render } from '../ink.js'
import { AlternateScreen } from '../ink/components/AlternateScreen.js'
import { isFullscreenEnvEnabled, isMouseTrackingEnabled } from '../utils/fullscreen.js'
import { AppStateProvider } from '../state/AppState.js'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { HomeDashboard } from './HomeDashboard.js'
import { AgentViewDashboard } from './Dashboard.js'
import { attachToJob } from './runner.js'

function withProviders(node: React.ReactNode): React.ReactNode {
  return (
    <AppStateProvider>
      <KeybindingSetup>
        {node}
      </KeybindingSetup>
    </AppStateProvider>
  )
}

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
      withProviders(
        fullscreen
          ? <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{dashboard}</AlternateScreen>
          : dashboard,
      ),
    )
    await instance.waitUntilExit()
    if (!attachId) return
    const result = await attachToJob(attachId)
    keepOpen = result === 'dashboard'
  }
}

export async function openHomeDashboard(options: {
  cwd: string
  provider?: string
  model?: string
  permissionMode?: string
}): Promise<void> {
  const fullscreen = isFullscreenEnvEnabled()
  const dashboard = (
    <HomeDashboard
      cwd={options.cwd}
      provider={options.provider}
      model={options.model}
      permissionMode={options.permissionMode}
      fullscreen={fullscreen}
    />
  )
  const instance = await render(
    withProviders(
      fullscreen
        ? <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>{dashboard}</AlternateScreen>
        : dashboard,
    ),
  )
  await instance.waitUntilExit()
}
