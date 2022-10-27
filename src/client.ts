import cryptoRandomString from 'crypto-random-string'
import qs from 'qs'
import { z } from 'zod'
import axios, { AxiosInstance } from 'axios'
import store from 'store2'
import { Buffer } from 'buffer'

import { sha256 } from './crypto'
import { base64url, resolveServiceHost } from './utils'

import { TokenManager, BrowserTokenManager } from "./tokenManager"
import { ethers } from 'ethers'
import { WalletAuthWidgetContainer } from './wallet-auth-widget'

const AUTH_STATE_STORAGE_KEY = 'niomon.auth_state'

const niomonClientOptions = z.object({
  baseURL: z.string(),
  clientId: z.string(),
  redirectURI: z.string(),
  storage: z.optional(z.string())
})
export type NiomonClientOptions = z.infer<typeof niomonClientOptions>

export interface OpenIdConfiguration {
  authorization_endpoint?: string,
  token_endpoint?: string,
  revocation_endpoint?: string,
  registration_endpoint?: string,
  end_session_endpoint?: string
}

export interface WalletOption {
  tenant: string,
  zone?: string,
  // only support ethereum-based chainId for now.
  // If chainId is not specified, the current connected chainId will be used.
  chainId?: number,
}

export class NiomonClient {
  private readonly options: NiomonClientOptions
  private readonly tokenManager: TokenManager
  private readonly http: AxiosInstance
  private walletAuthPromise: Promise<WalletAuthWidgetContainer> | undefined
  private openIdConfiguration: OpenIdConfiguration | null

  constructor (options: NiomonClientOptions, tokenManager?: TokenManager) {
    this.options = niomonClientOptions.parse(options)

    // Normalize the baseURL
    if (!this.options.baseURL.endsWith('/')) {
      this.options.baseURL += '/'
    }

    this.tokenManager = tokenManager ?? new BrowserTokenManager(options.clientId, {
      storage: options.storage
    })

    this.http = axios.create({
      baseURL: options.baseURL
    })

    this.openIdConfiguration = null
  }

  /**
   * Get an authenticated http client for request niomon server endpoint.
   *
   * Returns error if the client is not authenticated.
   *
   * By default, the access token is refreshed if it will expires soon. To
   * disable this feature, pass the refreshIfNeeded argument as false.
   */
  public async getAuthenticatedHttp(refreshIfNeeded = true): Promise<AxiosInstance> {
    if (refreshIfNeeded) {
      await this.refreshAccessTokenIfNeeded()
    }

    const accessToken = await this.getTokenSilently()
    if (!accessToken) {
      throw new Error('authorization is required')
    }

    return axios.create({
      baseURL: this.options.baseURL,
      headers: {'Authorization': `Bearer ${accessToken}`}
    })
  }

  public setRedirectUri(redirectUri: string) {
    this.options.redirectURI = redirectUri
  }

  public async setAccessToken(accessToken: string): Promise<void> {
    await this.tokenManager.add('access_token', accessToken)
  }

  /**
   * Builds an authorization endpoint URL using the parameters provided. state and nonce parameters will be generated and stored to sessionStorage.
   */
  public buildAuthUrl(params?: Record<string, string>): string {
    const state = this.generateAuthState()

    params = {
      client_id: this.options.clientId,
      response_type: 'code',
      response_mode: 'query',
      redirect_uri: this.options.redirectURI,
      state: state.state,
      code_challenge: state.codeChallenge,
      code_challenge_method: 'S256',
      ...params
    }
    const query = qs.stringify(params)

    return `${this.options.baseURL}oidc/authorize?${query}`
  }

  public loginWithRedirect(params?: Record<string, string>): void {
    const url = this.buildAuthUrl(params)
    window.location.assign(url)
  }

  public async logout(): Promise<void> {
    await Promise.all([
      this.tokenManager.remove("access_token"),
      this.tokenManager.remove("token_response")
    ])
  }

  /**
   * Returns an access token from token manager.
   */
  public async getTokenSilently(): Promise<string|null> {
    return this.tokenManager.get('access_token')
  }

  /**
   * Opens a popup with the authorization endpoint.
   */
  public async getTokenWithPopup(params?: Record<string, string>): Promise<string> {
    const redirectUri = new URL(window.location.href)
    redirectUri.search = ''
    const url = this.buildAuthUrl({
      redirect_uri: redirectUri.toString(),
      response_mode: 'web_message',
      ...params
    })
    const popup = openPopup(url)
    if (!popup) {
      throw new Error('Popup blocked')
    }
    const messageOrigin = resolveServiceHost(url, 'app')
    const resp = await waitAuthorizationResponse(popup, messageOrigin) as any
    const token = await this.exchangeAuthCode(resp.code as string)
    await this.handleTokenResponse(token)
    return token.access_token
  }

