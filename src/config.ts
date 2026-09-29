// Both values are public by design (a VAPID public key and the Worker's
// public URL), so committing them here is safe — the private key lives only
// as a Cloudflare Worker secret.
export const VAPID_PUBLIC_KEY =
  'BOCBWYeZh1PEfP--1dbOnCPVvT3N58Iya-jzeQgBquWBsJNe0yGvVmG55seTbYMd-5sE4-9UWY1XrYqQeU30jYw'

export const PUSH_API_BASE = 'https://maintenance-timer-worker.multism04.workers.dev'
