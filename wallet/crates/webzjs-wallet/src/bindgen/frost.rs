//! JavaScript bindings for shared pots: FROST key generation and signing (see `crate::frost`),
//! and the transaction steps around them. Byte values cross as hex; maps of co-host number to
//! value cross as JSON objects (`{"1": "ab…", "3": "cd…"}`).
use std::collections::BTreeMap;
use std::str::FromStr;

use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::error::Error;
use crate::frost;

fn unhex(text: &str) -> Result<Vec<u8>, Error> {
    hex::decode(text).map_err(|_| Error::Generic("not valid hex".to_string()))
}

fn unhex32(text: &str) -> Result<[u8; 32], Error> {
    unhex(text)?
        .try_into()
        .map_err(|_| Error::Generic("expected 32 bytes".to_string()))
}

fn read_map(json: &str) -> Result<BTreeMap<u16, Vec<u8>>, Error> {
    let raw: BTreeMap<String, String> = serde_json::from_str(json)
        .map_err(|e| Error::Generic(format!("not a valid package list: {e}")))?;
    raw.into_iter()
        .map(|(k, v)| {
            let index: u16 = k
                .parse()
                .map_err(|_| Error::Generic("a co-host number is not a number".to_string()))?;
            Ok((index, unhex(&v)?))
        })
        .collect()
}

fn write_map(map: &BTreeMap<u16, Vec<u8>>) -> String {
    let out: BTreeMap<String, String> = map
        .iter()
        .map(|(k, v)| (k.to_string(), hex::encode(v)))
        .collect();
    serde_json::to_string(&out).unwrap_or_default()
}

#[derive(Serialize)]
struct Pair {
    secret: String,
    public: String,
}

fn pair((secret, public): (Vec<u8>, Vec<u8>)) -> String {
    serde_json::to_string(&Pair {
        secret: hex::encode(secret),
        public: hex::encode(public),
    })
    .unwrap_or_default()
}

/// Key generation, part 1. Returns `{ secret, public }`: keep `secret`, send `public` to every other co-host.
#[wasm_bindgen]
pub fn frost_dkg_part1(me: u16, max: u16, min: u16) -> Result<String, Error> {
    Ok(pair(frost::dkg_part1(me, max, min)?))
}

/// Part 2. Returns `{ secret, packages }`: keep `secret`; `packages[n]` goes to co-host `n` only.
#[wasm_bindgen]
pub fn frost_dkg_part2(secret_hex: &str, round1_json: &str) -> Result<String, Error> {
    let (secret, packages) = frost::dkg_part2(&unhex(secret_hex)?, &read_map(round1_json)?)?;
    Ok(format!(
        "{{\"secret\":\"{}\",\"packages\":{}}}",
        hex::encode(secret),
        write_map(&packages)
    ))
}

/// Part 3. Returns `{ secret: keyPackage, public: publicKeyPackage }`.
#[wasm_bindgen]
pub fn frost_dkg_part3(secret_hex: &str, round1_json: &str, round2_json: &str) -> Result<String, Error> {
    Ok(pair(frost::dkg_part3(
        &unhex(secret_hex)?,
        &read_map(round1_json)?,
        &read_map(round2_json)?,
    )?))
}

/// The shared pot's unified full viewing key, encoded for `network` ("main" or "test").
#[wasm_bindgen]
pub fn frost_pot_ufvk(network: &str, public_key_package_hex: &str, viewing_seed_hex: &str) -> Result<String, Error> {
    let network = webzjs_common::Network::from_str(network)?;
    let fvk = frost::pot_full_viewing_key(&unhex(public_key_package_hex)?, &unhex32(viewing_seed_hex)?)?;
    let ufvk = zcash_keys::keys::UnifiedFullViewingKey::from_orchard_fvk(fvk)
        .map_err(|e| Error::Generic(format!("cannot make the pot's viewing key: {e:?}")))?;
    Ok(ufvk.encode(&network))
}

/// Signing round 1 for one spend. Returns `{ secret: nonces, public: commitments }`.
#[wasm_bindgen]
pub fn frost_sign_round1(key_package_hex: &str) -> Result<String, Error> {
    Ok(pair(frost::sign_round1(&unhex(key_package_hex)?)?))
}

/// The coordinator's signing package for one spend.
#[wasm_bindgen]
pub fn frost_signing_package(commitments_json: &str, sighash_hex: &str) -> Result<String, Error> {
    Ok(hex::encode(frost::signing_package(
        &read_map(commitments_json)?,
        &unhex32(sighash_hex)?,
    )?))
}

/// Signing round 2 for one spend: this co-host's signature share. Refuses a package whose message
/// is not `sighash_hex` (the sighash the co-host computed from the transaction they checked).
#[wasm_bindgen]
pub fn frost_sign_round2(
    key_package_hex: &str,
    nonces_hex: &str,
    signing_package_hex: &str,
    alpha_hex: &str,
    sighash_hex: &str,
) -> Result<String, Error> {
    Ok(hex::encode(frost::sign_round2(
        &unhex(key_package_hex)?,
        &unhex(nonces_hex)?,
        &unhex(signing_package_hex)?,
        &unhex32(alpha_hex)?,
        &unhex32(sighash_hex)?,
    )?))
}

