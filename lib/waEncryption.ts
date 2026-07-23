import crypto from 'crypto'

// Encrypts/decrypts wa_client_config.access_token at rest. ENCRYPTION_KEY
// must be a 32-byte hex string (64 hex chars) — generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const ALGO = 'aes-256-cbc'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    throw new Error('ENCRYPTION_KEY env var is not set — cannot encrypt/decrypt WhatsApp access tokens')
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters)')
  }
  return key
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(payload: string): string {
  const [ivHex, encHex] = payload.split(':')
  if (!ivHex || !encHex) throw new Error('Malformed encrypted payload')
  const iv = Buffer.from(ivHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