  /**
   * Handles OAuth2 callback.
   */
  public async handleAuthCallback(): Promise<void> {
    const params = qs.parse(window.location.search, { ignoreQueryPrefix: true })
    if (!params.code && !params.error) {
      throw new Error('Request missing required parameters')
    }
    if (params.error) {
      console.error('OAuth error: ', params.error)
      throw new Error(`error: ${params.error}`)
    }

    const token = await this.exchangeAuthCode(params.code as string)
    await this.handleTokenResponse(token)
  }

  /**
   * Handles authorization code response.
   */
  public async handleAuthCodeResponse(code: string, codeVerifier: string): Promise<void> {
    const token = await this.exchangeAuthCode(code, codeVerifier)
    await this.handleTokenResponse(token)
  }

  /**
   * Exchanges authorization grant for access token.
   *
   * This is for when authorization code is initiated externally of the Niomon client.
   */
  public async exchangeAuthCode(code: string, codeVerifier?: string): Promise<TokenResponse>{
    let verifier = codeVerifier
    if (!verifier) {
      const authState = this.getAuthState()
      if (!authState) {
        throw new Error("auth state cannot be found")
      }
      verifier = authState.codeVerifier
    }

    const resp = await this.http.post('/oidc/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.options.redirectURI,
      client_id: this.options.clientId,
      code_verifier: verifier
    })
    return tokenResponse.parse(resp.data)
  }

  /**
   * Refreshes the access token by using the refresh token to make
   * request to OIDC token endpoint.
   *
   * It also stores the new refresh token and
   */
  public async refreshAccessToken(refreshToken?: string): Promise<void>{
    if (!refreshToken) {
      const response = await this.lastTokenResponse()
      refreshToken = response?.refresh_token ?? undefined
    }

    if (refreshToken) {
      const resp = await this.http.post('/oidc/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.options.clientId,
      })
      await this.handleTokenResponse(tokenResponse.parse(resp.data))
    } else {
      throw new Error('No refresh token')
    }
  }

  /**
   * This is a private function that handles the token response. Usually this is used to
   * save the access token.
   */
  async handleTokenResponse(token: TokenResponse): Promise<void>{
    if (!token.access_token) {
      throw new Error('exchange token request succeed but access_token is empty')
    }

    const {access_token, expires_in: expiresIn} = token
    const expiresAt = Date.now() / 1000 + expiresIn
    await Promise.all([
      // The access token is saved separately for it is required when making
      // request, saving extra unparsing.
      this.tokenManager.add('access_token', access_token),
      this.tokenManager.addObject('token_response', token),
      this.tokenManager.add('expires_at', `${expiresAt}`)
    ])
  }

  public async loginWithWallet(externalProvider: ethers.providers.ExternalProvider, options: WalletOption): Promise<void> {
    const provider = new ethers.providers.Web3Provider(externalProvider)
    // request account for subsequent signing
    const accounts: string[] = await provider.send("eth_requestAccounts", [])

    let chainId = parseInt(await provider.send("eth_chainId", []), 16)
    if (options.chainId && options.chainId !== chainId) {
      await provider.send("wallet_switchEthereumChain", ['0x'+options.chainId.toString(16)])
      chainId = options.chainId
    }

    const walletAuth = await this.getWalletAuthWidget(options)

    const challenge = await walletAuth.request('wallet_auth_challenge', {
      address: accounts[0],
      uri: window.location.href,
      chainId,
    })
    const signatureResp = await provider.send("personal_sign", [accounts[0], challenge])

    const token = await walletAuth.request('wallet_auth_authenticate', {
      signature: signatureResp,
      chainId,
    })
    await this.handleTokenResponse(token)
  }

  private getWalletAuthWidget(options: WalletOption): Promise<WalletAuthWidgetContainer> {
    // Lazy load the wallet auth
    if (this.walletAuthPromise === undefined) {
      const zone = options.zone ? options.zone : ''
      const container: WalletAuthWidgetContainer = new WalletAuthWidgetContainer(window, this.options.baseURL, options.tenant, zone, this.options.clientId)
      this.walletAuthPromise = container.onReady
    }
    return this.walletAuthPromise
  }

  /**
   * Retrieves user info using access token.
   * @returns UserInfoResponse
   */
  public async getUser(): Promise<UserInfoResponse> {
    const accessToken = await this.getTokenSilently()
    if (!accessToken) {
      throw new Error('authorization is required')
    }
    const resp = await this.http.get('/oidc/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
    return userInfoResponse.passthrough().parse(resp.data)
  }

  public async isAuthenticated(): Promise<boolean >{
    const authStatus = await this.authenticationStatus()
    return !!authStatus && !authStatus.expired
  }

  protected async refreshAccessTokenIfNeeded(): Promise<void> {
    try {
      const [response, expiresAt] = await Promise.all([
        this.lastTokenResponse(),
        this.tokenExpiresAt()
      ])

      if (!response) {
        return
      }

      const refreshToken = response.refresh_token
      const expiringSoon = expiresAt ? expiresAt.getTime() - 60 * 60 * 1000 < Date.now() : false
      if (expiringSoon && refreshToken) {
        // If the token is expiring soon (in the next 1 hour) or that it has
        // already expired, we will refresh the token now.
        console.debug('Access token is expired / expiring soon, refreshing as needed')
        try {
          await this.refreshAccessToken(refreshToken)
        } catch (err) {
          console.warn('Unable to refresh access token:', err)
          throw err
        }
      }
    } catch (err) {
      console.error('Unable to check and refresh access token from token manager:', err)
    }
  }

  /**
   * Returns the current authentication status (whether the user is logged in).
   */
  public async authenticationStatus(refreshIfNeeded = true): Promise<AuthenticationStatus | null> {
    try {
      if (refreshIfNeeded) {
        await this.refreshAccessTokenIfNeeded()
      }

      const [response, expiresAt] = await Promise.all([
        this.lastTokenResponse(),
        this.tokenExpiresAt()
      ])

      if (!response) {
        return null
      }

      const expired = expiresAt ? expiresAt < new Date() : false
      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token ?? null,
        idToken: response.id_token ?? null,
        expired,
      }
    } catch (err) {
      console.error('Unable to get authentication status from token manager:', err)
      return null
    }
  }

  private async lastTokenResponse(): Promise<TokenResponse | null> {
    return (await this.tokenManager.getObject('token_response')) as TokenResponse | null
  }

  private async tokenExpiresAt(): Promise<Date | null> {
    const expiresAtString = await this.tokenManager.get('expires_at')
    if (!expiresAtString) {
      return null
    }

    const expiresAt = parseInt(expiresAtString, 10)
    return expiresAt ? new Date(expiresAt * 1000) : null
  }

  private generateAuthState(): AuthState {
    const state = cryptoRandomString({length: 20, type: 'alphanumeric'})
    const codeVerifier = cryptoRandomString({length: 20, type: 'alphanumeric'})
    const codeChallenge = base64url(sha256(Buffer.from(codeVerifier)))
    store.session.set(`${AUTH_STATE_STORAGE_KEY}.state`, state)
    store.session.set(`${AUTH_STATE_STORAGE_KEY}.codeVerifier`, codeVerifier)
    store.session.set(`${AUTH_STATE_STORAGE_KEY}.codeChallenge`, codeChallenge)
    return {
      state,
      codeVerifier,
      codeChallenge
    }
  }

  private getAuthState(): AuthState | undefined {
    const state = store.session.get(`${AUTH_STATE_STORAGE_KEY}.state`)
    const codeVerifier = store.session.get(`${AUTH_STATE_STORAGE_KEY}.codeVerifier`)
    const codeChallenge = store.session.get(`${AUTH_STATE_STORAGE_KEY}.codeChallenge`)
    if (!state || !codeVerifier || !codeChallenge) {
      return undefined
    }
    return {
      state,
      codeVerifier,
      codeChallenge
    }
  }

  public async fetchOpenIdConfiguration(): Promise<OpenIdConfiguration> {
    if (this.openIdConfiguration) {
      return this.openIdConfiguration
    }

    const resp = await this.http.get('/.well-known/openid-configuration')
    this.openIdConfiguration = resp.data
    return resp.data
  }
}

