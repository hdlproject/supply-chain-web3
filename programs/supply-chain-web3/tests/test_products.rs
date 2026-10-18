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
    supply_chain_web3::state::Product,
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

fn register_product_ix(
    registrant: Pubkey,
    role_assignment: Pubkey,
    sku_code: &str,
    name: &str,
) -> Instruction {
    let product = product_pda(sku_code);
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
            product,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_register_product_happy_path() {
    let (mut svm, admin) = new_svm_with_payer();
    let admin_role = init_config(&mut svm, &admin);

    let instruction =
        register_product_ix(admin.pubkey(), admin_role, "TOMATO-ROMA-1KG", "Roma Tomatoes 1kg");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let product_account = svm.get_account(&product_pda("TOMATO-ROMA-1KG")).unwrap();
    let mut data: &[u8] = &product_account.data;
    let product = Product::try_deserialize(&mut data).unwrap();
    assert_eq!(product.sku_code, "TOMATO-ROMA-1KG");
    assert_eq!(product.name, "Roma Tomatoes 1kg");
}

#[test]
fn test_register_product_is_idempotent() {
    let (mut svm, admin) = new_svm_with_payer();
    let admin_role = init_config(&mut svm, &admin);

    let first =
        register_product_ix(admin.pubkey(), admin_role, "TOMATO-ROMA-1KG", "Roma Tomatoes 1kg");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[first], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Second call for the SAME code, with a DIFFERENT name, must still
    // succeed (not reject) -- and must NOT overwrite the original name.
    svm.expire_blockhash();
    let second = register_product_ix(admin.pubkey(), admin_role, "TOMATO-ROMA-1KG", "Something Else");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[second], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let product_account = svm.get_account(&product_pda("TOMATO-ROMA-1KG")).unwrap();
    let mut data: &[u8] = &product_account.data;
    let product = Product::try_deserialize(&mut data).unwrap();
    assert_eq!(product.name, "Roma Tomatoes 1kg", "first registration's name must stick");
}

#[test]
fn test_register_product_rejects_name_too_long() {
    let (mut svm, admin) = new_svm_with_payer();
    let admin_role = init_config(&mut svm, &admin);

    let instruction = register_product_ix(admin.pubkey(), admin_role, "LONG-NAME-SKU", &"x".repeat(65));
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_register_product_rejects_role_less_wallet() {
    let (mut svm, _admin) = new_svm_with_payer();
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let stranger_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            stranger.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    // stranger_role was never created via grant_role, so this account
    // simply doesn't exist yet -- the same "missing RoleAssignment reads
    // as Unauthorized" design decision already established project-wide
    // (see prd/v1_basic_functionality.md's Errors section).
    let instruction = register_product_ix(stranger.pubkey(), stranger_role, "ANY-SKU", "Anything");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&stranger.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&stranger]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}
