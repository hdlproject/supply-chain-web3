// Human label for whichever cluster NEXT_PUBLIC_SOLANA_RPC_URL points at, so
// the header can show where transactions will actually land.
export function clusterLabel(rpcUrl: string): string {
  const url = rpcUrl.toLowerCase();
  if (url.includes("mainnet")) return "Mainnet";
  if (url.includes("devnet")) return "Devnet";
  if (url.includes("testnet")) return "Testnet";
  if (/(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(url)) return "Localnet";
  return "Custom RPC";
}
