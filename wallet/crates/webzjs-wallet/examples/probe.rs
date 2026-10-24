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
    let db = MemoryWalletDb::new(Network::TestNetwork, 100);
    let wallet = Wallet::new(db, channel, Network::TestNetwork, ConfirmationsPolicy::default()).unwrap();
    let birthday: u32 = fs::read_to_string(format!("{dir}/birthday.txt")).ok().and_then(|s| s.trim().parse().ok()).unwrap_or_else(|| 0);
    let account = wallet.create_account("probe", &seed, 0, if birthday == 0 { None } else { Some(birthday) }, None).await.expect("account");
    let addr = wallet.current_address(account).await.unwrap();
    println!("ADDRESS {:?}", addr);
    wallet.sync().await.expect("sync");
    let summary = wallet.get_wallet_summary().await.unwrap();
    println!("SUMMARY {:?}", summary.as_ref().map(|s| s.account_balances().get(&account).map(|b| (b.total(), b.spendable_value()))));
    if env::var("SEND").is_ok() {
        let to = ZcashAddress::from_str(&addr.clone().unwrap()).unwrap();
        let mut m1 = [0u8; 512]; m1[0] = 0xFF; m1[1..14].copy_from_slice(b"zealed-probe1");
        let mut m2 = [0u8; 512]; m2[0] = 0xFF; m2[1..14].copy_from_slice(b"zealed-probe2");
        let txids = wallet.send_payments(&seed, 0, account, vec![(to.clone(), 10_000, Some(m1)), (to, 10_000, Some(m2))]).await.expect("send");
        println!("SENT {:?}", txids);
    }
    wallet.sync().await.expect("sync2");
    for m in wallet.received_notes(account, None).await {
        if let Some(memo) = m.memo { println!("MEMO tx={} h={:?} v={} {}", m.txid, m.mined_height, m.value, String::from_utf8_lossy(&memo[1..14])); }
    }
}
