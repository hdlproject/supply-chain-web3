# Restaurant Ingredient Supply Chain — v4 Multi-Role Access

## Context

Through v1–v3 ([prd/v1_basic_functionality.md](v1_basic_functionality.md),
[prd/v2_frontend.md](v2_frontend.md), [prd/v3_wallet_auth.md](v3_wallet_auth.md))
a wallet could hold exactly one of `Source`/`Carrier`/`Restaurant` via its
`RoleAssignment` PDA, with `Admin`-ness handled entirely separately as a
single pubkey (`Config.admin`) set once at bootstrap. In practice this
meant the deployer — the one wallet guaranteed to exist the moment the
program comes up — could act as admin, but could not also register a
batch, log a movement, or receive one without a second, third, and fourth
wallet each holding one role.

v4 reworks this: a wallet can hold any combination of the four roles
(`Admin`, `Source`, `Carrier`, `Restaurant`) simultaneously, and the
deployer gets all four automatically, atomically, as part of the one-time
bootstrap instruction — "the starting point," not a follow-up convenience.

This is a breaking change to `RoleAssignment`'s on-chain layout. There is
no migration path — a fresh `--reset` + redeploy + re-provision is
required, same as every prior schema change in this project's history.

## On-chain data model

`RoleAssignment` drops its single `role: Role` field for four explicit
booleans:

```rust
#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub wallet: Pubkey,
    pub is_admin: bool,
    pub is_source: bool,
    pub is_carrier: bool,
    pub is_restaurant: bool,
}
```

The `Role` enum survives, but only as a 4-variant **selector** —
`Admin | Source | Carrier | Restaurant` — used by `grant_role`/
`revoke_role` to say *which* flag to touch. It is never stored directly
on `RoleAssignment` anymore.

`Config` shrinks to a single field kept for reference/audit, not used by
any authorization check going forward:

```rust
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub bootstrap_authority: Pubkey,
}
```

Its only functional role from here on is existing at all — Anchor's
`init` constraint already refuses a second call, which is all the
"has this system been bootstrapped yet" guard ever needed to be.

## Bootstrap: `initialize_config` grants the caller all four roles atomically

`initialize_config` does two things in one instruction, one transaction:
creates `Config` (storing the caller as `bootstrap_authority`), **and**
creates the caller's own `RoleAssignment` PDA with all four booleans
`true`. There is no window where the deployer is bootstrapped but not yet
an admin, and no separate script-side grant call is needed afterward —
the instruction's `Accounts` struct gains an `init` `role_assignment`
account (seeded by the caller's own key) alongside the existing `config`
account, both created in the same handler call.

## `grant_role` / `revoke_role` replace `assign_role`

Authorization moves from "`Config.admin == signer`" to "the signer's own
`RoleAssignment.is_admin == true`". Each instruction therefore needs two
`RoleAssignment` account references, not one:

- `admin_role_assignment` — the caller's own PDA (`seeds = [ROLE_SEED,
  admin.key()]`), read (not written) to verify `is_admin`.
- `target_role_assignment` — the wallet being granted/revoked a role
  (`seeds = [ROLE_SEED, wallet.as_ref()]`), `init_if_needed` on grant
  (a wallet with zero prior roles gets its `RoleAssignment` created,
  defaulting every bool to `false` before the one being granted is set
  `true`), plain mutable account on revoke.

`Config` is not referenced by either instruction anymore — the admin
check no longer needs it.

```rust
pub fn handle_grant_role(ctx: Context<GrantRole>, wallet: Pubkey, role: Role) -> Result<()> {
    require!(ctx.accounts.admin_role_assignment.is_admin, ErrorCode::Unauthorized);
    ctx.accounts.target_role_assignment.wallet = wallet;
    match role {
        Role::Admin => ctx.accounts.target_role_assignment.is_admin = true,
        Role::Source => ctx.accounts.target_role_assignment.is_source = true,
        Role::Carrier => ctx.accounts.target_role_assignment.is_carrier = true,
        Role::Restaurant => ctx.accounts.target_role_assignment.is_restaurant = true,
    }
    Ok(())
}

