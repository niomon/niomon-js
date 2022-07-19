import { ethers } from 'ethers'

import { isEqual } from 'lodash'

import { NiomonClient } from "../../client"
import { RequestArguments, Logger, EventHandler, DITTO_MESSAGE_TYPE, DITTO_REQUEST_METHOD } from './types'
import { WidgetContainer } from '../widget'

export const networkName: Record<number, string> = {
  1: "homestead",
  3: "ropsten",
  4: "rinkeby",
  5: "goerli",
  42: "kovan",
  137: "matic",
  80001: "maticmum",
}

export interface ProviderBackend {
  request(args: RequestArguments): Promise<any>
  onEvent(handler: EventHandler): void
  logout(): Promise<void>
}

export class WebMessageProviderBackend implements ProviderBackend {
  targetWindow: Window
  targetOrigin: string
  eventHandler?: EventHandler
  logger?: Logger
  responseReceivers: Record<number, (err?: Error, result?: any) => void> = {}
  nextId = 0
  postMessage: (message: object) => void = (message) => {}

  constructor(targetWindow: Window, targetOrigin: string, logger?: Logger) {
    this.targetWindow = targetWindow
    this.targetOrigin = targetOrigin
    this.logger = logger

    window.addEventListener('message', this.onMessage.bind(this))
    try {
      if ((this.targetWindow as any).ReactNativeWebView) {
        this.postMessage = (message: object) => (this.targetWindow as any).ReactNativeWebView.postMessage(JSON.stringify(message))
      }
    } catch (e) {
      this.logger?.log('In browser env')
      if (this.targetOrigin === '*') {
        this.logger?.warn('postMessage targetOrigin should be restricted, the wildcard case is for development only')
      }
      this.postMessage = (message: object) => this.targetWindow.postMessage(message, this.targetOrigin)
    }

    // XXX: Want to match with BrowserProviderBackend case which notify the connection is established
    // setTimeout(() => this.emitEvent('connect'))
  }

  request(args: RequestArguments): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.sendRawRequest(args.method, args.params)
      this.responseReceivers[id] = (err, result) => {
        err ? reject(err) : resolve(result)
      }
    })
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler
  }

  logout(): Promise<void> {
    this.logger?.debug('Ditto Provider: logout')
    return this.request({
      method: 'ditto_logout',
    })
  }

  private emitEvent(eventName: string, ...args: any) {
    this.logger?.debug(`${eventName} emitted:`, args)
    this.eventHandler?.(eventName, ...args)
  }

  private sendRawRequest(method: string, params: Array<unknown> | object | undefined): number {
    const id = ++this.nextId
    const payload = {
      type: DITTO_MESSAGE_TYPE,
      method: DITTO_REQUEST_METHOD,
      payload: {
        jsonrpc: "2.0",
        method,
        params,
        id
      }
    }

    this.postMessage(payload)
    return id
  }

  private onMessage(e: MessageEvent) {
    // RN message initiated within the same window by code injecting
    if (e.source !== this.targetWindow) {
      return
    }

    const data = e.data
    if (data.type !== DITTO_MESSAGE_TYPE) {
      return
    }

    const payload = data.payload
    if (typeof payload !== 'object') {
      return
    }
    if (payload.jsonrpc !== '2.0') {
      return
    }

    this.logger?.debug("Ditto Provider: got message", payload)

    // Notification
    switch (payload.method) {
      case 'ditto_ready':
        this.emitEvent('ditto_ready')
        break
      case 'ditto_did_logout':
        this.emitEvent('ditto_did_logout')
        break
      case 'ditto_event':
        if (!Array.isArray(data.params) || typeof data.params[0] !== 'string') {
          this.logger?.warn("Ditto Provider: received invalid event payload: ", data.params)
          return
        }
        const [eventName, ...args] = data.params
        this.emitEvent(eventName, ...args)
        break
      case 'eth_subscription':
        this.emitEvent('message', {
          type: 'eth_subscription',
          data: data.params
        })
        break
    }

    // Method response
    if (payload.result !== undefined || payload.error !== undefined) {
      if (!payload.id) {
        this.logger?.warn('Ditto Provider: received JSON-RPC response but id is undefined')
        return
      }

      const receiver = this.responseReceivers[payload.id]
      if (!receiver) {
        this.logger?.warn('Ditto Provider: received JSON-RPC response but no matching receiver found')
        return
      }

      receiver(payload.error, payload.result)
      delete this.responseReceivers[payload.id]
    }
  }
}

const NIOMON_API_BASE_URL = 'https://api.ditto.xyz/ditto'

export interface BrowserProviderBackendOptions {
  appId: string
  chainId: number
  baseUrl?: string
  redirectUri?: string
  infuraId?: string
  alchemyId?: string
  rpc?: Record<number, string> | string
  logger?: Logger
}

export class BrowserProviderBackend implements ProviderBackend {
  baseUrl: string
  appId: string
  niomonClient: NiomonClient
  rpc: ethers.providers.JsonRpcProvider
  eventHandler?: EventHandler
  chainId: number
  accounts?: string[]
  logger?: Logger
  private bridgePromise?: Promise<WebMessageProviderBackend>

