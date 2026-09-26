.PHONY: help build test validator deploy airdrop fmt lint clean

PROGRAM_DIR := programs/supply-chain-web3
PROGRAM_SO := target/deploy/supply_chain_web3.so
TOOLS_VERSION := v2.3.2

help:
	@echo "Targets:"
	@echo "  make build      - build the on-chain program (.so)"
	@echo "  make test       - build, then run the full test suite"
	@echo "  make validator  - start a local solana-test-validator in the background"
	@echo "  make deploy     - build, then deploy to localnet (needs 'make validator' running)"
	@echo "  make airdrop    - airdrop 2 SOL to the configured wallet on localnet"
	@echo "  make fmt        - cargo fmt"
	@echo "  make lint       - cargo clippy"
	@echo "  make clean      - cargo clean + remove test-ledger/"

# anchor build / anchor test default to platform-tools that produce a .so
# litesvm rejects in this environment (see docs/superpowers/plans/
# 2026-09-19-restaurant-ingredient-supply-chain-v1.md Global Constraints).
# Building directly with cargo build-sbf at a known-good tools version is
# the verified workaround.
build:
	cd $(PROGRAM_DIR) && cargo build-sbf --tools-version $(TOOLS_VERSION)

test: build
	cargo test

validator:
	solana-test-validator --reset &

deploy: build
	anchor deploy

airdrop:
	solana airdrop 2 --url localhost

fmt:
	cargo fmt

lint:
	cargo clippy

clean:
	cargo clean
	rm -rf test-ledger
