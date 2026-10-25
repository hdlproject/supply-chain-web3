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
    supply_chain_web3::state::{Batch, BatchStatus, Movement, Role, SourceType},
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
    admin_role
}

fn grant_role(svm: &mut LiteSVM, admin: &Keypair, admin_role: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let target_role = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole { wallet, role }.data(),
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
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
}

fn register_batch(svm: &mut LiteSVM, source: &Keypair, batch_id: [u8; 16]) -> Pubkey {
    let program_id = supply_chain_web3::id();
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
            source_type: SourceType::TraditionalMarket,
            line_item_count: 0,
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
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[source]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    batch
}

fn movement_pda(batch: Pubkey, movement_count: u32) -> Pubkey {
    let program_id = supply_chain_web3::id();
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::MOVEMENT_SEED,
            batch.as_ref(),
            &movement_count.to_le_bytes(),
        ],
        &program_id,
    )
    .0
}

#[test]
fn test_log_movement_transit_then_warehouse_stop() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [3u8; 16]);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, carrier.pubkey(), Role::Carrier);
    let carrier_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    // Leg 1: transit leg with courier + vehicle.
    let movement_0 = movement_pda(batch, 0);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            vehicle_id: Some("VEHICLE-1".to_string()),
            from_location: "Traditional Market".to_string(),
            to_location: "Transit Hub".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: carrier.pubkey(),
            role_assignment: carrier_role,
            batch,
            movement: movement_0,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let movement_account = svm.get_account(&movement_0).unwrap();
    let mut data: &[u8] = &movement_account.data;
    let movement_state = Movement::try_deserialize(&mut data).unwrap();
    assert_eq!(movement_state.batch, batch);
    assert_eq!(movement_state.carrier, carrier.pubkey());
    assert_eq!(movement_state.vehicle_id, Some("VEHICLE-1".to_string()));

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.status, BatchStatus::InTransit);
    assert_eq!(batch_state.movement_count, 1);

    // Leg 2: warehouse stop, no courier/vehicle.
    let movement_1 = movement_pda(batch, 1);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            vehicle_id: None,
            from_location: "Transit Hub".to_string(),
            to_location: "Central Warehouse".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: carrier.pubkey(),
            role_assignment: carrier_role,
            batch,
            movement: movement_1,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.movement_count, 2);
}

#[test]
fn test_log_movement_rejects_wrong_role() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [4u8; 16]);

    // `source` was never assigned the Carrier role.
    let program_id = supply_chain_web3::id();
    let source_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let movement_0 = movement_pda(batch, 0);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            vehicle_id: Some("VEHICLE-1".to_string()),
            from_location: "A".to_string(),
            to_location: "B".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: source.pubkey(),
            role_assignment: source_role,
            batch,
            movement: movement_0,
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

