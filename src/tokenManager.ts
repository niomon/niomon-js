import { StoreBase } from 'store2'

import { resolveStorage } from './storage'

export interface TokenManager {
  add (key: string, token: string | object): Promise<void>;
  addObject (key: string, token: object): Promise<void>;
  get (key: string): Promise<string|null>;
  getObject (key: string): Promise<object|null>;
  remove (key: string): Promise<void>;
  clear (): Promise<void>;
}

export interface TokenManagerOptions {
	storage?: string
}

export class BrowserTokenManager implements TokenManager {
	private storage: StoreBase
	private keyPrefix: string

  /**
   * Create a TokenManager.
   *
   * @param {string} clientId Client ID.
   * @param {object} options Token manager options.
   * @param {string} options.storage Name of the token store. Default is 'localStorage'.
   */
  constructor (clientId: string, options: TokenManagerOptions = {}) {
    if (typeof clientId !== 'string') {
      throw new Error('clientId is required')
    }
    if (typeof options !== 'object') {
      throw new Error('options must be an object')
    }
    if (!options.storage) {
      options.storage = 'localStorage'
    }
    if (typeof options.storage !== 'string') {
      throw new Error('options.storage must be a string')
    }
    this.storage = resolveStorage(options.storage)
    this.keyPrefix = `authcore.tokenManager.${clientId}.`
  }

  /**
   * Add a token to the token manager.
   *
   * @param {string} key A unique key to identify The token.
   * @param {string | object} token The token.
   */
  async add (key: string, token: string | object): Promise<void> {
    if (typeof token === 'object') {
      this.addObject(key, token)
      return
    }
    this.storage.set(this.keyPrefix + key, token)
  }

  async addObject(key: string, token: object): Promise<void> {
    const payload = JSON.stringify(token)
    this.storage.set(this.keyPrefix + key, payload)
  }

  /**
   * Get a token from the token manager.
   *
   * @param {string} key A unique key to identify the token.
   * @returns {string|object} A token string, or a token object if json is set to true.
   */
  get (key: string): Promise<string|null> {
    const value = this.storage.get(this.keyPrefix + key)
    return value ?? null
  }

  async getObject (key: string): Promise<object|null> {
    const value = await this.storage.get(this.keyPrefix + key)
    return value ? JSON.parse(value) : null
  }

  /**
   * Remove a token from the token manager.
   *
   * @param {string} key A unique key to identify the token.
   */
  async remove (key: string): Promise<void> {
    await this.storage.remove(this.keyPrefix + key);
  }

  /**
   * Clear all tokens under this client ID.
   */
  async clear (): Promise<void> {
    await Promise.all(Object.keys(this.storage).filter(key => key.startsWith(this.keyPrefix)).map(this.storage.remove));
  }
}
