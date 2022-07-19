import { resolveServiceHost } from "../utils"
import { DITTO_MESSAGE_TYPE, Logger } from "./ethereum-provider/types"

export type WidgetMode = 'hidden' | 'minimized' | 'focused'

const WIDGET_CONTAINER_ID = 'ditto-widget-container'

export class WidgetContainer {
  readonly origin: string
  readonly onReady: Promise<WidgetContainer>
  private iframe: HTMLIFrameElement
  private _mode: WidgetMode
  private logger?: Logger
  private readyResolver?: (value: WidgetContainer | PromiseLike<WidgetContainer>) => void

  constructor(targetWindow: Window, baseUrl: string, appId: string, chainId: number, logger?: Logger) {
    const url = `${resolveServiceHost(baseUrl, 'app')}/#/ditto/widget?chainId=${chainId}&appId=${appId}`
    this.iframe = createIFrame(targetWindow, url)
    this._mode = 'hidden'
    this.logger = logger
    this.origin = url

    this.onReady = new Promise((resolve) => {
      this.readyResolver = resolve
    })
    targetWindow.addEventListener('message', this.onMessage.bind(this), false)

    this.render()
  }

  get contentWindow(): Window | null {
    return this.iframe.contentWindow
  }

  get mode(): WidgetMode {
    return this._mode
  }

  set mode(mode: WidgetMode) {
    switch (mode) {
      case 'hidden':
      case 'minimized':
      case 'focused':
        this.logger?.debug(`Ditto Provider: set mode: ${mode}`)
        this._mode = mode
        this.render()
        break
      default:
        this.logger?.warn(`Ditto Provider: ignoring unknown mode ${mode}`)
    }
  }

  private onMessage(e: MessageEvent) {
    if (e.source !== this.contentWindow) {
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

    // Notification
    switch (payload.method) {
      case 'ditto_ready':
        this.readyResolver?.(this)
        break
      case 'ditto_mode':
        this.mode = payload.params[0]
        break
    }
  }

  private render() {
    const iframe = this.iframe
    if (this.mode == 'hidden') {
      iframe.hidden = true
      iframe.style.cssText = 'display: none; width: 0; height: 0; border: none; z-index: -99999'
      this.contentWindow?.blur()
    } else if (this.mode == 'minimized') {
      iframe.style.cssText = 'display: block; position: fixed; bottom: 0; left: 0; width: 75px; height: 75px; border: none; z-index: 99999'
      this.contentWindow?.blur()
    } else if (this.mode == 'focused') {
      // Set height as 100vh will cause the iframe content to be overflown when mobile url bar is shown (100vh + url bar height > 100vh).
      // Set height to 100% instead since it depends on the viewport height which will change dynamically
      iframe.style.cssText = 'display: block; position: fixed; bottom: 0; left: 0; width: 100vw; height: 100%; border: none; z-index: 99999'
      this.contentWindow?.focus()
    }
  }
}

const createIFrame = (targetWindow: Window, url: string) => {
  const oldIframe = targetWindow.document.getElementById(WIDGET_CONTAINER_ID)
  if (oldIframe) {
    console.warn('Removing previous ditto widget container element')
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