 .PHONY: help build test validator deploy airdrop fmt lint clean idl web stop-web

PROGRAM_DIR := programs/supply-chain-web3
PROGRAM_SO := target/deploy/supply_chain_web3.so
TOOLS_VERSION := v2.3.2
WEB_PORT := 3000

help:
	@echo "Targets:"
	@echo "  make build      - build the on-chain program (.so)"
	@echo "  make test       - build, then run the full test suite"
	@echo "  make validator  - start a local solana-test-validator in the background"
	@echo "  make deploy     - build, then deploy to localnet (needs 'make validator' running)"
	@echo "  make airdrop    - airdrop 2 SOL to the configured wallet on localnet"
	@echo "  make idl        - regenerate the Anchor IDL into app/src/idl/"
	@echo "  make web        - stop any existing dev server on port $(WEB_PORT), then run the frontend dev server"
	@echo "  make stop-web   - kill whatever is listening on port $(WEB_PORT)"
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

fmt:
	cargo fmt

lint:
	cargo clippy

clean:
	cargo clean
	rm -rf test-ledger
