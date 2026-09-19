use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_clock::Clock,
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
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = 1_700_000_000;
    svm.set_sysvar::<Clock>(&clock);
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    (svm, admin)
}

fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    let program_id = supply_chain_web3::id();
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
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    config
}

fn assign_role(svm: &mut LiteSVM, admin: &Keypair, config: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let role_assignment = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole { wallet, role }.data(),
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
            ingredient_name: "Basil".to_string(),
            quantity: 5,
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
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[source]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    batch
}

fn receive_ix(restaurant: Pubkey, role_assignment: Pubkey, batch: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::ReceiveAtRestaurant {}.data(),
        supply_chain_web3::accounts::ReceiveAtRestaurant {
            restaurant,
            role_assignment,
            batch,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_receive_at_restaurant_happy_path() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [8u8; 16]);

    let restaurant = Keypair::new();
    svm.airdrop(&restaurant.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, restaurant.pubkey(), Role::Restaurant);
    let program_id = supply_chain_web3::id();
    let restaurant_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            restaurant.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.status, BatchStatus::Delivered);
    assert_eq!(batch_state.received_by, restaurant.pubkey());
    assert!(batch_state.delivered_at > 0);
}

#[test]
fn test_receive_at_restaurant_rejects_wrong_role() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [9u8; 16]);

    // `source` was never assigned the Restaurant role.
    let program_id = supply_chain_web3::id();
    let source_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = receive_ix(source.pubkey(), source_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_receive_at_restaurant_rejects_double_receive() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [10u8; 16]);

    let restaurant = Keypair::new();
    svm.airdrop(&restaurant.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, restaurant.pubkey(), Role::Restaurant);
    let program_id = supply_chain_web3::id();
    let restaurant_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            restaurant.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Second receipt on the same, already-delivered batch must fail.
    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_log_movement_rejects_after_delivered() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [11u8; 16]);

    let restaurant = Keypair::new();
    svm.airdrop(&restaurant.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, restaurant.pubkey(), Role::Restaurant);
    let program_id = supply_chain_web3::id();
    let restaurant_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            restaurant.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, carrier.pubkey(), Role::Carrier);
    let carrier_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let movement_0 = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::MOVEMENT_SEED,
            batch.as_ref(),
            &0u32.to_le_bytes(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            courier_id: None,
            vehicle_id: None,
            from_location: "Restaurant".to_string(),
            to_location: "Kitchen".to_string(),
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
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}
