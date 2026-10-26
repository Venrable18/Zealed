//! Spike: sync a testnet wallet natively, and (when funded) send two memo payments and read them back.
use std::{env, fs, str::FromStr, time::Duration};
use bip0039::{English, Mnemonic};
use tonic::transport::{Channel, ClientTlsConfig};
use webzjs_common::Network;
use webzjs_wallet::Wallet;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::{wallet::ConfirmationsPolicy, WalletRead};
use zcash_client_memory::MemoryWalletDb;

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let dir = env::var("PROBE_DIR").unwrap();
    let seed_path = format!("{dir}/seed.txt");
    let seed = fs::read_to_string(&seed_path).unwrap_or_else(|_| {
        let m = <Mnemonic<English>>::generate(bip0039::Count::Words24).to_string();
        fs::write(&seed_path, &m).unwrap();
        m
    });
    let channel = Channel::from_static("https://testnet.zec.rocks:443")
        .tls_config(ClientTlsConfig::new().with_webpki_roots()).unwrap()
        .connect_timeout(Duration::from_secs(20)).connect().await.expect("connect");
    {
        use zcash_client_backend::proto::service::{compact_tx_streamer_client::CompactTxStreamerClient, AddressList, ChainSpec};
        let mut raw = CompactTxStreamerClient::new(channel.clone());
        let tip = raw.get_latest_block(ChainSpec::default()).await.map(|r| r.into_inner().height);
        let bal = raw.get_taddress_balance(AddressList { addresses: vec!["tmYsF9LB8cfuXmEkhhk1ANX9JPZ2NZzkepJ".to_string()] }).await.map(|r| r.into_inner().value_zat);
        println!("SERVER tip={:?} transparent_balance_zat={:?}", tip, bal);
        use zcash_client_backend::proto::service::TxFilter;
        let txid_hex = "98659b05a6e276f6a97f07b84a459d7e1082dc656988a35626134266b712ba4f";
        let mut hash = hex::decode(txid_hex).unwrap(); hash.reverse();
        match raw.get_transaction(TxFilter { block: None, index: 0, hash }).await {
            Ok(r) => {
                let t = r.into_inner();
                println!("TX height={} bytes={} head={}", t.height, t.data.len(), hex::encode(&t.data[..16.min(t.data.len())]));
                match zcash_primitives::transaction::Transaction::read(&t.data[..], zcash_protocol::consensus::BranchId::Nu7) {
                    Err(e) => println!("PARSE error {e}"),
                    Ok(tx) => {
                        println!("PARSE ok version={:?} sapling={} orchard={} ironwood={}", tx.version(),
                            tx.sapling_bundle().map(|b| b.shielded_outputs().len()).unwrap_or(0),
                            tx.orchard_bundle().map(|b| b.actions().len()).unwrap_or(0),
                            tx.ironwood_bundle().map(|b| b.actions().len()).unwrap_or(0));
                        let m = <Mnemonic<English>>::from_phrase(seed.trim()).unwrap();
                        let usk = zcash_keys::keys::UnifiedSpendingKey::from_seed(&Network::TestNetwork, &m.to_seed(""), zip32::AccountId::ZERO).unwrap();
                        let mut ufvks = std::collections::HashMap::new();
                        ufvks.insert(0u32, usk.to_unified_full_viewing_key());
                        let d = zcash_client_backend::decrypt_transaction(&Network::TestNetwork, Some(zcash_protocol::consensus::BlockHeight::from(t.height as u32)), None, &tx, &ufvks);
                        println!("DECRYPT sapling={} orchard={} ironwood={}", d.sapling_outputs().len(), d.orchard_outputs().len(), d.ironwood_outputs().len());
                    }
                }
            }
            Err(e) => println!("TX error {e}"),
        }
        use zcash_client_backend::proto::service::BlockId;
        let block = raw.get_block(BlockId { height: 4536826, hash: vec![] }).await.unwrap().into_inner();
        for tx in &block.vtx {
            let mut id = tx.txid.clone(); id.reverse();
            println!("CTX {} sapling_out={} orchard={} ironwood={}", hex::encode(&id), tx.outputs.len(), tx.actions.len(), tx.ironwood_actions.len());
            let m = <Mnemonic<English>>::from_phrase(seed.trim()).unwrap();
            let usk = zcash_keys::keys::UnifiedSpendingKey::from_seed(&Network::TestNetwork, &m.to_seed(""), zip32::AccountId::ZERO).unwrap();
            let fvk = usk.to_unified_full_viewing_key().orchard().cloned().unwrap();
            let ivk = orchard::keys::PreparedIncomingViewingKey::new(&fvk.to_ivk(zip32::Scope::External));
            for (i, a) in tx.ironwood_actions.iter().enumerate() {
                println!("  ACTION {i} cmx={} epk={} ct={} nf={}", a.cmx.len(), a.ephemeral_key.len(), a.ciphertext.len(), a.nullifier.len());
                match orchard::note_encryption::CompactAction::try_from(a) {
                    Err(_) => println!("  ACTION {i} compact parse failed"),
                    Ok(ca) => {
                        let dom = orchard::note_encryption::IronwoodDomain::for_compact_action(&ca);
                        let r = zcash_note_encryption::try_compact_note_decryption(&dom, &ivk, &ca);
                        println!("  ACTION {i} ironwood-compact-decrypt={}", r.is_some());
                        let dom2 = orchard::note_encryption::OrchardDomain::for_compact_action(&ca);
                        let r2 = zcash_note_encryption::try_compact_note_decryption(&dom2, &ivk, &ca);
                        println!("  ACTION {i} orchard-compact-decrypt={}", r2.is_some());
                    }
                }
            }
        }
    }
    let db = MemoryWalletDb::new(Network::TestNetwork, 100);
    let wallet = Wallet::new(db, channel, Network::TestNetwork, ConfirmationsPolicy::default()).unwrap();
    let birthday: u32 = fs::read_to_string(format!("{dir}/birthday.txt")).ok().and_then(|s| s.trim().parse().ok()).unwrap_or_else(|| 0);
    let account = wallet.create_account("probe", &seed, 0, if birthday == 0 { None } else { Some(birthday) }, None).await.expect("account");
    let addr = wallet.current_address(account).await.unwrap();
    println!("ADDRESS {:?}", addr);
    if let Some(text) = &addr {
        if let Some(zcash_keys::address::Address::Unified(ua)) = zcash_keys::address::Address::decode(&Network::TestNetwork, text) {
            println!("RECEIVERS orchard={} sapling={} transparent={}", ua.orchard().is_some(), ua.sapling().is_some(), ua.transparent().is_some());
            if let Some(t) = ua.transparent() {
                use zcash_keys::encoding::AddressCodec;
                println!("TRANSPARENT {}", t.encode(&Network::TestNetwork));
            }
            if let Some(sapling) = ua.sapling() {
                use zcash_keys::encoding::AddressCodec;
                println!("SAPLING {}", sapling.encode(&Network::TestNetwork));
            }
        }
    }
    wallet.sync().await.expect("sync");
    let summary = wallet.get_wallet_summary().await.unwrap();
    println!("SCANNED {:?}", summary.as_ref().map(|s| (s.chain_tip_height(), s.fully_scanned_height())));
    println!("SUMMARY {:?}", summary.as_ref().map(|s| s.account_balances().get(&account).map(|b| (b.total(), b.spendable_value(), b.orchard_balance().total(), b.ironwood_balance().total(), b.sapling_balance().total()))));
    if env::var("SHIELD").is_ok() {
        let txids = wallet.shield_transparent(&seed, 0, account).await.expect("shield");
        println!("SHIELDED {:?}", txids);
    }
    if env::var("ZERO").is_ok() {
        let to = ZcashAddress::from_str(&addr.clone().unwrap()).unwrap();
        let mut m1 = [0u8; 512]; m1[0] = 0xFF; m1[1..14].copy_from_slice(b"zealed-zero-1");
        let mut m2 = [0u8; 512]; m2[0] = 0xFF; m2[1..14].copy_from_slice(b"zealed-zero-2");
        match wallet.send_payments(&seed, 0, account, vec![(to.clone(), 0, Some(m1)), (to, 0, Some(m2))]).await {
            Ok(t) => println!("SENT-ZERO {:?}", t),
            Err(e) => println!("ZERO-FAILED {e}"),
        }
    }
    // SWEEP_TO=<address>: sends everything spendable, less the fee, to that address.
    if let Ok(target) = env::var("SWEEP_TO") {
        let to = ZcashAddress::from_str(&target).unwrap();
        let spendable: u64 = summary
            .as_ref()
            .and_then(|s| s.account_balances().get(&account))
            .map(|b| u64::from(b.spendable_value()))
            .unwrap_or(0);
        let mut sent = false;
        // The fee depends on how many notes are spent; try a few amounts, each a little lower.
        for actions in 2..=12u64 {
            let Some(amount) = spendable.checked_sub(5_000 * actions).filter(|a| *a > 0) else { break };
            match wallet.send_payments(&seed, 0, account, vec![(to.clone(), amount, None)]).await {
                Ok(t) => {
                    println!("SWEPT {amount} {:?}", t);
                    sent = true;
                    break;
                }
                Err(e) => println!("SWEEP-TRY {amount} failed: {e}"),
            }
        }
        if !sent {
            println!("SWEEP-FAILED");
        }
    }
    if env::var("SEND").is_ok() {
        let to = ZcashAddress::from_str(&addr.clone().unwrap()).unwrap();
        let mut m1 = [0u8; 512]; m1[0] = 0xFF; m1[1..14].copy_from_slice(b"zealed-probe1");
        let mut m2 = [0u8; 512]; m2[0] = 0xFF; m2[1..14].copy_from_slice(b"zealed-probe2");
        let txids = wallet.send_payments(&seed, 0, account, vec![(to.clone(), 10_000, Some(m1)), (to, 10_000, Some(m2))]).await.expect("send");
        println!("SENT {:?}", txids);
    }
    wallet.sync().await.expect("sync2");
    for m in wallet.received_notes(account, None).await.expect("notes") {
        println!("NOTE tx={} h={:?} v={} memo={}", m.txid, m.mined_height, m.value, m.memo.is_some());
        if let Some(memo) = m.memo { println!("MEMO tx={} h={:?} v={} {}", m.txid, m.mined_height, m.value, String::from_utf8_lossy(&memo[1..14])); }
    }
}
