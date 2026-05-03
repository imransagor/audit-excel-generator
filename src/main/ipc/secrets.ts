import { safeStorage } from 'electron'
import Store from 'electron-store'

const store = new Store<{ anthropicKey?: string; llamaparseKey?: string }>()

const SERVICE = 'audit-excel-generator'

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return value
}

function decrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return value
    }
  }
  return value
}

export function setApiKey(service: 'anthropic' | 'llamaparse', key: string): void {
  const storeKey = service === 'anthropic' ? 'anthropicKey' : 'llamaparseKey'
  store.set(storeKey, encrypt(key))
}

export function getApiKey(service: 'anthropic' | 'llamaparse'): string | null {
  const storeKey = service === 'anthropic' ? 'anthropicKey' : 'llamaparseKey'
  const raw = store.get(storeKey)
  if (!raw) return null
  return decrypt(raw)
}

export function hasAllKeys(): boolean {
  return !!getApiKey('anthropic') && !!getApiKey('llamaparse')
}

void SERVICE
