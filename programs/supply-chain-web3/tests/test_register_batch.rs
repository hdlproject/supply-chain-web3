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
    supply_chain_web3::state::{Batch, BatchStatus, Role, SourceType},
};

fn new_svm_with_admin() -> (LiteSVM, Keypair) {
    let admin = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/supply_chain_web3.so"
    ));
    svm.add_program(supply_chain_web3::id(), bytes).unwrap();
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    (svm, admin)
}

fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    let program_id = supply_chain_web3::id();
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
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    config
}

fn assign_role(svm: &mut LiteSVM, admin: &Keypair, _config: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let admin_role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            admin.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let target_role_assignment = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole { wallet, role }.data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment,
            target_role_assignment,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
}

#[test]
fn test_register_batch_happy_path() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);

    let batch_id: [u8; 16] = [7u8; 16];
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Chicken Breast".to_string(),
            quantity: 50,
            source_type: SourceType::Farmer,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: source.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.batch_id, batch_id);
    assert_eq!(batch_state.ingredient_name, "Chicken Breast");
    assert_eq!(batch_state.quantity, 50);
    assert_eq!(batch_state.source_type, SourceType::Farmer);
    assert_eq!(batch_state.source, source.pubkey());
    assert_eq!(batch_state.status, BatchStatus::Registered);
    assert_eq!(batch_state.movement_count, 0);
}

#[test]
fn test_register_batch_rejects_wrong_role() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, carrier.pubkey(), Role::Carrier);

    let batch_id: [u8; 16] = [1u8; 16];
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Rice".to_string(),
            quantity: 10,
            source_type: SourceType::Supermarket,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: carrier.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_register_batch_rejects_name_too_long() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);

    let batch_id: [u8; 16] = [2u8; 16];
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "x".repeat(65),
            quantity: 1,
            source_type: SourceType::Factory,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: source.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}
