import * as React from 'react';
import { PermissionRuleList } from '../../components/permissions/rules/PermissionRuleList.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { createPermissionRetryMessage } from '../../utils/messages.js';
import {
  enableYoloPermissionMode,
  isPermissionsYoloCommand,
} from '../../utils/permissions/yoloPermissionMode.js';

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  if (isPermissionsYoloCommand(`/permissions ${args ?? ''}`)) {
    const result = enableYoloPermissionMode({
      getToolPermissionContext: () => context.getAppState().toolPermissionContext,
      setToolPermissionContext: updater => {
        context.setAppState(prev => ({
          ...prev,
          toolPermissionContext: updater(prev.toolPermissionContext),
        }))
      },
    })
    onDone(result.message, { display: 'system' })
    return null
  }

  return <PermissionRuleList onExit={onDone} onRetryDenials={commands => {
    context.setMessages(prev => [...prev, createPermissionRetryMessage(commands)]);
  }} />;
};
