/**
 * Every sentence the translated screens show, in English. The other languages must have exactly the
 * same keys and the same {placeholders} (a test checks this). Names of the product's features
 * (Legacy, Blind Pot, Unsigned) and of Zcash are kept as they are in every language.
 */
export const en = {
  'lang.name': 'English',
  'shell.skip': 'Skip to content',
  'shell.demo': 'Demo mode',
  'shell.nav': 'Main',
  'nav.dashboard': 'Dashboard',
  'nav.contacts': 'Contacts',
  'nav.receive': 'Receive',
  'nav.settings': 'Settings',

  'home.intro':
    'Private money and messages for the moments that matter, built on Zcash shielded payments. Everything runs in your browser.',
  'home.testnet': 'Testnet only. Nothing here uses real money.',
  'home.dashboard': 'Your dashboard',
  'feature.legacy': 'Seal a letter and funds for someone, opened on a date or if you go silent.',
  'feature.blindPot': 'A shared gift pot. The host sees the total, never who gave what.',
  'feature.unsigned': 'An anonymous contact line. Send a message, with money if you like.',

  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme.system': 'Match my device',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.language': 'Language',
  'settings.language.system': 'Match my device',
  'settings.language.note':
    'Some screens are still only in English. Names of features stay the same in every language.',
  'settings.demo': 'Demo mode',
  'settings.demo.label':
    'Shorten timers (unlock dates, check-in periods) so a feature can be tried in minutes.',
  'settings.demo.note': 'Only for demonstrations. Shortened timers are not suitable for real use.',
  'settings.about': 'About',
  'settings.about.network':
    'Network: {network}. Zealed is a testnet prototype and does not handle real money.',
  'settings.about.gallery': 'Component gallery',

  'lock.title': 'Locked',
  'lock.intro':
    'Enter your passphrase to open your data. It is saved on this device, encrypted, and nowhere else.',
  'lock.passphrase': 'Passphrase',
  'lock.unlock': 'Unlock',
  'lock.tooMany': 'Too many wrong attempts.',
  'lock.wait': '{error} Try again in {seconds} seconds.',
  'lock.wrong': 'That passphrase is not right.',
  'lock.cannotOpen': 'Your saved data could not be opened. Nothing was shown.',
  'lock.forgot': 'Forgot your passphrase?',
  'lock.forgotBody':
    'There is no way to recover it, and no one can reset it for you: that is what keeps your data private. The only way forward is to wipe this device and start again. Wallet funds can then only be recovered with your seed phrase.',

  'notSaved.text': 'Nothing is saved on this device yet, so reloading clears everything.',
  'notSaved.choose': 'Choose a passphrase to keep your data, encrypted.',
  'notSaved.unavailable': 'This browser cannot store data securely here.',

  'contacts.title': 'Contacts',
  'contacts.intro':
    'Names for the addresses you use, so you can pick a person instead of pasting a long address. They stay on this device.',
  'contacts.addTitle': 'Add a contact',
  'contacts.name': 'Name',
  'contacts.address': 'Address',
  'contacts.addressHint': 'Type it, paste it, or scan a QR code or contact link.',
  'contacts.save': 'Save contact',
  'contacts.saved': '{name} was saved.',
  'contacts.linkNote': 'Someone can also send you a contact link from their',
  'contacts.linkNote2': ' page. Opening it adds them here after you confirm.',
  'contacts.listTitle': 'Your contacts',
  'contacts.emptyTitle': 'No contacts yet',
  'contacts.empty': 'Add someone above, or open a contact link they send you.',
  'contacts.rename': 'Rename',
  'contacts.renameLabel': 'Rename {name}',
  'contacts.newName': 'New name for {name}',
  'contacts.saveName': 'Save name',
  'contacts.cancel': 'Cancel',
  'contacts.remove': 'Remove',
  'contacts.removeLabel': 'Remove {name}',
  'contacts.removeTitle': 'Remove {name}?',
  'contacts.removeBody':
    'They are removed from this list only. Letters and payments already sent are not affected.',
  'contacts.badName': 'That name cannot be used.',

  'add.title': 'Add a contact',
  'add.badTitle': 'This link does not look right',
  'add.badBody': 'Ask for the contact link again, and make sure the whole link was copied.',
  'add.goContacts': 'Go to contacts',
  'add.already': 'This address is already saved as {name}.',
  'add.intro':
    'Someone sent you a link to add them. Check it came from who you expect: anyone can make one.',
  'add.nameHint': 'Their suggested name is filled in. Change it if you like.',
  'add.cannotSave': 'That could not be saved.',

  'receive.title': 'Receive',
  'receive.intro':
    'Your address, to give to someone who wants to send you money, a letter or a message.',
  'receive.noWalletTitle': 'No wallet yet',
  'receive.noWallet': 'The wallet is still being built, so there is no address to show yet.',
  'receive.failed': 'Your address could not be read.',
  'receive.yourAddress': 'Your address',
  'receive.freshAddress': 'A fresh address',
  'receive.qr': 'QR code for your address',
  'receive.copy': 'Copy address',
  'receive.copied': 'Address copied.',
  'receive.new': 'Make a new address',
  'receive.newFailed': 'A new address could not be made. Try again.',
  'receive.newNote':
    'Giving every person a different address keeps them from being linked to each other. Use “Make a new address” before sharing with someone new.',
  'receive.copyFailed': 'Could not copy. Select the text and copy it by hand.',
  'receive.linkTitle': 'A contact link',
  'receive.linkIntro':
    'Send this link to someone so they can add you as a contact, a guardian or an heir without typing your address. The address is in the part of the link that is never sent to any server.',
  'receive.yourName': 'Your name (optional)',
  'receive.yourNameHint': 'Suggested to the person who opens it. They can change it.',
  'receive.linkLabel': 'Contact link',
  'receive.copyLink': 'Copy link',
  'receive.linkCopied': 'Link copied.',

  'invite.title': 'Guardian invitation',
  'invite.badTitle': 'This invitation does not look right',
  'invite.badBody': 'Ask for the invitation again, and make sure the whole link was copied.',
  'invite.from': '{owner} asks you to be a guardian.',
  'invite.fromAnon': 'Someone asks you to be a guardian.',
  'invite.check':
    'Anyone can make an invitation. Only accept if you know who sent it and have talked to them.',
  'invite.whatTitle': 'What a guardian does',
  'invite.what1':
    'You hold one piece of a key. On its own it opens nothing, and you cannot read their letter.',
  'invite.what2':
    'If they stop checking in, you are alerted. When you open Zealed, it can release your piece to their heir.',
  'invite.what3': 'If they come back, nothing is released. You never see money or the letter.',
  'invite.what4':
    'You need to open Zealed now and then. A guardian who is never online cannot help.',
  'invite.replyTitle': 'Send your address back',
  'invite.replyIntro':
    'Zealed makes a link with your address. Send it to them. Use a fresh address made for this one person.',
  'invite.yourName': 'Your name (optional)',
  'invite.yourNameHint': 'Shown to them as a suggested contact name.',
  'invite.noWallet':
    'The wallet is still being built, so there is no address to send yet. You can come back to this page later.',
  'invite.newAddress': 'Use a fresh address for this',
  'invite.replyLabel': 'Reply link',
  'invite.copyReply': 'Copy reply link',
  'invite.replyCopied': 'Reply link copied.',
  'invite.qr': 'QR code for your reply link',
  'invite.failed': 'Your address could not be read.',

  'inviteMaker.title': 'Invite a guardian',
  'inviteMaker.intro':
    'Not sure of a guardian’s address? Send them an invitation. It explains the role and lets them send their address back to you, ready to paste into the field above.',
  'inviteMaker.yourName': 'Your name (optional)',
  'inviteMaker.yourNameHint': 'The guardian sees this on the invitation.',
  'inviteMaker.linkLabel': 'Invitation link',
  'inviteMaker.copy': 'Copy invitation',
  'inviteMaker.copied': 'Invitation copied.',
  'inviteMaker.note':
    'The invitation holds only your name. Nothing about your letter, your heir or any money.',

  'nav.wallet': 'Wallet',
  'wallet.title': 'Wallet',
  'wallet.intro':
    'Your Zcash testnet wallet. It runs in this browser, and its keys never leave this device.',
  'wallet.needVault':
    'The wallet’s keys are kept encrypted on this device, so choose a passphrase first.',
  'wallet.needVaultLink': 'Choose a passphrase',
  'wallet.createTitle': 'Create a wallet',
  'wallet.createBody':
    'Make a new wallet with a 24-word recovery phrase. Anyone with the phrase can take the money, and without it a lost device cannot be recovered.',
  'wallet.create': 'Create a new wallet',
  'wallet.restoreTitle': 'Restore a wallet',
  'wallet.restoreBody': 'Enter the 24 words of an existing testnet wallet.',
  'wallet.phrase': 'Recovery phrase',
  'wallet.birthday': 'Starting block (optional)',
  'wallet.birthdayHint':
    'The block the wallet was made at. A later block makes the first sync much quicker. Leave empty if unsure.',
  'wallet.restore': 'Restore this wallet',
  'wallet.badPhrase': 'A recovery phrase has exactly 24 words.',
  'wallet.badBirthday': 'The starting block must be a whole number.',
  'wallet.writeTitle': 'Write down your recovery phrase',
  'wallet.writeBody':
    'Write these 24 words on paper, in order, and keep them private. They are the only way to get the wallet back, and they are not shown again until you confirm your passphrase in Settings.',
  'wallet.written': 'I have written the 24 words down',
  'wallet.continue': 'Create the wallet',
  'wallet.cancel': 'Cancel',
  'wallet.loading':
    'Preparing the wallet. The first time this downloads the proving code, about 55 MB.',
  'wallet.failed': 'The wallet could not be opened. Check your connection and try again.',
  'wallet.retry': 'Try again',
  'wallet.remove': 'Remove this wallet from the device',
  'wallet.balance': 'Balance',
  'wallet.spendable': 'Spendable',
  'wallet.pending': 'Waiting for confirmations',
  'wallet.syncing': 'Catching up with the network…',
  'wallet.syncedAt': 'Up to date. Last checked {time}.',
  'wallet.syncFailed': 'The wallet could not reach the network. It will keep trying.',
  'wallet.syncNow': 'Check now',
  'wallet.fundTitle': 'Get test money',
  'wallet.fundBody':
    'This is a testnet wallet. Send test ZEC (TAZ) from a testnet faucet to the address on the Receive page. Test money has no value.',
  'wallet.receiveLink': 'Open Receive',
  'wallet.backupLink': 'Back up your recovery phrase in Settings',
  'wallet.details': 'Technical details',
} as const

export type MessageKey = keyof typeof en
