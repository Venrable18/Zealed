#!/usr/bin/env bash
# Fetches the exact dependency revisions the wallet is built on and applies our patches:
#   librustzcash   NU7 branch id and testnet height
#   wasm_thread    no use of eval (the content security policy forbids it)
# Safe to run again: it does nothing when the patched copy is already in place.
set -euo pipefail
cd "$(dirname "$0")/.."

fetch_and_patch() { # name, repository, revision, patch file
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

fetch_and_patch librustzcash zcash/librustzcash 0a2c6d1ae6274e6af2291e312f7b7459516882f2 patches/librustzcash-nu7.patch
fetch_and_patch wasm_thread ec2/wasm_thread 9e432077948d927d49373d1d039c23447d3648df patches/wasm_thread-no-eval.patch
echo "Done."
