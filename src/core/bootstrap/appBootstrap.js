import { createAppServices } from './createAppServices'
import { getPublicEnv, validatePublicEnv } from '../config/env'
import { logger } from '../../shared/logger'

let cache = null

export function bootstrapApp() {
  if (cache) return cache

  validatePublicEnv({ strict: true })

  const runtime = {
    env: getPublicEnv(),
    services: createAppServices(),
  }

  cache = runtime
  logger.info('Bootstrap initializat')

  return runtime
}

export function getAppRuntime() {
  return bootstrapApp()
}

export function getAppServices() {
  return bootstrapApp().services
}
