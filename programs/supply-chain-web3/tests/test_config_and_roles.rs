use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_instruction::error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
    supply_chain_web3::state::{Config, Role, RoleAssignment},
};

fn new_svm_with_payer() -> (LiteSVM, Keypair) {
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/supply_chain_web3.so"
    ));
    svm.add_program(supply_chain_web3::id(), bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    (svm, payer)
}

#[test]
fn test_initialize_config_bootstraps_all_roles_for_caller() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();

    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            admin.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            role_assignment,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let config_account = svm.get_account(&config).unwrap();
    let mut data: &[u8] = &config_account.data;
    let config_state = Config::try_deserialize(&mut data).unwrap();
    assert_eq!(config_state.bootstrap_authority, admin.pubkey());

    let role_account = svm.get_account(&role_assignment).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, admin.pubkey());
    assert!(role_state.is_admin);
    assert!(role_state.is_source);
    assert!(role_state.is_carrier);
    assert!(role_state.is_restaurant);
}

fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> (Pubkey, Pubkey) {
    let program_id = supply_chain_web3::id();
    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let admin_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            admin.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            role_assignment: admin_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    (config, admin_role)
}

#[test]
fn test_grant_role_adds_a_role_to_a_fresh_wallet() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    let (_config, admin_role) = init_config(&mut svm, &admin);

    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, wallet.pubkey());
    assert!(role_state.is_source);
    assert!(!role_state.is_admin);
    assert!(!role_state.is_carrier);
    assert!(!role_state.is_restaurant);
}

#[test]
fn test_grant_role_rejects_non_admin() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    init_config(&mut svm, &admin);

    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    let impostor_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            impostor.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Carrier,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: impostor.pubkey(),
            admin_role_assignment: impostor_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&impostor.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_revoke_role_removes_a_role() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    let (_config, admin_role) = init_config(&mut svm, &admin);

    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let grant_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[grant_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let revoke_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RevokeRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::RevokeRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[revoke_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert!(!role_state.is_source);
}

#[test]
fn test_revoke_role_rejects_a_role_the_wallet_does_not_hold() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    let (_config, admin_role) = init_config(&mut svm, &admin);

    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    // Grant Source only — Carrier is never set true for this wallet.
    let grant_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[grant_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Revoking Carrier (never held) must fail, not silently no-op succeed.
    let revoke_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RevokeRole {
            wallet: wallet.pubkey(),
            role: Role::Carrier,
        }
        .data(),
        supply_chain_web3::accounts::RevokeRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[revoke_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    let res = svm.send_transaction(tx);
    let err = res.unwrap_err().err;
    assert_eq!(
        err,
        TransactionError::InstructionError(0, InstructionError::Custom(6003)),
        "expected RoleNotHeld (custom error 6003), got {err:?}"
    );

    // Source, which WAS granted, must be untouched by the rejected revoke.
    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert!(role_state.is_source);
    assert!(!role_state.is_carrier);
}

#[test]
fn test_grant_and_revoke_admin_role_on_a_fresh_wallet() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    let (_config, admin_role) = init_config(&mut svm, &admin);

    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let grant_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Admin,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[grant_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, wallet.pubkey());
    assert!(role_state.is_admin);
    assert!(!role_state.is_source);
    assert!(!role_state.is_carrier);
    assert!(!role_state.is_restaurant);

    let revoke_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RevokeRole {
            wallet: wallet.pubkey(),
            role: Role::Admin,
        }
        .data(),
        supply_chain_web3::accounts::RevokeRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[revoke_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert!(!role_state.is_admin);
}
