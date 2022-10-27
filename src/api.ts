import axios, { AxiosInstance } from 'axios'

export interface NiomonAuthnAPIOptions {
  baseURL: string
}

export class NiomonAuthnAPI {
  private readonly options: NiomonAuthnAPIOptions
  private readonly http: AxiosInstance

  constructor (options: NiomonAuthnAPIOptions) {
    this.options = options
    this.http = axios.create({
      baseURL: options.baseURL
    })
  }

  async startAuthentication (req: StartAuthenticationRequest): Promise<AuthenticationState> {
    const resp = await this.http.post('/authn/v1/start', req)
    return resp.data as AuthenticationState
  }

  async authenticateWebAuthn (req: AuthenticateWebAuthnRequest): Promise<AuthenticationState> {
    const resp = await this.http.post('/authn/v1/webauthn/authenticate', req)
    return resp.data as AuthenticationState
  }

  async sendEmailPasscode (req: SendEmailPasscodeRequest): Promise<AuthenticationState> {
    const resp = await this.http.post('/authn/v1/otp/email/send', req)
    return resp.data as AuthenticationState
  }

  async sendSmsPasscode (req: SendSmsPasscodeRequest): Promise<AuthenticationState> {
    const resp = await this.http.post('/authn/v1/otp/sms/send', req)
    return resp.data as AuthenticationState
  }

  async authenticatePasscode (req: AuthenticatePasscodeRequest): Promise<AuthenticationState> {
    const resp = await this.http.post('/authn/v1/otp/authenticate', req)
    return resp.data as AuthenticationState
  }

  async startWalletAuthenticate (networkName: string, req: StartWalletAuthenticateRequest): Promise<AuthenticationState> {
    const resp = await this.http.post(`/authn/v1/wallet/${networkName}/start`, req)
    return resp.data as AuthenticationState
  }

  async authenticateWallet (networkName: string, req: AuthenticateWalletRequest): Promise<AuthenticationState> {
    const resp = await this.http.post(`/authn/v1/wallet/${networkName}/authenticate`, req)
    return resp.data as AuthenticationState
  }

  async getAuthenticationState (req: GetAuthenticationStateRequest): Promise<AuthenticationState> {
    const resp = await this.http.post('/authn/v1/get', req)
    return resp.data as AuthenticationState
  }

  async getEnrollmentState (req: GetEnrollmentStateRequest): Promise<EnrollmentState> {
    const resp = await this.http.post('/authn/v1/enrollment/get-enrollmenttoken-state', req)
    return resp.data as EnrollmentState
  }

  /*
   * Ditto API
   */

  async dittoGetUserInfo (req: DittoGetUserInfoRequest): Promise<DittoGetUserInfoResponse> {
    const resp = await this.http.post('/authn/v1/ditto/userinfo', req)
    return resp.data as DittoGetUserInfoResponse
  }

  async dittoSignUp (req: DittoSignUpRequest): Promise<void> {
    await this.http.post('/authn/v1/ditto/signup', req)
  }
}

export interface StartAuthenticationRequest {
  clientId: string
  redirectUri: string
  codeChallengeMethod: string
  codeChallenge: string
  clientState: string
}

export interface AuthenticateWebAuthnRequest {
  stateToken: string
  id: string
  response: {
    userHandle: string
  }
}

export interface SendEmailPasscodeRequest {
  stateToken: string
  email: string
  loginOrSignup: boolean
}

export interface SendSmsPasscodeRequest {
  stateToken: string
  phoneNumber: string
  loginOrSignup: boolean
}

export interface AuthenticatePasscodeRequest {
  stateToken: string
  code: string
}

export interface StartWalletAuthenticateRequest {
  stateToken: string
  clientId: string
  address: string
  uri: string
  domain: string
  loginOrSignup: boolean
}

export interface AuthenticateWalletRequest {
  stateToken: string
  signature: string
}

export interface GetAuthenticationStateRequest {
  stateToken: string
}

export interface AuthenticationState {
  stateToken: string
  status: string
  walletChallenge: string
}

export interface GetEnrollmentStateRequest {
  stateToken: string
}

export interface EnrollmentState {
  stateToken: string
  status: string
  cardLayoutId: string
}

/*
 * Ditto API
 */
export interface DittoGetUserInfoRequest {
  stateToken: string
}

export interface DittoGetUserInfoResponse {
  userId: string
  signUpCompleted: boolean
}

export interface DittoSignUpRequest {
  stateToken: string
  username: string
  tosVersion: number
  subscribeMarketing: boolean
}
