import type { MessageKey } from './en.ts'

/** French. Written for this prototype; a native speaker should review it before real use. */
export const fr: Record<MessageKey, string> = {
  'lang.name': 'Français',
  'shell.skip': 'Aller au contenu',
  'shell.demo': 'Mode démo',
  'shell.nav': 'Principale',
  'nav.dashboard': 'Tableau de bord',
  'nav.contacts': 'Contacts',
  'nav.receive': 'Recevoir',
  'nav.settings': 'Réglages',

  'home.intro':
    'De l’argent et des messages privés pour les moments qui comptent, construits sur les paiements protégés de Zcash. Tout s’exécute dans votre navigateur.',
  'home.testnet': 'Réseau de test uniquement. Aucun argent réel n’est utilisé ici.',
  'home.dashboard': 'Votre tableau de bord',
  'feature.legacy':
    'Scellez une lettre et des fonds pour quelqu’un, ouverts à une date ou si vous restez silencieux.',
  'feature.blindPot':
    'Une cagnotte de cadeaux partagée. L’hôte voit le total, jamais qui a donné quoi.',
  'feature.unsigned':
    'Une ligne de contact anonyme. Envoyez un message, avec de l’argent si vous le souhaitez.',

  'settings.title': 'Réglages',
  'settings.appearance': 'Apparence',
  'settings.theme.system': 'Comme mon appareil',
  'settings.theme.light': 'Clair',
  'settings.theme.dark': 'Sombre',
  'settings.language': 'Langue',
  'settings.language.system': 'Comme mon appareil',
  'settings.language.note':
    'Certains écrans sont encore uniquement en anglais. Les noms des fonctions restent les mêmes dans toutes les langues.',
  'settings.demo': 'Mode démo',
  'settings.demo.label':
    'Raccourcit les minuteurs (dates d’ouverture, périodes de signe de vie) pour essayer une fonction en quelques minutes.',
  'settings.demo.note':
    'Uniquement pour les démonstrations. Les minuteurs raccourcis ne conviennent pas à un usage réel.',
  'settings.about': 'À propos',
  'settings.about.network':
    'Réseau : {network}. Zealed est un prototype sur réseau de test et ne manipule pas d’argent réel.',
  'settings.about.gallery': 'Galerie de composants',

  'lock.title': 'Verrouillé',
  'lock.intro':
    'Saisissez votre phrase secrète pour ouvrir vos données. Elles sont enregistrées sur cet appareil, chiffrées, et nulle part ailleurs.',
  'lock.passphrase': 'Phrase secrète',
  'lock.unlock': 'Déverrouiller',
  'lock.tooMany': 'Trop de tentatives incorrectes.',
  'lock.wait': '{error} Réessayez dans {seconds} secondes.',
  'lock.wrong': 'Cette phrase secrète n’est pas la bonne.',
  'lock.cannotOpen': 'Vos données enregistrées n’ont pas pu être ouvertes. Rien n’a été affiché.',
  'lock.forgot': 'Phrase secrète oubliée ?',
  'lock.forgotBody':
    'Il n’y a aucun moyen de la récupérer et personne ne peut la réinitialiser pour vous : c’est ce qui garde vos données privées. La seule issue est d’effacer cet appareil et de recommencer. Les fonds du portefeuille ne pourront alors être récupérés qu’avec votre phrase de récupération.',

  'notSaved.text': 'Rien n’est encore enregistré sur cet appareil : recharger la page efface tout.',
  'notSaved.choose': 'Choisissez une phrase secrète pour conserver vos données, chiffrées.',
  'notSaved.unavailable': 'Ce navigateur ne peut pas stocker de données en sécurité ici.',

  'contacts.title': 'Contacts',
  'contacts.intro':
    'Des noms pour les adresses que vous utilisez, afin de choisir une personne plutôt que de coller une longue adresse. Ils restent sur cet appareil.',
  'contacts.addTitle': 'Ajouter un contact',
  'contacts.name': 'Nom',
  'contacts.address': 'Adresse',
  'contacts.addressHint': 'Saisissez-la, collez-la, ou scannez un code QR ou un lien de contact.',
  'contacts.save': 'Enregistrer le contact',
  'contacts.saved': '{name} a été enregistré.',
  'contacts.linkNote': 'Quelqu’un peut aussi vous envoyer un lien de contact depuis sa page',
  'contacts.linkNote2': '. Son ouverture l’ajoute ici après votre confirmation.',
  'contacts.listTitle': 'Vos contacts',
  'contacts.emptyTitle': 'Aucun contact pour l’instant',
  'contacts.empty': 'Ajoutez quelqu’un ci-dessus, ou ouvrez un lien de contact qu’on vous envoie.',
  'contacts.rename': 'Renommer',
  'contacts.renameLabel': 'Renommer {name}',
  'contacts.newName': 'Nouveau nom pour {name}',
  'contacts.saveName': 'Enregistrer le nom',
  'contacts.cancel': 'Annuler',
  'contacts.remove': 'Retirer',
  'contacts.removeLabel': 'Retirer {name}',
  'contacts.removeTitle': 'Retirer {name} ?',
  'contacts.removeBody':
    'Il n’est retiré que de cette liste. Les lettres et paiements déjà envoyés ne sont pas affectés.',
  'contacts.badName': 'Ce nom ne peut pas être utilisé.',

  'add.title': 'Ajouter un contact',
  'add.badTitle': 'Ce lien semble incorrect',
  'add.badBody': 'Redemandez le lien de contact et vérifiez que le lien entier a été copié.',
  'add.goContacts': 'Aller aux contacts',
  'add.already': 'Cette adresse est déjà enregistrée sous le nom {name}.',
  'add.intro':
    'Quelqu’un vous a envoyé un lien pour l’ajouter. Vérifiez qu’il vient bien de la personne attendue : n’importe qui peut en créer un.',
  'add.nameHint': 'Le nom suggéré est déjà rempli. Modifiez-le si vous le souhaitez.',
  'add.cannotSave': 'Impossible d’enregistrer.',

  'receive.title': 'Recevoir',
  'receive.intro':
    'Votre adresse, à donner à quelqu’un qui veut vous envoyer de l’argent, une lettre ou un message.',
  'receive.noWalletTitle': 'Pas encore de portefeuille',
  'receive.noWallet':
    'Le portefeuille est encore en construction, il n’y a donc pas encore d’adresse à afficher.',
  'receive.failed': 'Votre adresse n’a pas pu être lue.',
  'receive.yourAddress': 'Votre adresse',
  'receive.freshAddress': 'Une nouvelle adresse',
  'receive.qr': 'Code QR de votre adresse',
  'receive.copy': 'Copier l’adresse',
  'receive.copied': 'Adresse copiée.',
  'receive.new': 'Créer une nouvelle adresse',
  'receive.newFailed': 'Impossible de créer une nouvelle adresse. Réessayez.',
  'receive.newNote':
    'Donner une adresse différente à chaque personne évite qu’on les relie entre elles. Utilisez « Créer une nouvelle adresse » avant de partager avec quelqu’un de nouveau.',
  'receive.copyFailed': 'Copie impossible. Sélectionnez le texte et copiez-le à la main.',
  'receive.linkTitle': 'Un lien de contact',
  'receive.linkIntro':
    'Envoyez ce lien à quelqu’un pour qu’il vous ajoute comme contact, gardien ou héritier sans saisir votre adresse. L’adresse se trouve dans la partie du lien qui n’est jamais envoyée à un serveur.',
  'receive.yourName': 'Votre nom (facultatif)',
  'receive.yourNameHint': 'Suggéré à la personne qui l’ouvre. Elle peut le modifier.',
  'receive.linkLabel': 'Lien de contact',
  'receive.copyLink': 'Copier le lien',
  'receive.linkCopied': 'Lien copié.',

  'invite.title': 'Invitation de gardien',
  'invite.badTitle': 'Cette invitation semble incorrecte',
  'invite.badBody': 'Redemandez l’invitation et vérifiez que le lien entier a été copié.',
  'invite.from': '{owner} vous demande d’être gardien.',
  'invite.fromAnon': 'Quelqu’un vous demande d’être gardien.',
  'invite.check':
    'N’importe qui peut créer une invitation. N’acceptez que si vous savez qui l’a envoyée et lui avez parlé.',
  'invite.whatTitle': 'Ce que fait un gardien',
  'invite.what1':
    'Vous détenez un morceau de clé. Seul, il n’ouvre rien et vous ne pouvez pas lire sa lettre.',
  'invite.what2':
    'S’il cesse de donner signe de vie, vous êtes alerté. Quand vous ouvrez Zealed, votre morceau peut être remis à son héritier.',
  'invite.what3': 'S’il revient, rien n’est remis. Vous ne voyez jamais l’argent ni la lettre.',
  'invite.what4':
    'Vous devez ouvrir Zealed de temps en temps. Un gardien qui n’est jamais en ligne ne peut pas aider.',
  'invite.replyTitle': 'Renvoyez votre adresse',
  'invite.replyIntro':
    'Zealed crée un lien avec votre adresse. Envoyez-le-lui. Utilisez une nouvelle adresse créée pour cette seule personne.',
  'invite.yourName': 'Votre nom (facultatif)',
  'invite.yourNameHint': 'Affiché comme nom de contact suggéré.',
  'invite.noWallet':
    'Le portefeuille est encore en construction, il n’y a donc pas encore d’adresse à envoyer. Vous pourrez revenir sur cette page plus tard.',
  'invite.newAddress': 'Utiliser une nouvelle adresse pour cela',
  'invite.replyLabel': 'Lien de réponse',
  'invite.copyReply': 'Copier le lien de réponse',
  'invite.replyCopied': 'Lien de réponse copié.',
  'invite.qr': 'Code QR de votre lien de réponse',
  'invite.failed': 'Votre adresse n’a pas pu être lue.',

  'inviteMaker.title': 'Inviter un gardien',
  'inviteMaker.intro':
    'Vous n’avez pas l’adresse d’un gardien ? Envoyez-lui une invitation. Elle explique le rôle et lui permet de vous renvoyer son adresse, prête à coller dans le champ ci-dessus.',
  'inviteMaker.yourName': 'Votre nom (facultatif)',
  'inviteMaker.yourNameHint': 'Le gardien le voit sur l’invitation.',
  'inviteMaker.linkLabel': 'Lien d’invitation',
  'inviteMaker.copy': 'Copier l’invitation',
  'inviteMaker.copied': 'Invitation copiée.',
  'inviteMaker.note':
    'L’invitation ne contient que votre nom. Rien sur votre lettre, votre héritier ou de l’argent.',

  'nav.wallet': 'Portefeuille',
  'wallet.title': 'Portefeuille',
  'wallet.intro':
    'Votre portefeuille Zcash sur le réseau de test. Il fonctionne dans ce navigateur et ses clés ne quittent jamais cet appareil.',
  'wallet.needVault':
    'Les clés du portefeuille sont conservées chiffrées sur cet appareil : choisissez d’abord une phrase secrète.',
  'wallet.needVaultLink': 'Choisir une phrase secrète',
  'wallet.createTitle': 'Créer un portefeuille',
  'wallet.createBody':
    'Créez un nouveau portefeuille avec une phrase de récupération de 24 mots. Quiconque a la phrase peut prendre l’argent, et sans elle un appareil perdu est irrécupérable.',
  'wallet.create': 'Créer un nouveau portefeuille',
  'wallet.restoreTitle': 'Restaurer un portefeuille',
  'wallet.restoreBody': 'Saisissez les 24 mots d’un portefeuille du réseau de test existant.',
  'wallet.phrase': 'Phrase de récupération',
  'wallet.birthday': 'Bloc de départ (facultatif)',
  'wallet.birthdayHint':
    'Le bloc où le portefeuille a été créé. Un bloc plus récent accélère beaucoup la première synchronisation. Laissez vide en cas de doute.',
  'wallet.restore': 'Restaurer ce portefeuille',
  'wallet.badPhrase': 'Une phrase de récupération compte exactement 24 mots.',
  'wallet.badBirthday': 'Le bloc de départ doit être un nombre entier.',
  'wallet.writeTitle': 'Notez votre phrase de récupération',
  'wallet.writeBody':
    'Écrivez ces 24 mots sur papier, dans l’ordre, et gardez-les privés. C’est le seul moyen de retrouver le portefeuille, et ils ne sont plus affichés tant que vous ne confirmez pas votre phrase secrète dans les Réglages.',
  'wallet.written': 'J’ai noté les 24 mots',
  'wallet.continue': 'Créer le portefeuille',
  'wallet.cancel': 'Annuler',
  'wallet.loading':
    'Préparation du portefeuille. La première fois, le code de preuve est téléchargé : environ 55 Mo.',
  'wallet.failed': 'Le portefeuille n’a pas pu être ouvert. Vérifiez votre connexion et réessayez.',
  'wallet.retry': 'Réessayer',
  'wallet.remove': 'Retirer ce portefeuille de l’appareil',
  'wallet.balance': 'Solde',
  'wallet.spendable': 'Disponible',
  'wallet.pending': 'En attente de confirmations',
  'wallet.syncing': 'Synchronisation avec le réseau…',
  'wallet.syncedAt': 'À jour. Dernière vérification : {time}.',
  'wallet.syncFailed': 'Le portefeuille n’a pas pu joindre le réseau. Il continuera d’essayer.',
  'wallet.syncNow': 'Vérifier maintenant',
  'wallet.fundTitle': 'Obtenir de l’argent de test',
  'wallet.fundBody':
    'Ceci est un portefeuille du réseau de test. Envoyez des ZEC de test (TAZ) depuis un faucet du réseau de test vers l’adresse de la page Recevoir. L’argent de test n’a aucune valeur.',
  'wallet.receiveLink': 'Ouvrir Recevoir',
  'wallet.backupLink': 'Sauvegardez votre phrase de récupération dans les Réglages',
  'wallet.details': 'Détails techniques',
}
