import store, {StoreBase}  from 'store2'

/**
 * Resolves storage instance. If the specified storage is not available, this method will fallback
 * to another storage mechanism.
 *
 * @param {string} storage Name of the storage method.
 * @returns {object} A storage instance.
 */
export function resolveStorage (storage: string): StoreBase {
  storage = storage.toLowerCase()
  if (storage === 'localstorage') {
    return store.local
  } else if (storage === 'sessionstorage') {
    return store.session
  }
  throw new Error(`storage ${storage} is not available`)
}

/**
 * Tests whether the browser storage is supported.
 *
 * @returns {boolean} Whether the browser storage is supported.
 */
export function isBrowserStorageSupported () {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (store.isFake()){
      console.warn("Browser storage is not available")
      return false
    }
    return true
  } catch (e) {
    return false
  }
}
