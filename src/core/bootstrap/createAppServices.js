import { auth, db } from '../../firebase'
import { createAuthModule } from '../../modules/auth'
import { createGalleriesModule } from '../../modules/galleries'
import { createMediaModule } from '../../modules/media'
import { createBillingModule } from '../../modules/billing'
import { createSitesModule } from '../../modules/sites'
import { createAdminModule } from '../../modules/admin'

export function createAppServices() {
  return {
    auth: createAuthModule({ auth, db }),
    galleries: createGalleriesModule({ db }),
    media: createMediaModule(),
    billing: createBillingModule({ db }),
    sites: createSitesModule({ db }),
    admin: createAdminModule({ db }),
  }
}
