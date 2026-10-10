 .PHONY: help build test validator deploy deploy-as airdrop fmt lint clean idl web stop-web phantom-key

PROGRAM_DIR := programs/supply-chain-web3
PROGRAM_SO := target/deploy/supply_chain_web3.so
TOOLS_VERSION := v2.3.2
WEB_PORT := 3000
PHANTOM_KEY_PATH := $(HOME)/.config/solana/phantom-deploy.json

help:
	@echo "Targets:"
	@echo "  make build      - build the on-chain program (.so)"
	@echo "  make test       - build, then run the full test suite"
	@echo "  make validator  - start a local solana-test-validator in the background"
	@echo "  make deploy     - build, then deploy to localnet (needs 'make validator' running)"
	@echo "  make deploy-as [WALLET=<path>] - build, then deploy using WALLET (defaults to"
	@echo "                     $(PHANTOM_KEY_PATH)) as --provider.wallet"
	@echo "  make airdrop    - airdrop 2 SOL to the configured wallet on localnet"
	@echo "  make idl        - regenerate the Anchor IDL into app/src/idl/"
	@echo "  make web        - stop any existing dev server on port $(WEB_PORT), then run the frontend dev server"
	@echo "  make stop-web   - kill whatever is listening on port $(WEB_PORT)"
	@echo "  make phantom-key - recover a Solana CLI keypair file from a seed phrase"
	@echo "                     (e.g. Phantom's) into $(PHANTOM_KEY_PATH)"
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
	solana-test-validator --reset

deploy: build
	anchor deploy

# make deploy-as [WALLET=/path/to/keypair.json] -- defaults to
# PHANTOM_KEY_PATH (where `make phantom-key` writes), override with
# WALLET=... for any other keypair. Errors out if the resolved file
# doesn't actually exist rather than letting anchor deploy fail less
# clearly further in.
WALLET ?= $(PHANTOM_KEY_PATH)

deploy-as: build
	@if [ ! -f "$(WALLET)" ]; then \
		echo "No keypair at $(WALLET) -- run 'make phantom-key' first, or pass WALLET=/path/to/keypair.json"; \
		exit 1; \
	fi
	anchor deploy --provider.wallet $(WALLET)

airdrop:
	solana airdrop 2 --url localhost

# Uses `anchor idl build`, which compiles the idl-build feature via
# `cargo test` (host target) rather than `cargo build-sbf` — it never
# touches the .so, so it isn't affected by the litesvm/build-sbf
# workaround above.
idl:
	mkdir -p app/src/idl
	anchor idl build -o app/src/idl/supply_chain_web3.json -t app/src/idl/supply_chain_web3.ts

# Scoped to whatever is actually bound to WEB_PORT (not a broad `pkill -f
# "next dev"`, which would also kill unrelated next-dev processes on the
# machine).
stop-web:
	@pid=$$(lsof -ti tcp:$(WEB_PORT)); \
	if [ -n "$$pid" ]; then \
		echo "Killing existing process on port $(WEB_PORT) (pid $$pid)"; \
		kill $$pid; \
		sleep 1; \
	fi

web: stop-web
	cd app && npm run dev

# Uses solana-keygen's own `prompt://` recovery (never writes your phrase
# anywhere, doesn't echo it) rather than any custom parsing -- this is the
# official way to turn a BIP39 seed phrase into a CLI keypair file.
# key=0'/0' matches Phantom's default first-account derivation path
# (m/44'/501'/0'/0'); the printed pubkey at the end lets you confirm it
# matches the address Phantom shows before you trust the file for
# anything. Refuses to overwrite an existing file at PHANTOM_KEY_PATH --
# remove it yourself first if you mean to regenerate it.
phantom-key:
	@echo "Paste your seed phrase when prompted -- input is hidden, nothing is echoed or logged."
	@echo "If this account has a passphrase (BIP39 25th word) set, you'll be asked for that too."
	@mkdir -p $(dir $(PHANTOM_KEY_PATH))
	solana-keygen recover "prompt://?key=0'/0'" -o $(PHANTOM_KEY_PATH)
	@chmod 600 $(PHANTOM_KEY_PATH)
	@echo "Wrote $(PHANTOM_KEY_PATH) (mode 600)."
	@echo "Derived pubkey -- CONFIRM this matches the address Phantom shows for this account:"
	@solana-keygen pubkey $(PHANTOM_KEY_PATH)

fmt:
	cargo fmt

lint:
	cargo clippy

clean:
	cargo clean
	rm -rf test-ledger
