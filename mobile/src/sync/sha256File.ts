import RNFS from 'react-native-fs';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** SHA-256 hex digest of a local file. */
export async function sha256HexFile(path: string): Promise<string> {
  const base64 = await RNFS.readFile(path, 'base64');
  const bytes = base64ToBytes(base64);
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(hash));
  }
  throw new Error('crypto.subtle недоступен для проверки SHA-256');
}
