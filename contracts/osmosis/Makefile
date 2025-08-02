.PHONY: build test deploy setup clean

build:
	@echo "Building Osmosis contracts..."
	cd contracts && cargo wasm
	@echo "Optimizing WASM files..."
	cd contracts && docker run --rm -v "$(PWD)/contracts":/code \
		--mount type=volume,source="devcontract_cache_burner",target=/code/target \
		--mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
		cosmwasm/rust-optimizer:0.12.13

test:
	@echo "Running contract tests..."
	cd contracts && cargo test

deploy:
	@echo "Deploying to Osmosis testnet..."
	npm run deploy:testnet

setup:
	@echo "Setting up cross-chain environment..."
	npm run setup:cross-chain

test-integration:
	@echo "Running integration tests..."
	npm run test:integration

clean:
	cd contracts && cargo clean
	rm -rf node_modules
	rm -f deployments.json
	rm -f test-config.json

install:
	npm install
	cd contracts && cargo check

full-setup: clean install build deploy setup
	@echo "Full setup completed!"

check-env:
	@echo "Checking environment variables..."
	@test -n "$(OSMO_TESTNET_MNEMONIC)" || (echo "OSMO_TESTNET_MNEMONIC not set" && exit 1)
	@test -n "$(PRIVATE_KEY)" || (echo "PRIVATE_KEY not set" && exit 1)
	@echo "Environment check passed!"
