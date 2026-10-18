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
    supply_chain_web3::state::{Batch, BatchStatus, LineItem, Role, SourceType},
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

fn product_pda(sku_code: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::PRODUCT_SEED,
            sku_code.as_bytes(),
        ],
        &supply_chain_web3::id(),
    )
    .0
}

fn register_product_ix(registrant: Pubkey, role_assignment: Pubkey, sku_code: &str, name: &str) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::RegisterProduct {
            sku_code: sku_code.to_string(),
            name: name.to_string(),
        }
        .data(),
        supply_chain_web3::accounts::RegisterProduct {
            registrant,
            role_assignment,
            product: product_pda(sku_code),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn batch_pda(batch_id: [u8; 16]) -> Pubkey {
    Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &supply_chain_web3::id(),
    )
    .0
}

fn register_batch_ix(
    source: Pubkey,
    role_assignment: Pubkey,
    batch_id: [u8; 16],
    source_type: SourceType,
    line_item_count: u16,
) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            source_type,
            line_item_count,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source,
            role_assignment,
            batch: batch_pda(batch_id),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn line_item_pda(batch: Pubkey, index: u16) -> Pubkey {
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::LINE_ITEM_SEED,
            batch.as_ref(),
            &index.to_le_bytes(),
        ],
        &supply_chain_web3::id(),
    )
    .0
}

fn add_line_item_ix(
    source: Pubkey,
    role_assignment: Pubkey,
    batch: Pubkey,
    index: u16,
    sku_code: &str,
    quantity: u64,
) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::AddLineItem {
            index,
            sku_code: sku_code.to_string(),
            quantity,
        }
        .data(),
        supply_chain_web3::accounts::AddLineItem {
            source,
            role_assignment,
            batch,
            product: product_pda(sku_code),
            line_item: line_item_pda(batch, index),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_register_batch_with_line_items_happy_path() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, source.pubkey(), Role::Source);
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [7u8; 16];
    let batch = batch_pda(batch_id);

    // One transaction: create the batch, register a new SKU, add two
    // line items (one referencing the brand-new SKU, one referencing an
    // already-existing one) -- exactly the atomic composition this
    // feature is built around.
    let blockhash = svm.latest_blockhash();
    let seed_product = register_product_ix(admin.pubkey(), admin_role, "RICE-JASMINE-5KG", "Jasmine Rice 5kg");
    let msg = Message::new_with_blockhash(&[seed_product], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let instructions = vec![
        register_batch_ix(source.pubkey(), role_assignment, batch_id, SourceType::Farmer, 2),
        register_product_ix(source.pubkey(), role_assignment, "CHICKEN-BREAST-1KG", "Chicken Breast 1kg"),
        add_line_item_ix(source.pubkey(), role_assignment, batch, 0, "CHICKEN-BREAST-1KG", 50),
        add_line_item_ix(source.pubkey(), role_assignment, batch, 1, "RICE-JASMINE-5KG", 10),
    ];
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&instructions, Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "{res:?}");

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.batch_id, batch_id);
    assert_eq!(batch_state.source_type, SourceType::Farmer);
    assert_eq!(batch_state.source, source.pubkey());
    assert_eq!(batch_state.status, BatchStatus::Registered);
    assert_eq!(batch_state.line_item_count, 2);

    let item0_account = svm.get_account(&line_item_pda(batch, 0)).unwrap();
    let mut data: &[u8] = &item0_account.data;
    let item0 = LineItem::try_deserialize(&mut data).unwrap();
    assert_eq!(item0.batch, batch);
    assert_eq!(item0.index, 0);
    assert_eq!(item0.product, product_pda("CHICKEN-BREAST-1KG"));
    assert_eq!(item0.quantity, 50);

    let item1_account = svm.get_account(&line_item_pda(batch, 1)).unwrap();
    let mut data: &[u8] = &item1_account.data;
    let item1 = LineItem::try_deserialize(&mut data).unwrap();
    assert_eq!(item1.product, product_pda("RICE-JASMINE-5KG"));
    assert_eq!(item1.quantity, 10);
}

#[test]
fn test_register_batch_rejects_wrong_role() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, carrier.pubkey(), Role::Carrier);
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [1u8; 16];
    let instruction =
        register_batch_ix(carrier.pubkey(), role_assignment, batch_id, SourceType::Supermarket, 0);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_add_line_item_rejects_index_out_of_range() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, source.pubkey(), Role::Source);
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [3u8; 16];
    let batch = batch_pda(batch_id);
    let instructions = vec![
        register_batch_ix(source.pubkey(), role_assignment, batch_id, SourceType::Farmer, 1),
        register_product_ix(source.pubkey(), role_assignment, "ONLY-ONE-SLOT", "Only One Slot"),
    ];
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&instructions, Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // line_item_count is 1 -- index 1 is out of range.
    svm.expire_blockhash();
    let instruction =
        add_line_item_ix(source.pubkey(), role_assignment, batch, 1, "ONLY-ONE-SLOT", 5);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_add_line_item_rejects_non_owner() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, owner.pubkey(), Role::Source);
    let owner_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            owner.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, impostor.pubkey(), Role::Source);
    let impostor_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            impostor.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [4u8; 16];
    let batch = batch_pda(batch_id);
    let instructions = vec![
        register_batch_ix(owner.pubkey(), owner_role, batch_id, SourceType::Farmer, 1),
        register_product_ix(owner.pubkey(), owner_role, "SOMEONE-ELSES-SKU", "Someone Else's SKU"),
    ];
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&instructions, Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // impostor holds Source too, but doesn't own this batch -- has_one
    // on the batch account must reject this regardless of role.
    svm.expire_blockhash();
    let instruction = add_line_item_ix(
        impostor.pubkey(),
        impostor_role,
        batch,
        0,
        "SOMEONE-ELSES-SKU",
        1,
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&impostor.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}
