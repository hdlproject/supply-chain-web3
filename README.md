# ChainTrace — Restaurant Ingredient Supply Chain

A Solana/Anchor dApp tracking ingredient batches from Source → Carrier →
Restaurant, with a shared SKU catalog for multi-product batches. See
`prd/` for the full design history (v1–v5) and
`programs/supply-chain-web3/src/` for the on-chain program.

## Prerequisites

- Rust + `cargo build-sbf` (via the Agave/Solana toolchain)
- `anchor` CLI
- `solana` CLI
- Node.js + `npm` (for `app/`, the Next.js frontend)
- A wallet seed phrase (e.g. from Phantom) to act as the deployer/admin —
  see [One-time: recover your wallet keypair](#one-time-recover-your-wallet-keypair)

All commands below run from the repo root unless stated otherwise.

## First-time setup

```bash
make phantom-key   # recover your wallet's keypair file (see below) — once ever
make build         # compile the on-chain program
make validator      # start a local validator — leave this terminal running
```

In a **second terminal**:

```bash
make deploy-as     # build + deploy the program, using the wallet from `make phantom-key`
make provision     # bootstrap your wallet on-chain with all 4 roles
make web           # start the frontend dev server at http://localhost:3000
```

(`make deploy-as` defaults to the wallet from `make phantom-key`. Plain
`make deploy` uses your default Solana CLI keypair instead — works too,
but then your deploy authority and your admin/bootstrap wallet are two
different identities for no reason. `deploy-as` keeps it to one.)

Open `http://localhost:3000/login`, connect the wallet you recovered above,
and sign in — it holds Admin, Source, Carrier, and Restaurant all at once.

## One-time: recover your wallet keypair

`make phantom-key` turns a BIP39 seed phrase (e.g. Phantom's) into a local
Solana CLI keypair file at `~/.config/solana/phantom-deploy.json`. Your
phrase is never echoed or written anywhere — `solana-keygen`'s own
`prompt://` recovery reads it directly from stdin.

```bash
make phantom-key
```

Confirm the printed pubkey matches the address your wallet shows for that
account before trusting the file. This is the wallet every other command
below (`deploy-as`, `provision`) defaults to using.

## Restarting after a stop (the day-to-day flow)

**If the validator is still running** (check with `make validator` — it
attaches instead of starting a new one if so), you don't need to do
anything. Just run `make web` if the frontend dev server also needs a
restart.

**If the validator was stopped** (you closed its terminal, your machine
slept, etc.), its on-chain state — including your wallet's roles — is
gone unless it resumes from a saved ledger. In this project, a stopped
validator almost always needs the full sequence again:

```bash
# terminal 1
make validator
# terminal 2, once the validator is healthy
make deploy-as
make provision
make web
```

**Skipping `make deploy-as` + `make provision` after a validator restart
is the single most common cause of errors in this app** — see
[Troubleshooting](#troubleshooting) below.

## Troubleshooting

### "This wallet has no on-chain role. Ask an admin to register it."

This means `Config`/your wallet's `RoleAssignment` don't exist on
*whichever validator the app is currently pointed at*. It happens any
time the validator's chain state resets or isn't what you think it is —
most commonly:

1. You restarted the validator (even without `RESET=1`) and it came up
   empty — either because `test-ledger/` didn't carry over, or because a
   prior session ended uncleanly and the ledger didn't resume. Check what's
   actually on the running validator before guessing:
   ```bash
   solana program show <program-id> --url localhost   # is the program deployed at all?
   ```
2. The program *is* deployed, but you (or a prior session) never ran
   `make provision` against *this* validator instance — deploying and
   provisioning are separate steps. Fix:
   ```bash
   make provision
   ```
3. Nothing above helped — treat it as a fresh start:
   ```bash
   make validator RESET=1   # wipes the ledger deliberately
   make deploy-as
   make provision
   ```

After any of the above, **restart the frontend dev server** (`make web`)
so it isn't holding a stale build against the old chain state.

### "Account allocation failed... Attempt to debit an account but found no record of a prior credit"

The wallet signing a transaction has zero balance on *this* validator
instance. Airdrop to it:

```bash
make airdrop   # airdrops to the default configured wallet
# or, for a specific address:
solana airdrop 2 <address> --url localhost
```

### Program upgrade hangs or fails with "ExtendProgram was superseded by ExtendProgramChecked"

In-place program upgrades (`anchor deploy` against a validator that
already has this program deployed, after an on-chain schema change) are
unreliable in this environment — a CLI/validator version mismatch on the
BPF loader's "extend program space" instruction. Don't wait on it; use
the fresh-start sequence instead:

```bash
make validator RESET=1 
make deploy-as
make provision
```

### Breaking on-chain schema changes

Several past changes to this program's on-chain account layouts (v2
through v5 in `prd/`) were breaking changes with **no migration path** —
old accounts from a previous layout cannot be read by newer code. Every
time the program's `src/state.rs` changes shape, the fix is the same
fresh-start sequence above, not an in-place upgrade.

## Makefile reference

Run `make help` for the full list. Highlights:

| Command | What it does |
|---|---|
| `make build` | Compile the on-chain program |
| `make test` | Build, then run the full Rust test suite |
| `make validator [RESET=1]` | Start a local validator (resumes existing state by default; `RESET=1` wipes it). Attaches instead of erroring if one's already running — Ctrl-C then stops it for real. |
| `make deploy` | Build, then deploy to the running local validator |
| `make deploy-as [WALLET=<path>]` | Deploy using a specific keypair (defaults to the one from `make phantom-key`) |
| `make provision` | Bootstrap your wallet on-chain with all 4 roles |
| `make airdrop` | Airdrop 2 SOL to the default configured wallet |
| `make idl` | Regenerate the Anchor IDL the frontend reads |
| `make web` | Start the frontend dev server (stops any existing one on the same port first) |
| `make phantom-key` | Recover a keypair file from a seed phrase, once |
| `make fmt` / `make lint` | `cargo fmt` / `cargo clippy` |
| `make clean` | `cargo clean` + remove `test-ledger/` |
