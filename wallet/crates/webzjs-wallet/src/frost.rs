//! Threshold control of a shared pot with FROST (RedPallas, re-randomized), so that no single
//! co-host can move its money: any `min` of the `max` co-hosts together sign each spend.
//!
//! Keys are made with FROST's distributed key generation, with no dealer: nobody ever holds the
//! whole spending key. The group's verifying key becomes the pot's Orchard/Ironwood spend
//! validating key `ak`; the viewing parts (`nk`, `rivk`) come from a seed the co-hosts share, so
//! every co-host can see the pot (its incoming pieces and their amounts, not who sent them).
//!
//! All values cross this module as bytes (each FROST type's own serialization), so the browser
//! and the network transport never need to understand them.
use std::collections::BTreeMap;

use frost_rerandomized::Randomizer;
use rand_core::OsRng;
use reddsa::frost::redpallas as frost;

use crate::error::Error;

fn err<E: std::fmt::Debug>(what: &str) -> impl FnOnce(E) -> Error + '_ {
    move |e| Error::Generic(format!("{what}: {e:?}"))
}

fn identifier(index: u16) -> Result<frost::Identifier, Error> {
    frost::Identifier::try_from(index).map_err(err("bad co-host number"))
}

fn ids<T>(
    map: &BTreeMap<u16, Vec<u8>>,
    parse: impl Fn(&[u8]) -> Result<T, Error>,
) -> Result<BTreeMap<frost::Identifier, T>, Error> {
    map.iter()
        .map(|(index, bytes)| Ok((identifier(*index)?, parse(bytes)?)))
        .collect()
}

/// Key generation, part 1, by co-host `me` (1-based) of `max`, any `min` of whom can sign.
/// Returns this co-host's secret (kept) and the package for every other co-host.
pub fn dkg_part1(me: u16, max: u16, min: u16) -> Result<(Vec<u8>, Vec<u8>), Error> {
    let (secret, package) = frost::keys::dkg::part1(identifier(me)?, max, min, OsRng)
        .map_err(err("key generation, part 1"))?;
    Ok((
        secret.serialize().map_err(err("serialize"))?,
        package.serialize().map_err(err("serialize"))?,
    ))
}

/// Part 2: from the part-1 secret and every other co-host's part-1 package. Returns the new
/// secret (kept) and one package per other co-host, each for that co-host only.
pub fn dkg_part2(
    secret1: &[u8],
    round1: &BTreeMap<u16, Vec<u8>>,
) -> Result<(Vec<u8>, BTreeMap<u16, Vec<u8>>), Error> {
    let secret = frost::keys::dkg::round1::SecretPackage::deserialize(secret1)
        .map_err(err("read secret"))?;
    let round1 = ids(round1, |b| {
        frost::keys::dkg::round1::Package::deserialize(b).map_err(err("read package"))
    })?;
    let (secret2, packages) =
        frost::keys::dkg::part2(secret, &round1).map_err(err("key generation, part 2"))?;
    let mut out = BTreeMap::new();
    for (id, package) in packages {
        out.insert(id_to_u16(&id)?, package.serialize().map_err(err("serialize"))?);
    }
    Ok((secret2.serialize().map_err(err("serialize"))?, out))
}

/// Part 3: the co-host's long-term key share and the group's public key package.
pub fn dkg_part3(
    secret2: &[u8],
    round1: &BTreeMap<u16, Vec<u8>>,
    round2: &BTreeMap<u16, Vec<u8>>,
) -> Result<(Vec<u8>, Vec<u8>), Error> {
    let secret = frost::keys::dkg::round2::SecretPackage::deserialize(secret2)
        .map_err(err("read secret"))?;
    let round1 = ids(round1, |b| {
        frost::keys::dkg::round1::Package::deserialize(b).map_err(err("read package"))
    })?;
    let round2 = ids(round2, |b| {
        frost::keys::dkg::round2::Package::deserialize(b).map_err(err("read package"))
    })?;
    let (key_package, public_package) = frost::keys::dkg::part3(&secret, &round1, &round2)
        .map_err(err("key generation, part 3"))?;
    Ok((
        key_package.serialize().map_err(err("serialize"))?,
        public_package.serialize().map_err(err("serialize"))?,
    ))
}

fn id_to_u16(id: &frost::Identifier) -> Result<u16, Error> {
    // Identifiers made from a u16 serialize as that number, little-endian, in the first bytes.
    let bytes = id.serialize();
    let value = u16::from_le_bytes([bytes[0], bytes[1]]);
    if identifier(value)? == *id {
        Ok(value)
    } else {
        Err(Error::Generic("unexpected co-host identifier".to_string()))
    }
}

