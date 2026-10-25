import type BN from "bn.js";

// Anchor represents a fieldless enum variant as an object with exactly one
// key, e.g. Rust `Role::TraditionalMarket` -> TS `{ traditionalMarket: {} }`
// (only the first letter of the variant name is lowercased). The *decoded*
// shape Anchor's generated client produces for this (`DecodeEnum<...>`) is a
// deep conditional type that isn't practically nameable here, so the reader
// side takes a bare `object` and reads its own keys at runtime instead of
// trying to structurally match it.
export type EnumVariant = Record<string, Record<string, never>>;

function variantName(value: object): string {
  const key = Object.keys(value)[0];
  if (!key) {
    throw new Error("empty enum variant object");
  }
  return key;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  source: "Source",
  carrier: "Carrier",
  restaurant: "Restaurant",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  farmer: "Farmer",
  factory: "Factory",
  traditionalMarket: "Traditional market",
  supermarket: "Supermarket",
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  inTransit: "In transit",
  delivered: "Delivered",
};

export function roleLabel(role: object): string {
  const name = variantName(role);
  return ROLE_LABELS[name] ?? name;
}

export function sourceTypeLabel(sourceType: object): string {
  const name = variantName(sourceType);
  return SOURCE_TYPE_LABELS[name] ?? name;
}

export function batchStatusLabel(status: object): string {
  const name = variantName(status);
  return BATCH_STATUS_LABELS[name] ?? name;
}

export function batchStatusSlug(status: object): "registered" | "transit" | "delivered" {
  const name = variantName(status);
  if (name === "inTransit") return "transit";
  if (name === "delivered") return "delivered";
  return "registered";
}

export function roleFormArg(role: "Admin" | "Source" | "Carrier" | "Restaurant"): EnumVariant {
  return { [lowerFirst(role)]: {} };
}

export function sourceTypeFormArg(
  sourceType: "Farmer" | "Factory" | "TraditionalMarket" | "Supermarket",
): EnumVariant {
  return { [lowerFirst(sourceType)]: {} };
}

export function formatTimestamp(seconds: BN | number): string {
  const n = typeof seconds === "number" ? seconds : seconds.toNumber();
  if (n === 0) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function shortWalletString(base58: string): string {
  return `${base58.slice(0, 4)}…${base58.slice(-4)}`;
}

export function shortWallet(pubkey: { toBase58(): string }): string {
  return shortWalletString(pubkey.toBase58());
}
