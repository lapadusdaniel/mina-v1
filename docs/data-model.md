# Data Model (Firestore)

## `users/{uid}`
- `email`
- `displayName`
- `role` (`user` | `admin`)
- `createdAt`

## `profiles/{uid}`
- `brandName`
- `instagramUrl`
- `whatsappNumber`
- `websiteUrl`
- `accentColor`
- `logoPath`

## `galleries/{galleryId}`
- `ownerUid`
- `name`
- `slug`
- `category`
- `status` (`active` | `trash` | `archived`)
- `eventDate`
- `expiresAt`
- `photoCount`
- `createdAt`
- `updatedAt`

## `gallerySelections/{galleryId}/clients/{clientId}`
- `clientName`
- `selectedPhotoKeys[]`
- `createdAt`
- `updatedAt`

## `customers/{uid}/subscriptions/{subId}`
- documente create de extensia Stripe

## `adminOverrides/{uid}` (optional)
- `plan` (`Free` | `Pro` | `Unlimited`)