interface AuthenticationStatus {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  expired: boolean
}

interface AuthState {
  state: string
  codeVerifier: string
  codeChallenge: string
}

const tokenResponse = z.object({
  expires_in: z.number(),
  access_token: z.string(),
  token_type: z.string(),
  refresh_token: z.string().nullish(),
  scope: z.array(z.string()).nullish(),
  id_token: z.string().nullish()
})
type TokenResponse = z.infer<typeof tokenResponse>

const userInfoResponse = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.optional(z.string()),
  email_verified: z.optional(z.boolean()),
  phone_number: z.optional(z.string()),
  phone_number_verified: z.optional(z.boolean()),
})
type UserInfoResponse = z.infer<typeof userInfoResponse>

const openPopup = (url: string) => {
  const width = 766
  const height = 530
  const left = window.screenX + (window.innerWidth - width) / 2
  const top = window.screenY + (window.innerHeight - height) / 2

  return window.open(
    url,
    undefined,
    `left=${left},top=${top},width=${width},height=${height},resizable,scrollbars=yes,status=1`
  )
}

const waitAuthorizationResponse = (targetWindow: Window, origin: string): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const handler = function(evt: MessageEvent) {
      if (evt.origin != origin) {
        return
      }
      if (evt.source !== targetWindow) {
        return
      }
      if (!evt.data.type) {
        return
      }
      switch (evt.data.type) {
          case "authorization_response":
            (evt.source as any)?.close()
            if (evt.data.error) {
              reject(evt.data.error)
            } else {
              resolve(evt.data.response)
            }
            window.removeEventListener("message", handler, false)
            break
          default:
      }
    }
    window.addEventListener('message', handler, false)
    const timer = setInterval(() => {
      if (targetWindow.closed) {
          clearInterval(timer)
          reject(new Error('canceled by user'))
      }
    }, 1000)
  })
}
