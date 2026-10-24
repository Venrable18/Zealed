#!/usr/bin/env bash
# Fetches the exact dependency versions the wallet is built on and applies our patches:
#   zcash_protocol 0.10.6        NU7 branch id and testnet activation height
#   zcash_client_backend 0.24.0  a failed transparent-UTXO refresh no longer stops a sync
#   zcash_client_memory          zcash/zcash_client_memory#17 (Ironwood support), plus a public
#                                way to list received notes and memos
#   wasm_thread                  no use of eval (the content security policy forbids it)
# Crates come from crates.io and are checked against their published SHA-256.
# Safe to run again: it does nothing for a copy that is already in place.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .deps

crate() { # name, version, sha256, patch file
  local name=$1 version=$2 sum=$3 patch_file=$4
  local dest=.deps/$name
  local stamp="$dest/.zealed-patched-$version"
  if [ -f "$stamp" ]; then
    echo "$name $version is already fetched and patched."
    return
  fi
  rm -rf "$dest" ".deps/$name.crate"
  echo "Fetching $name $version ..."
  curl -fsSL -A zealed-wallet-setup "https://static.crates.io/crates/$name/$name-$version.crate" -o ".deps/$name.crate"
  echo "$sum  .deps/$name.crate" | shasum -a 256 -c - >/dev/null
  mkdir -p "$dest"
  tar xzf ".deps/$name.crate" -C "$dest" --strip-components=1
  rm ".deps/$name.crate"
  echo "Applying $patch_file ..."
  patch -d "$dest" -p1 --forward < "$patch_file"
  touch "$stamp"
}

github() { # name, repository, revision, patch file
  local name=$1 repo=$2 rev=$3 patch_file=$4
  local dest=.deps/$name
  local stamp="$dest/.zealed-patched-$rev"
  if [ -f "$stamp" ]; then
    echo "$name $rev is already fetched and patched."
    return
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  echo "Fetching $name $rev ..."
  curl -fsSL "https://codeload.github.com/$repo/tar.gz/$rev" | tar xz -C "$dest" --strip-components=1
  echo "Applying $patch_file ..."
  patch -d "$dest" -p1 --forward < "$patch_file"
  touch "$stamp"
}

crate zcash_protocol 0.10.6 b20adb1cdb6ab551e83d1507461e89b41fc67e800eec9e59e0c8de96152e8c5c patches/zcash_protocol-nu7.patch
crate zcash_client_backend 0.24.0 07ad58d8ca5daacbc089bf82ec09e45cf2a8be40adeb40b9399b16545c81a528 patches/zcash_client_backend-utxo.patch
github zcash_client_memory zcashme/zcash_client_memory 9743f199c46242e536854f77c23922801e44967a patches/zcash_client_memory-notes.patch
github wasm_thread ec2/wasm_thread 9e432077948d927d49373d1d039c23447d3648df patches/wasm_thread-no-eval.patch
echo "Done."
