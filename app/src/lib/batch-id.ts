export function newBatchId(): Uint8Array {
  const uuid = crypto.randomUUID();
  return hexToBatchId(uuid.replace(/-/g, ""));
}

export function batchIdToHex(batchId: Uint8Array): string {
  if (batchId.length !== 16) {
    throw new Error(`batchId must be 16 bytes, got ${batchId.length}`);
  }
  return Array.from(batchId)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBatchId(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`expected a 32-character hex string, got "${hex}"`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function shortBatchId(hex: string): string {
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}
