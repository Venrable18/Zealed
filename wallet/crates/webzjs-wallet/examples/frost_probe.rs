//! Proves a FROST-controlled shared pot on the testnet: 3 co-hosts make the key with no dealer;
//! FUND=1 pays the pot from the probe wallet; WITHDRAW=1 has co-hosts 1 and 3 sign a withdrawal.
use std::{collections::BTreeMap, env, fs, str::FromStr, time::Duration};
use tonic::transport::{Channel, ClientTlsConfig};
use webzjs_common::Network;
use webzjs_wallet::{frost, wallet, Wallet};
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::{wallet::ConfirmationsPolicy, AccountPurpose, WalletRead};
use zcash_client_memory::MemoryWalletDb;

fn hexr(path: &str) -> Option<Vec<u8>> {
    fs::read_to_string(path).ok().map(|s| hex::decode(s.trim()).unwrap())
}

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let dir = "/tmp/zfrost";
    fs::create_dir_all(dir).unwrap();
    let (max, min) = (3u16, 2u16);

    // Distributed key generation, all three co-hosts in one process (in the app each is a browser).
    if hexr(&format!("{dir}/public.hex")).is_none() {
        let mut secrets1 = BTreeMap::new();
        let mut round1 = BTreeMap::new();
        for me in 1..=max {
            let (s, p) = frost::dkg_part1(me, max, min).unwrap();
            secrets1.insert(me, s);
            round1.insert(me, p);
        }
        let mut secrets2 = BTreeMap::new();
        let mut round2: BTreeMap<u16, BTreeMap<u16, Vec<u8>>> = BTreeMap::new(); // to -> from -> pkg
        for me in 1..=max {
            let others: BTreeMap<u16, Vec<u8>> =
                round1.iter().filter(|(k, _)| **k != me).map(|(k, v)| (*k, v.clone())).collect();
            let (s2, packages) = frost::dkg_part2(&secrets1[&me], &others).unwrap();
            secrets2.insert(me, s2);
            for (to, pkg) in packages {
                round2.entry(to).or_default().insert(me, pkg);
            }
        }
        let mut public = None;
        for me in 1..=max {
            let others: BTreeMap<u16, Vec<u8>> =
                round1.iter().filter(|(k, _)| **k != me).map(|(k, v)| (*k, v.clone())).collect();
            let (key, pubpkg) = frost::dkg_part3(&secrets2[&me], &others, &round2[&me]).unwrap();
            fs::write(format!("{dir}/key{me}.hex"), hex::encode(key)).unwrap();
            if let Some(p) = &public {
                assert_eq!(p, &pubpkg, "every co-host must get the same public key package");
            }
            public = Some(pubpkg);
        }
        fs::write(format!("{dir}/public.hex"), hex::encode(public.unwrap())).unwrap();
        let mut seed = [0u8; 32];
        getrandom::getrandom(&mut seed).unwrap();
        fs::write(format!("{dir}/seed.hex"), hex::encode(seed)).unwrap();
        println!("DKG done: 3 co-hosts, any 2 can sign");
    }
    let public = hexr(&format!("{dir}/public.hex")).unwrap();
    let seed: [u8; 32] = hexr(&format!("{dir}/seed.hex")).unwrap().try_into().unwrap();
    let fvk = frost::pot_full_viewing_key(&public, &seed).unwrap();
    let ufvk = zcash_keys::keys::UnifiedFullViewingKey::from_orchard_fvk(fvk).unwrap();

    let channel = Channel::from_static("https://testnet.zec.rocks:443")
        .tls_config(ClientTlsConfig::new().with_webpki_roots()).unwrap()
        .connect_timeout(Duration::from_secs(20)).connect().await.expect("connect");
    let db = MemoryWalletDb::new(Network::TestNetwork, 100);
    let w = Wallet::new(db, channel, Network::TestNetwork, ConfirmationsPolicy::default()).unwrap();
    let phrase = fs::read_to_string("/tmp/zprobe/seed.txt").unwrap();
    let main = w.create_account("main", phrase.trim(), 0, Some(4536800), None).await.unwrap();
    let pot_birthday: u32 = fs::read_to_string(format!("{dir}/birthday.txt")).ok().and_then(|s| s.trim().parse().ok()).unwrap_or(4538000);
    let pot = w.import_ufvk("pot", &ufvk, AccountPurpose::ViewOnly, Some(pot_birthday), None).await.unwrap();
    let pot_address = w.current_address(pot).await.unwrap().unwrap();
    let main_address = w.current_address(main).await.unwrap().unwrap();
    println!("POT {pot_address}");
    w.sync().await.unwrap();
    let summary = w.get_wallet_summary().await.unwrap().unwrap();
    let bal = |a| summary.account_balances().get(&a).map(|b| (u64::from(b.total()), u64::from(b.spendable_value())));
    println!("MAIN {:?} POT {:?}", bal(main), bal(pot));

    if env::var("FUND").is_ok() {
        let to = ZcashAddress::from_str(&pot_address).unwrap();
        let ids = w.send_payments(phrase.trim(), 0, main, vec![(to, 300_000, None)]).await.unwrap();
        println!("FUNDED {:?}", ids);
    }
    if env::var("MEASURE").is_ok() {
        let to = ZcashAddress::from_str(&pot_address).unwrap();
        let pczt = w.pot_withdrawal_pczt(main, to, 100_000).await.unwrap();
        let full = pczt.clone().serialize().unwrap().len();
        let req_full = wallet::pczt_signing_request(&pczt).unwrap();
        let small = wallet::pczt_for_signers(pczt);
        let req_small = wallet::pczt_signing_request(&small).unwrap();
        println!("SIZE full={} for_signers={} same_sighash={} spends={}", full, small.clone().serialize().unwrap().len(), req_full.sighash == req_small.sighash, req_full.spends.len());
    }
    if env::var("WITHDRAW").is_ok() {
        let spendable = bal(pot).unwrap().1;
        let to = ZcashAddress::from_str(&main_address).unwrap();
        let mut built = None;
        for actions in 2..8u64 {
            match w.pot_withdrawal_pczt(pot, to.clone(), spendable - 5000 * actions).await {
                Ok(p) => { built = Some(p); break }
                Err(e) => println!("try {actions}: {e}"),
            }
        }
        let mut pczt = built.expect("a withdrawal");
        let request = wallet::pczt_signing_request(&pczt).unwrap();
        println!("SIGN sighash={} spends={}", hex::encode(request.sighash), request.spends.len());
        for (index, alpha) in request.spends {
            let signers = [1u16, 3u16];
            let mut nonces = BTreeMap::new();
            let mut commitments = BTreeMap::new();
            for s in signers {
                let key = hexr(&format!("{dir}/key{s}.hex")).unwrap();
                let (n, c) = frost::sign_round1(&key).unwrap();
                nonces.insert(s, n);
                commitments.insert(s, c);
            }
            let package = frost::signing_package(&commitments, &request.sighash).unwrap();
            let mut shares = BTreeMap::new();
            for s in signers {
                let key = hexr(&format!("{dir}/key{s}.hex")).unwrap();
                shares.insert(s, frost::sign_round2(&key, &nonces[&s], &package, &alpha, &request.sighash).unwrap());
            }
            let signature = frost::aggregate(&package, &shares, &public, &alpha).unwrap();
            pczt = wallet::pczt_apply_ironwood_signature(pczt, index, signature).unwrap();
            println!("SIGNED spend {index} with co-hosts 1 and 3");
        }
        let pczt = w.pczt_prove(pczt, None).await.unwrap();
        println!("PROVED");
        w.pczt_send(pczt).await.unwrap();
        println!("WITHDRAWN to main");
    }
}
