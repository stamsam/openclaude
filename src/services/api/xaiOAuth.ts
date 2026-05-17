import { AuthCodeListener } from '../oauth/auth-code-listener.js'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '../oauth/crypto.js'
import { escapeHtml } from './codexOAuthShared.js'
import {
  buildXaiOAuthRedirectUri,
  coerceXaiExpiresAtMs,
  getXaiOAuthCallbackPort,
  XAI_OAUTH_AUTHORIZE_URL,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_REDIRECT_PATH,
  XAI_OAUTH_SCOPE,
  XAI_OAUTH_TOKEN_URL,
} from './xaiOAuthShared.js'

type XaiOAuthTokenResponse = {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

export type XaiOAuthTokens = {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt?: number
  scope?: string
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function buildXaiAuthorizeUrl(options: {
  port: number
  codeChallenge: string
  state: string
}): string {
  const authUrl = new URL(XAI_OAUTH_AUTHORIZE_URL)
  authUrl.searchParams.append('response_type', 'code')
  authUrl.searchParams.append('client_id', XAI_OAUTH_CLIENT_ID)
  authUrl.searchParams.append('redirect_uri', buildXaiOAuthRedirectUri(options.port))
  authUrl.searchParams.append('scope', XAI_OAUTH_SCOPE)
  authUrl.searchParams.append('code_challenge', options.codeChallenge)
  authUrl.searchParams.append('code_challenge_method', 'S256')
  authUrl.searchParams.append('state', options.state)
  return authUrl.toString()
}

function renderPage(title: string, message: string, error = false): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: sans-serif; padding: 32px; line-height: 1.5; color: #111827; }
      h1 { margin: 0 0 12px; font-size: 22px; color: ${error ? '#991b1b' : '#111827'}; }
      p { margin: 0 0 10px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`
}

async function exchangeAuthorizationCode(options: {
  authorizationCode: string
  codeVerifier: string
  port: number
  signal?: AbortSignal
}): Promise<XaiOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.authorizationCode,
    redirect_uri: buildXaiOAuthRedirectUri(options.port),
    client_id: XAI_OAUTH_CLIENT_ID,
    code_verifier: options.codeVerifier,
  })

  const response = await fetch(XAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      text.trim()
        ? `xAI OAuth token exchange failed (${response.status}): ${text.trim()}`
        : `xAI OAuth token exchange failed with status ${response.status}.`,
    )
  }

  const payload = (await response.json()) as XaiOAuthTokenResponse
  const accessToken = asTrimmedString(payload.access_token)
  if (!accessToken) {
    throw new Error('xAI OAuth completed, but the token response was missing an access token.')
  }

  return {
    accessToken,
    refreshToken: asTrimmedString(payload.refresh_token),
    idToken: asTrimmedString(payload.id_token),
    expiresAt: coerceXaiExpiresAtMs(payload.expires_in, accessToken),
    scope: asTrimmedString(payload.scope),
  }
}

export class XaiOAuthService {
  private authCodeListener: AuthCodeListener | null = null
  private tokenExchangeAbortController: AbortController | null = null

  private buildCancellationError(): Error {
    return new Error('xAI OAuth flow was cancelled.')
  }

  async startOAuthFlow(
    authURLHandler: (authUrl: string) => Promise<void>,
  ): Promise<XaiOAuthTokens> {
    const codeVerifier = generateCodeVerifier()
    const authCodeListener = new AuthCodeListener(XAI_OAUTH_REDIRECT_PATH)
    this.authCodeListener = authCodeListener

    try {
      const port = await authCodeListener.start(getXaiOAuthCallbackPort())
      const state = generateState()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const authUrl = buildXaiAuthorizeUrl({ port, codeChallenge, state })

      try {
        const authorizationCode = await authCodeListener.waitForAuthorization(
          state,
          async () => {
            await authURLHandler(authUrl)
          },
        )

        const controller = new AbortController()
        this.tokenExchangeAbortController = controller
        try {
          const tokens = await exchangeAuthorizationCode({
            authorizationCode,
            codeVerifier,
            port,
            signal: controller.signal,
          })
          if (this.authCodeListener !== authCodeListener) {
            throw this.buildCancellationError()
          }
          authCodeListener.handleSuccessRedirect([], res => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              renderPage(
                'xAI login complete',
                'You can return to OpenClaude now.',
              ),
            )
          })
          return tokens
        } finally {
          if (this.tokenExchangeAbortController === controller) {
            this.tokenExchangeAbortController = null
          }
        }
      } catch (error) {
        const resolvedError =
          this.authCodeListener === authCodeListener
            ? error
            : this.buildCancellationError()
        if (authCodeListener.hasPendingResponse()) {
          authCodeListener.handleErrorRedirect(res => {
            res.writeHead(
              resolvedError instanceof Error &&
                resolvedError.message === 'xAI OAuth flow was cancelled.'
                ? 200
                : 400,
              { 'Content-Type': 'text/html; charset=utf-8' },
            )
            res.end(
              renderPage(
                resolvedError instanceof Error &&
                  resolvedError.message === 'xAI OAuth flow was cancelled.'
                  ? 'xAI login cancelled'
                  : 'xAI login failed',
                resolvedError instanceof Error
                  ? resolvedError.message
                  : String(resolvedError),
                true,
              ),
            )
          })
        }
        throw resolvedError
      }
    } finally {
      if (this.authCodeListener === authCodeListener) {
        authCodeListener.close()
        this.authCodeListener = null
      }
    }
  }

  cleanup(): void {
    this.tokenExchangeAbortController?.abort()
    this.tokenExchangeAbortController = null
    this.authCodeListener?.close()
    this.authCodeListener = null
  }
}
