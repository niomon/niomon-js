import EventEmitter from 'events'

import { BrowserProviderBackend, WebMessageProviderBackend, ProviderBackend } from "./backend"
import { JsonRpcCallback, JsonRpcRequest, JsonRpcResponse, RequestArguments, Logger } from "./types"

export interface EthereumProviderOptions {
  appId: string
  chainId: number
  baseUrl?: string
  redirectUri?: string
  native?: boolean
  infuraId?: string
  alchemyId?: string
  rpc?: Record<number, string>
  debug?: boolean
  metaMask?: boolean
  logger?: Logger
}

export default class EthereumProvider {
  private _chainId: number
  private debug: boolean
  private _isMetaMask: boolean
  private logger?: Logger
  private backend: ProviderBackend
  private accounts: string[] = []
  private eventEmitter = new EventEmitter()

  constructor(options: EthereumProviderOptions) {
    if (!options.chainId) {
      throw new Error('chainId is required')
    }
    if (!options.logger) {
      options.logger = console
    }
    this._chainId = options.chainId
    this.backend = buildBackend(options)
    this.debug = !!process.env.DEBUG || !!options.debug
    this._isMetaMask = !!options.metaMask
    this.logger = options.logger

    this.backend.onEvent(this.onEvent.bind(this))
    this.eventEmitter.on('connect', this.onConnect.bind(this))
    this.eventEmitter.on('accountsChanged', this.onAccountsChanged.bind(this))
  }

  // Ditto interface
  get isDitto() {
    return true
  }

  // MetaMask Method
  get isMetaMask() {
    return !!this._isMetaMask
  }

  // EIP-1193 Method
  request(args: RequestArguments): Promise<unknown> {
    return this.backend.request(args)
  }

  // EIP-1193 Method
  on(eventName: string, listener: (...args: any[]) => void) {
    this.eventEmitter.on(eventName, listener)
  }

  // EIP-1193 Method
  removeListener(eventName: string, listener: any) {
    this.eventEmitter.removeListener(eventName, listener)
  }

  // MetaMask Method
  isConnected() {
    return true
  }

  // MetaMask Experimental Method
  get _metamask() {
    if (this.isMetaMask) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const that = this
      return {
        isUnlocked() {
          return that.isConnected()
        },
        requestBatch() {
          throw new Error('Not implemented')
        }
      }
    } else {
      this.logger?.error('Ditto Provider: _metamask property called but isMetaMask is false')
      return undefined
    }
  }

  // MetaMask Legacy Properties
  chainId(): string {
    return '0x' + this._chainId.toString(16)
  }

  // MetaMask Legacy Properties
  networkVersion() {
    return this._chainId.toString()
  }

  // MetaMask Legacy Properties
  selectedAddress() {
    return this.accounts[0]
  }

  // MetaMask Legacy Properties
  enable() {
    return this.request({ method: "eth_requestAccounts" })
  }

  sendAsync(payload: JsonRpcRequest, callback: JsonRpcCallback): void {
    this.send(payload, callback)
  }

  send(methodOrPayload: string | JsonRpcRequest, paramsOrCallback: Array<unknown> | JsonRpcCallback | undefined): Promise<JsonRpcResponse> | void {
    const normalizeResponse = (method: string) => {
      return (v: any): JsonRpcResponse => {
        return {
          id: undefined,
          jsonrpc: '2.0',
          method: method,
          result: v
        }
      }
    }
    if (typeof methodOrPayload === "string") {
      return this.backend.request({
        method: methodOrPayload,
        params: paramsOrCallback as Array<unknown>
      }).then(normalizeResponse(methodOrPayload))
    }
    const callback = paramsOrCallback as JsonRpcCallback
    this.backend.request({
      method: methodOrPayload.method,
      params: methodOrPayload.params
    })
      .then(
        response => callback(undefined, normalizeResponse(methodOrPayload.method)(response)),
        error => callback(error, {
        id: methodOrPayload.id,
        jsonrpc: '2.0',
        method: methodOrPayload.method,
        error: error
      }))
  }

  // Ditto method
  close() {
    this.backend.logout()
  }

  private onEvent(eventName: string, ...args: any[]) {
    this.eventEmitter.emit(eventName, ...args)
  }

  private onConnect(payload: {chainId: string}) {
    this.logger?.debug('Ditto Provider: connect fired: ', payload?.chainId)
    if (payload.chainId) {
      this._chainId = parseInt(payload.chainId, 16)
    }
  }

  private onAccountsChanged(accounts: string[]) {
    this.logger?.debug('Ditto Provider: accountsChanged fired: ', accounts)
    this.accounts = accounts
  }
}

const buildBackend = (options: EthereumProviderOptions) => {
  if (options.native) {
    // XXX: Handle wildcard origin case
    return new WebMessageProviderBackend(window, '*', options.logger)
  } else {
    return new BrowserProviderBackend(options)
  }
}
