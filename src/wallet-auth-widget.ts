import { resolveServiceHost } from "./utils"

const WIDGET_CONTAINER_ID = 'wallet-auth-widget-container'
const WALLET_AUTH_MESSAGE_TYPE = 'wallet_auth_message'
const WALLET_AUTH_REQUEST_METHOD = 'wallet_auth_request'

export class WalletAuthWidgetContainer {
  readonly origin: string
  readonly onReady: Promise<WalletAuthWidgetContainer>
  readonly baseUrl: string
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  private readonly postMessage: (message: object) => void = (_message) => {}
  private iframe: HTMLIFrameElement
  private readyResolver?: (value: WalletAuthWidgetContainer | PromiseLike<WalletAuthWidgetContainer>) => void
  responseReceivers: Record<number, (err?: Error, result?: any) => void> = {}
  nextId = 0

  constructor(targetWindow: Window, baseUrl: string, tenant: string, zone: string, appId: string) {
    this.baseUrl = resolveServiceHost(baseUrl, 'app')
    const url = `${this.baseUrl}/#/wallet?appId=${appId}&tenant=${tenant}&zone=${zone}`
    this.iframe = createIFrame(targetWindow, url)
    this.origin = url
    this.onReady = new Promise((resolve) => {
      this.readyResolver = resolve
    })
    targetWindow.addEventListener('message', this.onMessage.bind(this), false)
    this.postMessage = (message: object) => this.contentWindow?.postMessage(message, this.origin)
    this.render()
  }

  get contentWindow(): Window | null {
    return this.iframe.contentWindow
  }

  // request sends a corresponding request to the iframe
  request(method: string, data: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.sendRawRequest(method, data)
      this.responseReceivers[id] = (err, result) => {
        err ? reject(err) : resolve(result)
      }
    })
  }

  private sendRawRequest(method: string, data: object): number {
    const id = ++this.nextId
    const payload = {
      type: WALLET_AUTH_MESSAGE_TYPE,
      method: WALLET_AUTH_REQUEST_METHOD,
      payload: {
        jsonrpc: "2.0",
        method,
        params: data,
        id
      },
    }
    this.postMessage(payload)
    return id
  }


  // receive message from the iframe
  private onMessage(e: MessageEvent) {
    if (e.source !== this.contentWindow) {
      return
    }

    const data = e.data
    if (data.type !== WALLET_AUTH_MESSAGE_TYPE) {
      return
    }

    // Notification
    switch (data.method) {
      // when iframe is ready, readyResolver is resolved
      case 'wallet_auth_ready':
        this.readyResolver?.(this)
        break
    }

    const payload = data.payload
    if (typeof payload !== 'object') {
      return
    }
    if (payload.jsonrpc !== '2.0') {
      return
    }

    // Method response
    if (payload.result !== undefined || payload.error !== undefined) {
      if (!payload.id) {
        console.warn('WalletAuthWidgetContainer: received JSON-RPC response but id is undefined')
        return
      }

      const receiver = this.responseReceivers[payload.id]
      if (!receiver) {
        console.warn('WalletAuthWidgetContainer: received JSON-RPC response but no matching receiver found')
        return
      }
      receiver(payload.error, payload.result)
      delete this.responseReceivers[payload.id]
    }
  }

  private render() {
    const iframe = this.iframe
    iframe.hidden = true
    iframe.style.cssText = 'display: none; width: 0; height: 0; border: none; z-index: -99999'
    this.contentWindow?.blur()
  }
}

const createIFrame = (targetWindow: Window, url: string) => {
  const oldIframe = targetWindow.document.getElementById(WIDGET_CONTAINER_ID)
  if (oldIframe) {
    console.warn('Removing previous wallet auth widget container element')
    oldIframe.remove()
  }
  const iframe = targetWindow.document.createElement('iframe')
  iframe.id = WIDGET_CONTAINER_ID
  iframe.src = url
  iframe.allow = "clipboard-write";
  (iframe as any).allowTransparency = true
  targetWindow.document.body.appendChild(iframe)
  return iframe
}
