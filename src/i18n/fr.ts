import type { MessageKey } from './en.ts'

/** French. Written for this prototype; a native speaker should review it before real use. */
export const fr: Record<MessageKey, string> = {
  'lang.name': 'Français',
  'shell.skip': 'Aller au contenu',
  'shell.demo': 'Mode démo',
  'shell.nav': 'Principale',
  'shell.menu': 'Menu',
  'shell.lock': 'Verrouiller',
  'shell.noWallet': 'Configurer un portefeuille',
  'shell.walletOpening': 'Ouverture du portefeuille…',
  'shell.syncing': 'Synchronisation…',
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
    'Configurez un portefeuille sur la page Portefeuille pour obtenir votre adresse.',
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
  'receive.share': 'Partager le lien',
  'receive.shareTitle': 'Ajoutez-moi sur Zealed',

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
    'Configurez un portefeuille sur la page Portefeuille pour obtenir une adresse à renvoyer. Cette invitation restera ici.',
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
  'landing.open': 'Ouvrir Zealed',
  'landing.navHow': 'Comment ça marche',
  'landing.navPrivacy': 'Ce qui reste privé',
  'landing.title': 'De l’argent et des messages privés pour les moments qui comptent.',
  'landing.intro':
    'Scellez une lettre qui s’ouvre à une date. Réunissez des cadeaux sans que personne ne voie qui a donné quoi. Recevez des messages de personnes qui restent anonymes. Construit sur les paiements protégés de Zcash, et tout se passe dans votre navigateur.',
  'landing.seePrivacy': 'Voir ce qui reste privé',
  'landing.letterTo': 'Pour Ada',
  'landing.letterBody':
    'Si tu lis ceci, c’est ton anniversaire. La clé de la boîte bleue est sous la troisième marche.',
  'landing.letterSealed': 'Scellée. S’ouvre le 25 décembre 2027, et pas avant.',
  'landing.letterLabel': 'Une lettre en train d’être scellée. Elle s’ouvre le 25 décembre 2027.',
  'landing.featuresTitle': 'Trois choses à faire en privé',
  'landing.legacyBody':
    'Écrivez une lettre, ajoutez de l’argent si vous le souhaitez, et choisissez quand elle s’ouvre : à une date, ou seulement si vous cessez de donner signe de vie. D’ici là, personne ne peut la lire : ni le destinataire, ni vous, ni nous.',
  'landing.legacyDate': 'À une date',
  'landing.legacyDateBody':
    'Verrouillée jusqu’à un moment précis grâce au réseau drand. Elle ne peut pas s’ouvrir plus tôt, même si tout le monde le voulait.',
  'landing.legacySilent': 'Si vous restez silencieux',
  'landing.legacySilentBody':
    'Des amis de confiance détiennent chacun un morceau de la clé. Si vous cessez de donner signe de vie, assez d’entre eux ensemble la remettent à la personne choisie.',
  'landing.legacyCta': 'Sceller une lettre',
  'landing.potBody':
    'Une cagnotte de cadeaux partagée pour un mariage, un anniversaire ou un départ. Les invités donnent en morceaux de taille standard : même l’hôte ne voit que le total et les vœux, jamais qui a donné quoi.',
  'landing.potTotal': 'Total jusqu’ici',
  'landing.potCta': 'Créer une cagnotte',
  'landing.unsignedBody':
    'Une carte de contact à laquelle on peut écrire sans dire qui l’on est. On peut payer pour être entendu, et vous pouvez répondre sans connaître son nom.',
  'landing.unsignedFrom': 'De quelqu’un qui n’a pas signé',
  'landing.unsignedMessage':
    'La livraison est arrivée le 3. Les documents sont dans le dossier bleu.',
  'landing.unsignedPaid': 'A payé 0,05 TAZ',
  'landing.unsignedCta': 'Publier une carte',
  'landing.privacyTitle': 'Qui peut voir quoi',
  'landing.privacyIntro':
    'Les paiements protégés de Zcash cachent l’expéditeur, le destinataire et le montant. Zealed ajoute le reste : tout ce que vous écrivez est chiffré avant de quitter votre appareil.',
  'landing.colWhat': 'Quoi',
  'landing.colYou': 'Vous',
  'landing.colOther': 'L’autre personne',
  'landing.colNetwork': 'Le réseau Zcash',
  'landing.colServer': 'Le serveur du portefeuille',
  'landing.colZealed': 'Zealed',
  'landing.rowText': 'Ce que dit une lettre ou un message',
  'landing.rowGiver': 'Qui a donné à une cagnotte',
  'landing.rowAmount': 'Combien a été envoyé',
  'landing.rowUse': 'Que votre portefeuille est actif, et depuis quelle adresse IP',
  'landing.yes': 'Oui',
  'landing.no': 'Non',
  'landing.afterDate': 'Oui, une fois ouverte',
  'landing.ownGift': 'Seulement son propre cadeau',
  'landing.whatTheyGot': 'Ce qu’il a reçu',
  'landing.privacyNote':
    'Zealed n’a aucun serveur à lui. L’application est un ensemble de fichiers que votre navigateur exécute ; vos données restent sur cet appareil, chiffrées avec votre phrase secrète.',
  'landing.howTitle': 'Pour commencer',
  'landing.step1': 'Choisissez une phrase secrète',
  'landing.step1Body':
    'Tout ce que vous gardez est chiffré avec elle, sur cet appareil uniquement. Personne ne peut la réinitialiser pour vous.',
  'landing.step2': 'Créez un portefeuille',
  'landing.step2Body':
    'Vous recevez 24 mots à noter. C’est le seul moyen de récupérer le portefeuille.',
  'landing.step3': 'Obtenez de l’argent de test',
  'landing.step3Body':
    'Zealed fonctionne sur le réseau de test de Zcash. L’argent de test est gratuit sur un faucet et n’a aucune valeur.',
  'landing.step4': 'Scellez, donnez ou écrivez',
  'landing.step4Body':
    'Chaque fonction explique ce qui sera envoyé et ce que cela coûte avant que quoi que ce soit ne quitte votre portefeuille.',
  'landing.footer':
    'Zealed fonctionne sur le réseau de test de Zcash. Aucun argent réel n’est utilisé ici.',
  'landing.previewTo2': 'Pour Tunde',
  'landing.previewDate': 'S’ouvre le 25 décembre 2027',
  'landing.previewSilent': 'S’ouvre si je cesse de donner signe de vie, avec 3 gardiens sur 5',
  'landing.live': 'En service sur le réseau de test NU7 de Zcash',
  'landing.seeProof': 'Le voir fonctionner sur le réseau de test',
  'landing.navFeatures': 'Fonctions',
  'landing.navProof': 'Preuves',
  'landing.navFaq': 'Questions',
  'landing.proofTitle': 'Sur le vrai réseau de test, pas une maquette',
  'landing.proofIntro':
    'Chaque fonction a été testée de bout en bout sur le réseau de test NU7 de Zcash, entre deux portefeuilles dans deux navigateurs. Voici quelques-unes des transactions. Tout le monde peut les consulter ; seules les personnes concernées peuvent les lire.',
  'landing.proofMemos': 'Deux mémos dans une transaction',
  'landing.proofMemosBody': 'Envoyés depuis le navigateur et relus depuis la chaîne.',
  'landing.proofZero': 'Des messages sans argent joint',
  'landing.proofZeroBody': 'C’est ainsi que voyagent les réponses et les signes de vie.',
  'landing.proofReceived': 'Un paiement venu d’un autre portefeuille',
  'landing.proofReceivedBody': 'Reçu dans le pool Ironwood, puis dépensé.',
  'landing.proofBlock': 'Bloc {height}',
  'landing.proofView': 'Voir dans l’explorateur',
  'landing.legacyGift': 'L’argent voyage avec elle',
  'landing.legacyGiftBody':
    'Ajoutez des ZEC à une lettre. Ils attendent dans un portefeuille que seule la lettre peut ouvrir, et passent au destinataire quand il l’ouvre.',
  'landing.potPoint1': 'Des morceaux de taille standard',
  'landing.potPoint1Body':
    'Chaque cadeau est divisé en montants courants envoyés à des moments différents : aucun paiement ne désigne un invité.',
  'landing.potPoint2': 'Des totaux, pas des registres',
  'landing.potPoint2Body':
    'L’hôte voit le total par lots et les vœux, mélangés. Jamais une liste de qui a donné quoi.',
  'landing.potPoint3': 'Une cagnotte à part',
  'landing.potPoint3Body':
    'Chaque cagnotte est un compte séparé, versé dans le portefeuille de l’hôte à sa clôture.',
  'landing.unsignedPoint1': 'Pas besoin de nom',
  'landing.unsignedPoint1Body':
    'Il suffit d’un portefeuille Zcash pour écrire. Rien ne relie un message à la personne qui l’a envoyé.',
  'landing.unsignedPoint2': 'Payant, donc pas de spam',
  'landing.unsignedPoint2Body':
    'Vous fixez un paiement minimum. Les messages en dessous attendent dans un dossier à part.',
  'landing.unsignedPoint3': 'Prouver sans s’exposer',
  'landing.unsignedPoint3Body':
    'Celui qui écrit peut garder un reçu et prouver plus tard ce qu’il a écrit, sans l’avoir signé.',
  'landing.mockSealedFor': 'Scellée pour vous',
  'landing.mockOpensIn': 'S’ouvre dans 2 jours et 4 heures',
  'landing.mockOpen': 'Ouvrir la lettre',
  'landing.mockGuardians': '3 gardiens sur 5 nécessaires',
  'landing.mockWishes': 'Vœux',
  'landing.mockWish1': 'De longues années heureuses ensemble.',
  'landing.mockWish2': 'Pour la lune de miel, avec amour.',
  'landing.mockStrength': 'Niveau de confidentialité : bon',
  'landing.mockInbox': 'Boîte de réception',
  'landing.mockReply': 'Répondre',
  'landing.mockMinimum': 'Minimum 0,05 TAZ',
  'landing.faqTitle': 'Questions',
  'landing.q1': 'Est-ce de l’argent réel ?',
  'landing.a1':
    'Non. Zealed fonctionne sur le réseau de test de Zcash, où les pièces sont gratuites sur un faucet et n’ont aucune valeur. Le réseau principal viendra quand NU7 y sera activé.',
  'landing.q2': 'Zealed peut-il lire mes lettres ou mes messages ?',
  'landing.a2':
    'Non. Zealed n’a aucun serveur. Tout est chiffré dans votre navigateur avant de quitter votre appareil, et seule la personne destinataire peut le déchiffrer.',
  'landing.q3': 'Et si j’oublie ma phrase secrète ?',
  'landing.a3':
    'Personne ne peut la réinitialiser. Effacez l’appareil et restaurez le portefeuille avec ses 24 mots : l’argent est en sécurité, mais les lettres et contacts gardés sur cet appareil sont perdus.',
  'landing.q4': 'Combien ça coûte ?',
  'landing.a4':
    'Seulement les frais du réseau, en général 0,0001 à 0,0002 TAZ par transaction. Chaque écran les affiche avant l’envoi.',
  'landing.q5': 'Faut-il installer quelque chose ?',
  'landing.a5':
    'Non. Zealed est une application web. Il faut un navigateur récent, et environ 55 Mo de code de portefeuille sont téléchargés la première fois que vous ouvrez un portefeuille.',
  'landing.ctaTitle': 'Scellez votre première lettre en quelques minutes.',
  'landing.ctaBody':
    'Choisissez une phrase secrète, créez un portefeuille, obtenez de l’argent de test gratuit et essayez les trois fonctions.',
}
