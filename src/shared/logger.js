const PREFIX = '[Mina]'

const canDebug = import.meta.env.DEV

function format(message) {
  return `${PREFIX} ${message}`
}

export const logger = {
  info(message, ...meta) {
    console.info(format(message), ...meta)
  },
  warn(message, ...meta) {
    console.warn(format(message), ...meta)
  },
  error(message, ...meta) {
    console.error(format(message), ...meta)
  },
  debug(message, ...meta) {
    if (!canDebug) return
    console.debug(format(message), ...meta)
  },
}
