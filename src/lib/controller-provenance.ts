import { createHash, createPublicKey, verify } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArgumentError } from '@jackwener/opencli/errors'
import { z } from 'zod'
import type { WorkerPreflightPacket } from './schemas.js'

type SignedControllerPacket=Pick<WorkerPreflightPacket,'ownerUid'|'controllerKeyId'|'controllerPublicKey'|'controllerSignatureAlgorithm'|'packetDigest'|'controllerSignature'>

const SIGNING_ALGORITHM='ed25519'
const MAX_TRUSTED_KEYS_BYTES=64*1024
const trustedControllerKeysSchema=z.object({
  version:z.literal(1),
  keys:z.array(z.object({ ownerUid:z.string().min(1), controllerKeyId:z.string().min(1), publicKey:z.string().min(1) }).strict())
}).strict()

type TrustedControllerKey=z.infer<typeof trustedControllerKeysSchema>['keys'][number]

/** Mirrors Controller's canonical-json.ts exactly; do not substitute localeCompare sorting. */
export function controllerCanonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

function normalize(value: unknown): unknown {
  if (value===null || typeof value==='string' || typeof value==='boolean') return value
  if (typeof value==='number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers')
    return Object.is(value,-0) ? 0 : value
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value==='object') {
    const result: Record<string,unknown>={}
    for (const key of Object.keys(value as object).sort()) {
      const item=(value as Record<string,unknown>)[key]
      if (item!==undefined) result[key]=normalize(item)
    }
    return result
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`)
}

function controllerKeyId(publicKey: string): string {
  return `controller-ed25519:${createHash('sha256').update(publicKey).digest('base64url')}`
}

function defaultTrustedKeysPath(): string {
  return join(homedir(),'.config','loopctl','trusted-controller-keys.json')
}

function trustedKeysPath(): string {
  const configured=process.env.LOOPCTL_TRUSTED_CONTROLLER_KEYS_FILE?.trim()
  return configured || defaultTrustedKeysPath()
}

/** Read only an owner-private, regular file through a no-follow descriptor. */
function readTrustedKeysFile(path: string): string {
  let descriptor: number | undefined
  try {
    const pathStats=lstatSync(path)
    if (pathStats.isSymbolicLink()) throw new Error('trusted Controller key file must not be a symbolic link')
    if (!pathStats.isFile()) throw new Error('trusted Controller key file must be a regular file')
    if ((pathStats.mode & 0o777)!==0o600) throw new Error('trusted Controller key file must have mode 0600')
    descriptor=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW)
    const descriptorStats=fstatSync(descriptor)
    if (!descriptorStats.isFile()) throw new Error('trusted Controller key file must be a regular file')
    if ((descriptorStats.mode & 0o777)!==0o600) throw new Error('trusted Controller key file must have mode 0600')
    if (descriptorStats.size>MAX_TRUSTED_KEYS_BYTES) throw new Error('trusted Controller key file is too large')
    if (typeof process.getuid==='function' && descriptorStats.uid!==process.getuid()) throw new Error('trusted Controller key file must be owned by the current user')
    if (descriptorStats.dev!==pathStats.dev || descriptorStats.ino!==pathStats.ino) throw new Error('trusted Controller key file changed while opening')
    return readFileSync(descriptor,'utf8')
  } finally {
    if (descriptor!==undefined) closeSync(descriptor)
  }
}

function trustedKey(packet: SignedControllerPacket): TrustedControllerKey {
  let config: z.infer<typeof trustedControllerKeysSchema>
  try {
    config=trustedControllerKeysSchema.parse(JSON.parse(readTrustedKeysFile(trustedKeysPath())))
    const identities=new Set<string>()
    for (const key of config.keys) {
      const identity=`${key.ownerUid}\u0000${key.controllerKeyId}`
      if (identities.has(identity)) throw new Error('trusted Controller key configuration has duplicate owner/key entries')
      identities.add(identity)
      if (key.controllerKeyId!==controllerKeyId(key.publicKey)) throw new Error('trusted Controller key configuration has an invalid key ID')
      if (createPublicKey(key.publicKey).asymmetricKeyType!==SIGNING_ALGORITHM) throw new Error('trusted Controller key configuration has a non-Ed25519 public key')
    }
  } catch (error) {
    const detail=error instanceof Error ? error.message : 'invalid configuration'
    throw new ArgumentError(`trusted Controller key configuration is unavailable or invalid: ${detail}`)
  }
  const matches=config.keys.filter(key=>key.ownerUid===packet.ownerUid && key.controllerKeyId===packet.controllerKeyId)
  if (matches.length!==1) throw new ArgumentError('preflight packet Controller key is not pinned for its owner')
  const pin=matches[0]
  if (pin.publicKey!==packet.controllerPublicKey) throw new ArgumentError('preflight packet Controller public key does not match its trusted pin')
  return pin
}

/** Verify Controller's digest projection and exact Ed25519 signature bytes against a local pin. */
export function verifyTrustedControllerPreflightPacket(packet: SignedControllerPacket): void {
  if (packet.controllerSignatureAlgorithm!==SIGNING_ALGORITHM) throw new ArgumentError('preflight packet Controller signature algorithm is invalid')
  if (packet.controllerKeyId!==controllerKeyId(packet.controllerPublicKey)) throw new ArgumentError('preflight packet Controller key ID does not match its public key')
  trustedKey(packet)
  const { controllerSignature: _signature, packetDigest, ...withoutDigest }=packet
  const expectedDigest=createHash('sha256').update(controllerCanonicalJson(withoutDigest)).digest('hex')
  if (packetDigest!==expectedDigest) throw new ArgumentError('preflight packet packetDigest does not match the canonical Controller action packet')
  const { controllerSignature: _ignoredSignature, ...signaturePayload }=packet
  try {
    const verified=verify(null,Buffer.from(controllerCanonicalJson(signaturePayload)),createPublicKey(packet.controllerPublicKey),Buffer.from(packet.controllerSignature,'base64'))
    if (!verified) throw new Error('signature mismatch')
  } catch {
    throw new ArgumentError('preflight packet Controller signature is invalid')
  }
}