  constructor(options: BrowserProviderBackendOptions) {
    if (!options.appId) {
      throw new Error('appId cannot be empty')
    }
    this.baseUrl = options.baseUrl || NIOMON_API_BASE_URL
    this.appId = options.appId
    this.niomonClient = new NiomonClient({
      baseURL: this.baseUrl,
      clientId: this.appId,
      redirectURI: options.redirectUri || window.origin
    })
    this.rpc = buildRpcProvider(options)
    this.chainId = options.chainId
    this.logger = options.logger
    setTimeout(() => this.emitEvent('connect', {chainId: `0x${this.chainId.toString(16)}`}))
  }

  request(args: RequestArguments): Promise<any> {
    const params = Array.isArray(args.params) ? args.params : (args.params !== undefined ? [args.params] : [])
    switch (args.method) {
      case 'eth_accounts':
        if (this.accounts !== undefined) {
          return Promise.resolve(this.accounts)
        }
        return this.bridgeRequest('eth_accounts')
          .then(this.handleAccountsChanged.bind(this))
      case 'eth_requestAccounts':
        return this.requestAccounts()
      case 'eth_sign':
        return this.bridgeRequest('eth_sign', params)
      case 'personal_sign':
        return this.bridgeRequest('personal_sign', params)
      case 'eth_sendTransaction':
        return this.bridgeRequest('eth_sendTransaction', params)
      case 'eth_signTransaction':
        return this.bridgeRequest('eth_signTransaction', params)
      default:
        return this.rpc.send(args.method, params)
    }
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler
  }

  async logout(): Promise<void> {
    const bridge = await this.getBridge()
    return bridge.logout()
  }

  // Called by bridge to complete logging out session.
  private didLogout() {
    this.niomonClient.logout()
    this.handleAccountsChanged([])
    this.emitEvent('close')
  }

  private emitEvent(eventName: string, ...args: any) {
    this.eventHandler?.(eventName, ...args)
  }

  private handleAccountsChanged(accounts: string[]) {
    if (!isEqual(this.accounts, accounts)) {
      if (this.accounts !== undefined) {
        // Don't fire accountsChanged event after login
        this.emitEvent('accountsChanged', accounts)
      }
      this.accounts = accounts
    }
    return accounts
  }

  private async requestAccounts(): Promise<string[]> {
    try {
      var token = await this.niomonClient.getTokenSilently()
      if (!token) {
        const redirectUri = new URL(window.location.href)
        redirectUri.search = ''
        this.niomonClient.setRedirectUri(redirectUri.toString())
        token = await this.niomonClient.getTokenWithPopup()
      }

      const accounts = await this.bridgeRequest('eth_accounts')
      this.handleAccountsChanged(accounts)
      return accounts
    } catch (e: any) {
      this.logger?.warn(e)
      // Emit a close event to allow Web3Modal to forget the chosen provider upon error (e.g. using
      // closing sign in window).
      this.emitEvent('close')
      throw {
        code: 4001,
        message: e.message
      }
    }
  }

  private async bridgeRequest(method: string, params?: any) {
    const token = await this.niomonClient.getTokenSilently()
    if (token) {
      this.logger?.debug("Ditto Provider: sending request to Ditto Bridge", method, params)
      try {
        const bridge = await this.getBridge()
        const success = await bridge.request({
          method: 'ditto_ethereum_init',
          // TODO: this will be embedded in getToken opaque return
          params: [{ tokens: [token], dittoToken: token }]
        })
        if (!success) {
          throw new Error('failed to init Ditto Bridge')
        }
        const res = await bridge.request({
          method,
          params
        })
        this.logger?.debug(`Ditto Provider: ${method} response`, res)
        return res
      } catch (e: any) {
        this.logger?.error(`Ditto Provider: error occurred: ${method}`, e)
        if (e.code == 1) {
          this.logout()
        }
        throw e
      }
    }
    throw {
      code: 4001,
      message: "rejected by user"
    }
  }

  private onBridgeEvent(eventName: string, ...args: any[]) {
    switch (eventName) {
      case 'ditto_did_logout':
        this.didLogout()
        break
    }
  }

  private getBridge(): Promise<WebMessageProviderBackend> {
    // Lazy load the bridge
    if (this.bridgePromise === undefined) {
      const container: WidgetContainer = new WidgetContainer(window, this.baseUrl, this.appId, this.chainId, this.logger)
      this.bridgePromise = container.onReady.then(container => {
        const bridge = new WebMessageProviderBackend(container.contentWindow!, container.origin, this.logger)
        bridge.onEvent(this.onBridgeEvent.bind(this))
        return bridge
      })
    }
    return this.bridgePromise
  }
}

const buildRpcProvider = (options: BrowserProviderBackendOptions) => {
  const network = networkName[options.chainId]
  if (!network) {
    throw new Error('Unknown network')
  }
  if (options.alchemyId) {
    return new ethers.providers.AlchemyProvider(network, options.alchemyId)
  } else if (options.infuraId) {
    return new ethers.providers.InfuraProvider(network, options.infuraId)
  } else if (options.rpc) {
    let url: string
    if (typeof options.rpc === 'string') {
      url = options.rpc
    } else {
      url = options.rpc[options.chainId]
      if (!url) {
        throw new Error('Could not resolve rpc provider')
      }
    }
    return new ethers.providers.JsonRpcProvider(url)
  }

  console.log('Ditto Provider: using fallback RPC')
  return new ethers.providers.AlchemyProvider(network, process.env.DITTO_JS_DEFAULT_ALCHEMY_ID)
}