pub fn handle_revoke_role(ctx: Context<RevokeRole>, role: Role) -> Result<()> {
    require!(ctx.accounts.admin_role_assignment.is_admin, ErrorCode::Unauthorized);
    match role {
        Role::Admin => ctx.accounts.target_role_assignment.is_admin = false,
        Role::Source => ctx.accounts.target_role_assignment.is_source = false,
        Role::Carrier => ctx.accounts.target_role_assignment.is_carrier = false,
        Role::Restaurant => ctx.accounts.target_role_assignment.is_restaurant = false,
    }
    Ok(())
}
```

`revoke_role` takes `wallet` as part of the `#[instruction(...)]` seeds
derivation the same way `grant_role` does (needed to locate
`target_role_assignment`), even though the handler body above only shows
`role` for brevity — the account struct resolves `wallet` from the
instruction args exactly as `grant_role`'s does.

No guard against revoking your own last `is_admin` flag (self-lockout) —
accepted as an edge case out of scope for v4, consistent with this
project's existing "demo app, not production hardened" posture elsewhere
(see v3's own deferred-findings list).

## `register_batch` / `log_movement` / `receive_at_restaurant`

Each existing single-role equality check becomes a direct boolean check
on the same `role_assignment` account already fetched — no change to any
other part of these three instructions:

- `register_batch`: `role_assignment.role == Role::Source` →
  `role_assignment.is_source`
- `log_movement`: `role_assignment.role == Role::Carrier` →
  `role_assignment.is_carrier`
- `receive_at_restaurant`: `role_assignment.role == Role::Restaurant` →
  `role_assignment.is_restaurant`

## Frontend

- **`session.ts`**: `SessionPayload.role: DemoRole` → `roles: DemoRole[]`
  — a session now carries every role the wallet held *at login time*
  (same caching tradeoff v3 already accepted and documented, just applied
  to a set instead of one value).
- **`guard.ts`**: `resolveRole` → `resolveRoles(wallet): Promise<DemoRole[]>`
  — one `RoleAssignment` fetch now yields everything (`is_admin` is just
  another flag on the same account), so the separate `Config` fetch
  `resolveRole` used to do for the admin check goes away entirely.
  `requireRole(role)` checks `session.roles.includes(role)` instead of
  equality; `requireAdmin` checks `session.roles.includes("Admin")`.
- **Routing**: the post-login/`/` home page prefers `/admin` if the
  wallet holds that role, else the first granted role's path in a fixed
  order (`Admin, Source, Carrier, Restaurant`); `/login` with the
  existing "no on-chain role" error if the wallet holds none.
- **`NavBar`**: shows a link to every dashboard the current wallet can
  reach, not a single role badge — a multi-role wallet (the deployer, by
  default) needs to be able to move between `/admin`, `/source`,
  `/carrier`, `/restaurant` without re-authenticating.
- **Admin UI**: the single "Assign role" form is replaced by two small
  forms matching the instruction pair directly — **Grant role** (wallet
  address + role dropdown, calls `grant_role`) and **Revoke role** (same
  shape, calls `revoke_role`). No fetch-and-diff of a wallet's current
  roles before submitting — each form is a one-shot toggle, matching how
  `grant_role`/`revoke_role` themselves work.
- **`scripts/provision-demo-accounts.ts`**: effectively unchanged in
  shape — still one `initializeConfig()` call for the admin demo
  keypair, which now *is* the full bootstrap (Config + all 4 roles) in
  that single call. No script-side grant calls needed for the admin
  wallet. Source/Carrier/Restaurant demo wallets still get their roles
  exclusively through the admin UI's Grant-role form, per v3's existing
  "registration is admin-UI-only" decision — v4 doesn't change that for
  the three non-admin demo wallets, only the deployer/admin wallet
  bootstraps automatically.

## Out of scope for v4

- Any migration of existing on-chain `RoleAssignment` data — this is a
  breaking layout change, not a migration; a fresh `--reset` is required.
- Self-lockout prevention (revoking your own last admin flag).
- Changing `assign_role`'s historical callers outside this program —
  there are none; it is fully replaced by `grant_role`/`revoke_role`.
