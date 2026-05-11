import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'node:path'

type RunCallbacks = {
  onTextChunk?: (text: string) => void
  onActionRequired?: (promptId: string, question: string) => void
}

type PendingRun = {
  callbacks: RunCallbacks
  resolve: (result: string) => void
  reject: (error: Error) => void
  fullText: string
  canceled: boolean
}

export class OpenClaudeGrpcClient {
  private readonly client: any
  private call: grpc.ClientDuplexStream<any, any> | null = null
  private pendingRun: PendingRun | null = null

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {
    const protoPath = path.resolve(
      import.meta.dirname,
      '../proto/openclaude.proto',
    )
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    })
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
    const openclaudeProto = protoDescriptor.openclaude.v1
    this.client = new openclaudeProto.AgentService(
      `${host}:${port}`,
      grpc.credentials.createInsecure(),
    )
  }

  async runPrompt(
    prompt: string,
    options: {
      sessionId: string
      workspaceDir: string
      model?: string
    },
    callbacks: RunCallbacks = {},
  ): Promise<string> {
    if (this.pendingRun) {
      throw new Error('A run is already in progress')
    }

    this.ensureCall()

    return await new Promise<string>((resolve, reject) => {
      this.pendingRun = {
        callbacks,
        resolve,
        reject,
        fullText: '',
        canceled: false,
      }

      this.call!.write({
        request: {
          session_id: options.sessionId,
          message: prompt,
          working_directory: options.workspaceDir,
          ...(options.model ? { model: options.model } : {}),
        },
      })
    })
  }

  respondToPrompt(promptId: string, approved: boolean): void {
    this.ensureCall()
    this.call!.write({
      input: {
        prompt_id: promptId,
        reply: approved ? 'yes' : 'no',
      },
    })
  }

  cancelCurrent(reason: string = 'telegram-stop'): void {
    if (!this.call || !this.pendingRun) {
      return
    }
    this.pendingRun.canceled = true
    this.call.write({
      cancel: {
        reason,
      },
    })
  }

  close(): void {
    this.call?.end()
    this.call = null
  }

  private ensureCall(): void {
    if (this.call) {
      return
    }

    this.call = this.client.Chat()
    this.call.on('data', (message: any) => this.handleData(message))
    this.call.on('end', () => this.handleEnd())
    this.call.on('error', (error: Error) => this.handleError(error))
  }

  private handleData(message: any): void {
    const run = this.pendingRun
    if (!run) {
      return
    }

    if (message.text_chunk) {
      const text = message.text_chunk.text ?? ''
      run.fullText += text
      run.callbacks.onTextChunk?.(text)
      return
    }

    if (message.action_required) {
      run.callbacks.onActionRequired?.(
        message.action_required.prompt_id,
        message.action_required.question,
      )
      return
    }

    if (message.done) {
      const fullText = message.done.full_text || run.fullText
      this.pendingRun = null
      run.resolve(fullText)
      return
    }

    if (message.error) {
      this.pendingRun = null
      run.reject(new Error(message.error.message || 'gRPC server error'))
    }
  }

  private handleEnd(): void {
    const run = this.pendingRun
    this.call = null
    this.pendingRun = null
    if (!run) {
      return
    }
    if (run.canceled) {
      run.reject(new Error('Run stopped'))
      return
    }
    if (run.fullText) {
      run.resolve(run.fullText)
      return
    }
    run.reject(new Error('gRPC stream ended unexpectedly'))
  }

  private handleError(error: Error): void {
    const run = this.pendingRun
    this.call = null
    this.pendingRun = null
    if (run) {
      run.reject(error)
    }
  }
}
