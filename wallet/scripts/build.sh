#!/usr/bin/env bash
# Builds the wallet to WebAssembly into wallet/pkg and copies it to public/wallet, where the app loads it.
# Needs: rustup with the nightly in rust-toolchain.toml, wasm-pack, curl, patch.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/setup.sh

# secp256k1 is C code, so it needs a clang that can target WebAssembly (Apple's clang cannot).
LLVM="${LLVM_DIR:-$(brew --prefix llvm 2>/dev/null || true)}"
if [ -n "$LLVM" ] && [ -x "$LLVM/bin/clang" ]; then
  export CC_wasm32_unknown_unknown="$LLVM/bin/clang"
  export AR_wasm32_unknown_unknown="$LLVM/bin/llvm-ar"
fi
(
  cd crates/webzjs-wallet
  wasm-pack build -t web --release --scope zealed --out-dir ../../pkg \
    --no-default-features --features="wasm wasm-parallel no-bundler" \
    -Z build-std="panic_abort,std"
)
# Served as plain files (not bundled), so the app can load it and the library can start its threads.
rm -rf ../public/wallet
mkdir -p ../public/wallet
cp -R pkg/. ../public/wallet/
rm -f ../public/wallet/.gitignore ../public/wallet/package.json
echo "Built wallet/pkg and copied it to public/wallet"
