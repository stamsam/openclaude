import type {
  TelegramSendMessageResult,
  TelegramUpdate,
} from './types.js'

type TelegramApiResponse<T> = {
  ok: boolean
  result: T
  description?: string
}

export class TelegramClient {
  constructor(private readonly botToken: string) {}

  async getUpdates(
    offset?: number,
    timeoutSeconds: number = 30,
  ): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ['message'],
    })
  }

  async sendMessage(
    chatId: number,
    text: string,
    replyToMessageId?: number,
  ): Promise<TelegramSendMessageResult> {
    return this.call<TelegramSendMessageResult>('sendMessage', {
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
    })
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
  ): Promise<void> {
    try {
      await this.call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('message is not modified')) {
        return
      }
      throw error
    }
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/${method}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    const payload = (await response.json()) as TelegramApiResponse<T>
    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.description || `Telegram API request failed: ${method}`,
      )
    }

    return payload.result
  }
}
