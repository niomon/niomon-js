export interface ProviderRpcError extends Error {
  message: string
  code: number
  data?: unknown
}

export interface JsonRpcRequest {
  id: string | undefined
  jsonrpc: '2.0'
  method: string
  params?: Array<any>
}

export interface JsonRpcResponse {
  id: string | undefined
  jsonrpc: '2.0'
  method: string
  result?: unknown
  error?: Error
}

export type JsonRpcCallback = (error?: Error, response?: JsonRpcResponse) => unknown

export interface RequestArguments {
  method: string
  params?: unknown[] | object
}

export type EventListener = (payload: any) => void

export interface Logger {
  log: (...data: any[]) => void
  trace: (...data: any[]) => void
  debug: (...data: any[]) => void
  info: (...data: any[]) => void
  warn: (...data: any[]) => void
  error: (...data: any[]) => void
}

export type EventHandler = (eventName: string, ...args: any[]) => void

export const DITTO_MESSAGE_TYPE = 'ditto_message'

// DITTO_REQUEST_METHOD denotes message method required to have response from external way
export const DITTO_REQUEST_METHOD = 'ditto_request'