/// The pot's Orchard full viewing key: the group's key as `ak`, with `nk` and `rivk` taken from
/// a key derived from `viewing_seed`, which every co-host gets.
pub fn pot_full_viewing_key(
    public_key_package: &[u8],
    viewing_seed: &[u8; 32],
) -> Result<orchard::keys::FullViewingKey, Error> {
    let public = frost::keys::PublicKeyPackage::deserialize(public_key_package)
        .map_err(err("read public key"))?;
    let ak = public
        .verifying_key()
        .serialize()
        .map_err(err("serialize group key"))?;
    // Find a valid spending key near the seed; only its nk and rivk are used.
    let mut seed = *viewing_seed;
    let sk = loop {
        let candidate: Option<orchard::keys::SpendingKey> =
            orchard::keys::SpendingKey::from_bytes(seed).into();
        if let Some(sk) = candidate {
            break sk;
        }
        seed[0] = seed[0].wrapping_add(1);
    };
    let template = orchard::keys::FullViewingKey::from(&sk as &orchard::keys::SpendingKey).to_bytes();
    let mut bytes = [0u8; 96];
    bytes[..32].copy_from_slice(&ak);
    bytes[32..].copy_from_slice(&template[32..]);
    orchard::keys::FullViewingKey::from_bytes(&bytes)
        .ok_or_else(|| Error::Generic("the group key is not a valid spend key".to_string()))
}

/// Signing, round 1, by one co-host for one spend: secret nonces (kept) and public commitments.
pub fn sign_round1(key_package: &[u8]) -> Result<(Vec<u8>, Vec<u8>), Error> {
    let key = frost::keys::KeyPackage::deserialize(key_package).map_err(err("read key share"))?;
    let (nonces, commitments) = frost::round1::commit(key.signing_share(), &mut OsRng);
    Ok((
        nonces.serialize().map_err(err("serialize"))?,
        commitments.serialize().map_err(err("serialize"))?,
    ))
}

/// The coordinator's signing package for one spend: everyone's commitments and the sighash.
pub fn signing_package(
    commitments: &BTreeMap<u16, Vec<u8>>,
    sighash: &[u8; 32],
) -> Result<Vec<u8>, Error> {
    let commitments = ids(commitments, |b| {
        frost::round1::SigningCommitments::deserialize(b).map_err(err("read commitments"))
    })?;
    frost::SigningPackage::new(commitments, sighash)
        .serialize()
        .map_err(err("serialize"))
}

/// Signing, round 2: this co-host's signature share for one spend, re-randomized with `alpha`.
#[allow(deprecated)]
pub fn sign_round2(
    key_package: &[u8],
    nonces: &[u8],
    signing_package: &[u8],
    alpha: &[u8; 32],
) -> Result<Vec<u8>, Error> {
    let key = frost::keys::KeyPackage::deserialize(key_package).map_err(err("read key share"))?;
    let nonces = frost::round1::SigningNonces::deserialize(nonces).map_err(err("read nonces"))?;
    let package =
        frost::SigningPackage::deserialize(signing_package).map_err(err("read signing package"))?;
    let randomizer = Randomizer::deserialize(alpha).map_err(err("read randomizer"))?;
    let share = frost_rerandomized::sign::<frost::PallasBlake2b512>(&package, &nonces, &key, randomizer)
        .map_err(err("sign"))?;
    Ok(share.serialize())
}

/// Aggregates the shares into the spend authorization signature for one spend.
pub fn aggregate(
    signing_package: &[u8],
    shares: &BTreeMap<u16, Vec<u8>>,
    public_key_package: &[u8],
    alpha: &[u8; 32],
) -> Result<[u8; 64], Error> {
    let package =
        frost::SigningPackage::deserialize(signing_package).map_err(err("read signing package"))?;
    let shares = ids(shares, |b| {
        frost::round2::SignatureShare::deserialize(b).map_err(err("read share"))
    })?;
    let public = frost::keys::PublicKeyPackage::deserialize(public_key_package)
        .map_err(err("read public key"))?;
    let randomizer = Randomizer::deserialize(alpha).map_err(err("read randomizer"))?;
    let params = frost_rerandomized::RandomizedParams::from_randomizer(public.verifying_key(), randomizer);
    let signature = frost::rerandomized::aggregate(&package, &shares, &public, &params)
        .map_err(err("aggregate"))?;
    let bytes = signature.serialize().map_err(err("serialize signature"))?;
    bytes
        .try_into()
        .map_err(|_| Error::Generic("a signature is 64 bytes".to_string()))
}
