import type { PublicKey } from "@solana/web3.js";

import { batchPda, configPda, getReadProgram, roleAssignmentPda } from "./program";

export async function fetchConfig() {
  const program = getReadProgram();
  const [pda] = configPda();
  return program.account.config.fetchNullable(pda);
}

export async function fetchRoleAssignment(wallet: PublicKey) {
  const program = getReadProgram();
  const [pda] = roleAssignmentPda(wallet);
  return program.account.roleAssignment.fetchNullable(pda);
}

export async function fetchBatch(batchIdBytes: Uint8Array) {
  const program = getReadProgram();
  const [pda] = batchPda(batchIdBytes);
  return program.account.batch.fetchNullable(pda);
}

export type BatchAccountDecoded = NonNullable<Awaited<ReturnType<typeof fetchBatch>>>;

export async function fetchAllBatches() {
  const program = getReadProgram();
  return program.account.batch.all();
}

export type BatchEntry = Awaited<ReturnType<typeof fetchAllBatches>>[number];

export async function fetchBatchesBySource(wallet: PublicKey): Promise<BatchEntry[]> {
  const all = await fetchAllBatches();
  return all.filter((entry) => entry.account.source.equals(wallet));
}

export async function fetchInTransitBatches(): Promise<BatchEntry[]> {
  const all = await fetchAllBatches();
  return all.filter((entry) => "inTransit" in entry.account.status);
}

export async function fetchMovementsByCarrier(wallet: PublicKey) {
  const program = getReadProgram();
  const all = await program.account.movement.all();
  return all.filter((entry) => entry.account.carrier.equals(wallet));
}

export type MovementEntry = Awaited<ReturnType<typeof fetchMovementsByCarrier>>[number];

export async function fetchMovementsForBatch(batch: PublicKey) {
  const program = getReadProgram();
  const entries = await program.account.movement.all([
    { memcmp: { offset: 8, bytes: batch.toBase58() } },
  ]);
  return entries
    .map((entry) => entry.account)
    .sort((a, b) => a.timestamp.toNumber() - b.timestamp.toNumber());
}

export type MovementRecord = Awaited<ReturnType<typeof fetchMovementsForBatch>>[number];
