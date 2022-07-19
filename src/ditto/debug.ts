export const providerProxy = (obj: any, logger = console.log) => {
  obj.on('connect', (connectInfo: any) => logger('Debug: connect fired: ', connectInfo))
  return proxy(obj, 'ethereum', logger)
}

const proxy = (obj: any, name: string, logger = console.log) => {
  if (typeof obj === 'object') {
    const props = Object.getOwnPropertyNames(obj)
    if (obj.__proto__) {
      props.push(...Object.getOwnPropertyNames(obj.__proto__))
    }
    for (const key of props.filter(n => !n.startsWith('_'))) {
      const val = obj[key]
      if (typeof val === 'function') {
        obj[key] = proxy(val, `${name}.${key}`, logger)
      }
    }
  }

  const handler = {
    get: function(target: any, prop: any): any {
      const value = target[prop]
      if (!prop.startsWith('_') && typeof target !== 'function' && typeof value !== 'function') {
        logger(`Debug: ${name}.${prop} read:`, value)
      }
      return value
    },

    apply: function(target: any, thisArg: any, argumentsList: any) {
      logger(`Debug: ${name} called`, argumentsList)
      const rv = target.apply(thisArg, argumentsList)
      if (rv?.then) {
        rv.then((v: any) => logger(`Debug: ${name} returned (async):`, v))
      } else {
        logger(`Debug: ${name} returned`, rv)
      }
      return rv
    }
  }

  return new Proxy(obj, handler)
}
