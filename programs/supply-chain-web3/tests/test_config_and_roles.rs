use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    supply_chain_web3::state::{Role, RoleAssignment},
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
fn test_initialize_config_and_assign_role() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();

    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
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
    let config_state = supply_chain_web3::state::Config::try_deserialize(&mut data).unwrap();
    assert_eq!(config_state.admin, admin.pubkey());

    let source_wallet = Keypair::new();
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source_wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole {
            wallet: source_wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::AssignRole {
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

    let role_account = svm.get_account(&role_assignment).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, source_wallet.pubkey());
    assert_eq!(role_state.role, Role::Source);
}

#[test]
fn test_assign_role_rejects_non_admin() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();

    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    let target_wallet = Keypair::new();
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            target_wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole {
            wallet: target_wallet.pubkey(),
            role: Role::Carrier,
        }
        .data(),
        supply_chain_web3::accounts::AssignRole {
            admin: impostor.pubkey(),
            config,
            role_assignment,
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
