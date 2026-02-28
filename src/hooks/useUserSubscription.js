import { useState, useEffect, useCallback } from 'react'
import { getAppServices } from '../core/bootstrap/appBootstrap'
import { PLAN_PRICES, STORAGE_LIMITS } from '../modules/billing/billing.service'

const billingService = getAppServices().billing
export { PLAN_PRICES, STORAGE_LIMITS }

export function useUserSubscription(uid) {
  const [userPlan, setUserPlan] = useState('Free')
  const [storageLimit, setStorageLimit] = useState(STORAGE_LIMITS.Free)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)

    const unsubscribe = billingService.watchUserPlan(uid, ({ plan, storageLimit: limit }) => {
      setUserPlan(plan)
      setStorageLimit(limit)
      setLoading(false)
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [uid])

  const checkAccess = useCallback((feature) => {
    switch (feature) {
      case 'pro':
      case 'site':
      case 'customSlug':
        return userPlan === 'Pro' || userPlan === 'Studio'
      case 'studio':
      case 'unlimited':
      case 'customDomain':
        return userPlan === 'Studio'
      default:
        return false
    }
  }, [userPlan])

  return { userPlan, storageLimit, loading, checkAccess }
}
