import { providerProxy } from './debug'
import EthereumProvider from './ethereum-provider'
import { Logger } from './ethereum-provider/types'

const _window = (window as any)
let metaMask = _window.ethereum
let currentProvider: any = undefined

const injectProviderHooks = (updater?: (provider: any) => void, logger?: Logger) => {
  Object.defineProperty(window, 'ethereum', {
    set: v => {
      updater?.(v)
      logger?.debug('window.ethereum set', v)
    },
    get: () => {
      logger?.debug('window.ethereum read')
      return currentProvider
    }
  })

  if (!_window.web3) {
    logger?.debug('window.web3 is not defined')
    _window.web3 = {
      get currentProvider() {
        logger?.debug("window.web3.currentProvider read")
        return currentProvider
      }
    }
  } else {
    Object.defineProperty(_window.web3, 'currentProvider', {
      set: v => {
        logger?.debug("window.web3.currentProvider set", v)
      },
      get: () => {
        logger?.debug("window.web3.currentProvider read")
        return currentProvider
      },
    })
  }
}

interface InjectEthereumProviderOptions {
  appId: string
  chainId: number
  baseUrl?: string
  debug?: boolean
  debugProxy?: boolean
  useMetaMask?: boolean
  logger?: Logger
}

const injectEthereumProvider = (opts: InjectEthereumProviderOptions) => {
  // React Native debugging
  const isReactNative = _window.ReactNativeWebView && _window.ReactNativeWebView.postMessage

  const appId = opts.appId
  const chainId = opts.chainId
  const baseUrl = opts.baseUrl
  const logger = isReactNative ? nativeLogger() : opts.logger || console
  const debug = opts.debug || false
  const debugProxy = opts.debugProxy || false
  const useMetaMask = opts.useMetaMask || false

  logger.debug("Installing ditto provider")
  logger.debug("Debug flag: ", debug)

  let provider: any
  let updater: undefined | ((provider: any) => void) = undefined

  if (useMetaMask) {
    logger?.debug('Debug: Intercept MetaMask', metaMask)
    provider = metaMask
    // Call initDitto again if MetaMask is injected later.
    updater = (provider) => {
      logger?.debug('Debug: Updating MetaMask reference', provider)
      metaMask = provider
      updateCurrentProvider(debugProxy, metaMask, logger)
    }
  } else {
    provider = new EthereumProvider({
      appId,
      chainId,
      baseUrl,
      native: isReactNative,
      alchemyId: process.env.DITTO_JS_DEFAULT_ALCHEMY_ID,
      metaMask: true,
      debug,
      logger,
    })
  }
  if (provider) {
    updateCurrentProvider(debug, provider, logger)
  }
  injectProviderHooks(updater, logger)
}

const updateCurrentProvider = (debugProxy = false, provider: any, logger?: Logger) => {
  if (debugProxy) {
    logger?.debug('Debug: Full debug proxy enabled')
    currentProvider = providerProxy(provider, logger?.log)
  } else {
    currentProvider = provider
  }
}

const nativeLogger = (): Logger => {
  const logFunc = (lvl: string) =>
    (...data: any[]) => {
      _window.ReactNativeWebView.postMessage(JSON.stringify({
        method: 'logger',
        lvl,
        data: data
      }))
    }
  return {
    log: logFunc('info'),
    trace: logFunc('trace'),
    debug: logFunc('debug'),
    info: logFunc('info'),
    warn: logFunc('warn'),
    error: logFunc('error'),
  }
}

if (_window.ditto?.autoInjectEthereumProvider) {
  const opts = _window.ditto.autoInjectEthereumProvider as InjectEthereumProviderOptions
  injectEthereumProvider(opts)
}

export { injectEthereumProvider, EthereumProvider }
