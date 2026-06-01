import chalk from 'chalk'
import * as React from 'react'
import { ModelPicker } from '../../components/ModelPicker.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { getEffortEnvOverride, type EffortLevel } from '../../utils/effort.js'
import { isModelAllowed } from '../../utils/model/modelAllowlist.js'
import { getDefaultMainLoopModelSetting, renderDefaultModelSetting } from '../../utils/model/model.js'
import { getModelOptions } from '../../utils/model/modelOptions.js'

function renderModelLabel(model: string | null): string {
  const rendered = renderDefaultModelSetting(
    model ?? getDefaultMainLoopModelSetting(),
  )
  return model === null ? `${rendered} (default)` : rendered
}

function formatEnabledMessage(model: string | null): string {
  const envOverride = getEffortEnvOverride()
  const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL
  const overrideNote =
    envOverride !== undefined && envOverride !== null && envOverride !== 'max'
      ? `; note CLAUDE_CODE_EFFORT_LEVEL=${envRaw} still controls effort this session`
      : ''
  return `Ultracode enabled with ${chalk.bold(renderModelLabel(model))}: xhigh/max effort plus workflow orchestration reminders${overrideNote}`
}

export function UltracodePicker({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession)
  const setAppState = useSetAppState()

  function handleSelect(model: string | null, _effort: EffortLevel | undefined) {
    setAppState(prev => ({
      ...prev,
      mainLoopModel: model,
      mainLoopModelForSession: null,
      effortValue: 'max',
      ultracodeActive: true,
    }))
    onDone(formatEnabledMessage(model))
  }

  function handleCancel() {
    onDone(`Kept model as ${chalk.bold(renderModelLabel(mainLoopModel))}`)
  }

  return (
    <ModelPicker
      initial={mainLoopModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand
      headerText="Choose the OpenClaude model to use with ultracode. The list comes from OpenClaude's configured models and active provider route."
      skipSettingsWrite
    />
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args?: string,
): Promise<React.ReactNode> {
  const model = args?.trim()
  if (model) {
    return <SetUltracodeModelAndClose model={model === 'default' ? null : model} onDone={onDone} />
  }
  return <UltracodePicker onDone={onDone} />
}

function SetUltracodeModelAndClose({
  model,
  onDone,
}: {
  model: string | null
  onDone: LocalJSXCommandOnDone
}) {
  const setAppState = useSetAppState()

  React.useEffect(() => {
    async function applyModel(): Promise<void> {
      if (model && !isModelAllowed(model)) {
        onDone(
          `Model '${model}' is not available. Your organization restricts model selection.`,
        )
        return
      }

      if (
        model &&
        !getModelOptions().some(option => option.value === model)
      ) {
        onDone(
          `Model '${model}' is not in OpenClaude's current model list. Run /ultracode without an argument to choose from the configured models.`,
        )
          return
      }

      setAppState(prev => ({
        ...prev,
        mainLoopModel: model,
        mainLoopModelForSession: null,
        effortValue: 'max',
        ultracodeActive: true,
      }))
      onDone(formatEnabledMessage(model))
    }

    void applyModel()
  }, [model, onDone, setAppState])

  return null
}