/// Combines the shares into the spend's signature (64 bytes, hex).
#[wasm_bindgen]
pub fn frost_aggregate(
    signing_package_hex: &str,
    shares_json: &str,
    public_key_package_hex: &str,
    alpha_hex: &str,
) -> Result<String, Error> {
    Ok(hex::encode(frost::aggregate(
        &unhex(signing_package_hex)?,
        &read_map(shares_json)?,
        &unhex(public_key_package_hex)?,
        &unhex32(alpha_hex)?,
    )?))
}

#[derive(Serialize)]
struct SpendOut {
    index: usize,
    alpha: String,
}

#[derive(Serialize)]
struct OutputOut {
    /// The recipient's unified address, when the transaction says.
    address: Option<String>,
    zat: Option<String>,
}

#[derive(Serialize)]
struct RequestOut {
    sighash: String,
    spends: Vec<SpendOut>,
    outputs: Vec<OutputOut>,
}

/// What a co-host checks before signing: the sighash they compute themselves from the
/// transaction, each spend to sign, and every output's recipient and amount.
///
/// A transaction holds only an output's shielded receiver, not the full address it was sent to.
/// `known_addresses_json` is a JSON array of addresses the caller can name (the pot's co-hosts and
/// the pot itself); an output to one of their receivers is reported under that address.
#[wasm_bindgen]
pub fn pczt_signing_request(
    network: &str,
    pczt_bytes: &[u8],
    known_addresses_json: &str,
) -> Result<String, Error> {
    let network = webzjs_common::Network::from_str(network)?;
    let known: Vec<(String, zcash_keys::address::UnifiedAddress)> =
        serde_json::from_str::<Vec<String>>(known_addresses_json)
            .map_err(|e| Error::Generic(format!("bad address list: {e}")))?
            .into_iter()
            .filter_map(|text| match zcash_keys::address::Address::decode(&network, &text) {
                Some(zcash_keys::address::Address::Unified(ua)) => Some((text, ua)),
                _ => None,
            })
            .collect();
    let pczt = pczt::Pczt::parse(pczt_bytes)
        .map_err(|e| Error::Generic(format!("not a transaction: {e:?}")))?;
    let request = crate::wallet::pczt_signing_request(&pczt)?;
    let mut outputs = Vec::new();
    pczt::roles::low_level_signer::Signer::new(pczt)
        .sign_ironwood_with(|_, bundle, _| {
            for action in bundle.actions() {
                let output = action.output();
                // Padding outputs have no value; they carry nothing.
                if output.value().map(|v| v.inner()) == Some(0) {
                    continue;
                }
                let address = output.recipient().and_then(|recipient| {
                    let named = known
                        .iter()
                        .find(|(_, ua)| ua.orchard() == Some(&recipient))
                        .map(|(text, _)| text.clone());
                    named.or_else(|| {
                        zcash_keys::address::UnifiedAddress::from_receivers(
                            Some(recipient),
                            None,
                            None,
                        )
                        .map(|ua| ua.encode(&network))
                    })
                });
                outputs.push(OutputOut {
                    address,
                    zat: output.value().map(|v| v.inner().to_string()),
                });
            }
            Ok::<(), pczt::roles::low_level_signer::OrchardParseError>(())
        })
        .map_err(|e| Error::Generic(format!("cannot read the outputs: {e:?}")))?;
    serde_json::to_string(&RequestOut {
        sighash: hex::encode(request.sighash),
        spends: request
            .spends
            .into_iter()
            .map(|(index, alpha)| SpendOut {
                index,
                alpha: hex::encode(alpha),
            })
            .collect(),
        outputs,
    })
    .map_err(|e| Error::Generic(format!("{e}")))
}

/// The transaction as sent to co-hosts: what they need to check and sign, nothing more.
#[wasm_bindgen]
pub fn pczt_for_signers(pczt_bytes: &[u8]) -> Result<Vec<u8>, Error> {
    let pczt = pczt::Pczt::parse(pczt_bytes)
        .map_err(|e| Error::Generic(format!("not a transaction: {e:?}")))?;
    crate::wallet::pczt_for_signers(pczt)
        .serialize()
        .map_err(|e| Error::Generic(format!("{e:?}")))
}

/// Puts a combined co-host signature on one spend; checked before it is kept.
#[wasm_bindgen]
pub fn pczt_apply_signature(pczt_bytes: &[u8], index: usize, signature_hex: &str) -> Result<Vec<u8>, Error> {
    let pczt = pczt::Pczt::parse(pczt_bytes)
        .map_err(|e| Error::Generic(format!("not a transaction: {e:?}")))?;
    let signature: [u8; 64] = unhex(signature_hex)?
        .try_into()
        .map_err(|_| Error::Generic("a signature is 64 bytes".to_string()))?;
    crate::wallet::pczt_apply_ironwood_signature(pczt, index, signature)?
        .serialize()
        .map_err(|e| Error::Generic(format!("{e:?}")))
}
