.PHONY: build test deploy interact clean install-deps

# Build the contract
build:
	cargo build --release --target wasm32-unknown-unknown
	@echo "Contract built successfully!"

# Run Rust tests
test-rust:
	cargo test

# Install JavaScript/TypeScript dependencies
install-deps:
	cd tests && yarn install

# Run TypeScript tests (requires deployed contract)
test-ts:
	cd tests && yarn test

# Build TypeScript
build-ts:
	cd tests && yarn build

# Deploy contract to Neutron testnet
deploy:
	cd tests && yarn ts-node ../scripts/deploy.ts

# Interact with deployed contract
interact:
	cd tests && yarn ts-node ../scripts/interact.ts

# Generate schema
schema:
	cd contracts/counter && cargo run --example schema

# Clean build artifacts
clean:
	cargo clean
	rm -rf tests/dist tests/coverage

# Install Rust target for WASM
install-wasm-target:
	rustup target add wasm32-unknown-unknown

# Optimize WASM for production (requires docker)
optimize:
	docker run --rm -v "$$(pwd)":/code \
		--mount type=volume,source="$$(basename "$$(pwd)")_cache",target=/code/target \
		--mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
		cosmwasm/rust-optimizer:0.12.13

# Full setup from scratch
setup: install-wasm-target install-deps
	@echo "Setup completed! You can now run 'make build' to build the contract."

# Development workflow
dev: build test-rust
	@echo "Development build and test completed!"