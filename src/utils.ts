// resolveServiceHost returns the host of service server by given its own origin (cannot be ipv4 or ipv6) and target serviceName
// For example: resolveServiceHost('https://widgets.niomon.dev', 'app') => 'https://app.niomon.dev'
export const resolveServiceHost = (origin: string, serviceName: string, zone?: string): string => {
  const [scheme, hostWithTail] = origin.split('://')
  if (!hostWithTail) {
    throw new Error('Invalid origin or service name')
  }
  const [host] = hostWithTail.split('/')
  // return empty string if origin or serviceName is invalid
  const [hostname, port] = host.split(':')
  const serviceNameRegex = /^\w+$/
  if (isIpAddress(hostname) || (serviceName.match(serviceNameRegex) == null)) {
    throw new Error('Invalid origin or service name')
  }
  const hostnameElements = hostname.split('.')

  const [, subdomainSuffix] = splitOnFirst(hostnameElements[0], '-')

  let serviceSubdomain = serviceName
  if (zone) {
    serviceSubdomain += '-' + zone
  } else if (subdomainSuffix) {
    serviceSubdomain += '-' + subdomainSuffix
  }

  hostnameElements[0] = serviceSubdomain
  let resultHostname = hostnameElements.join('.')

  if (port) {
    resultHostname += ':' + port
  }

  return scheme + '://' + resultHostname
}

// isIpAddress check if input string is ipv4 or ipv6 address
export const isIpAddress = (ipAddress: string): boolean => {
  // regex reference: https://regexlib.com/UserPatterns.aspx?authorId=a94a4e2e-88ed-4399-bd6b-62050382b593
  const ipRegex = /^(((([1]?\d)?\d|2[0-4]\d|25[0-5])\.){3}(([1]?\d)?\d|2[0-4]\d|25[0-5]))|([\da-fA-F]{1,4}(:[\da-fA-F]{1,4}){7})|(([\da-fA-F]{1,4}:){0,5}::([\da-fA-F]{1,4}:){0,5}[\da-fA-F]{1,4})$/
  return !(ipAddress.match(ipRegex) == null)
}

export const splitOnFirst = (source: string, separator: string): string[] => {
  if (!(typeof source === 'string' && typeof separator === 'string')) {
    throw new TypeError('Expected the arguments to be of type `string`')
  }

  if (source === '' || separator === '') {
    return []
  }

  const separatorIndex = source.indexOf(separator)

  if (separatorIndex === -1) {
    return []
  }

  return [
    source.slice(0, separatorIndex),
    source.slice(separatorIndex + separator.length)
  ]
}

/**
 * Converts a buffer to an URL-safe base64-encoded string.
 *
 * @private
 * @param {Buffer} buf Buffer to-be converted.
 * @example
 * toBase64URLSafe(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64]))
 * // returns 'SGVsbG8gd29ybGQ'
 * @returns {string} The URL-safe base64-encoded string that is converted from the buffer.
 */
export const base64url = (buf: Buffer): string => {
  return buf.toString('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '')
}
