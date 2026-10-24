import type { MessageKey } from './en.ts'

/** Spanish. Written for this prototype; a native speaker should review it before real use. */
export const es: Record<MessageKey, string> = {
  'lang.name': 'Español',
  'shell.skip': 'Saltar al contenido',
  'shell.demo': 'Modo demostración',
  'shell.nav': 'Principal',
  'nav.dashboard': 'Panel',
  'nav.contacts': 'Contactos',
  'nav.receive': 'Recibir',
  'nav.settings': 'Ajustes',

  'home.intro':
    'Dinero y mensajes privados para los momentos que importan, construido sobre los pagos protegidos de Zcash. Todo se ejecuta en tu navegador.',
  'home.testnet': 'Solo red de pruebas. Aquí no se usa dinero real.',
  'home.dashboard': 'Tu panel',
  'feature.legacy':
    'Sella una carta y fondos para alguien, que se abre en una fecha o si te quedas en silencio.',
  'feature.blindPot':
    'Un bote de regalo compartido. El anfitrión ve el total, nunca quién dio qué.',
  'feature.unsigned': 'Una línea de contacto anónima. Envía un mensaje, con dinero si quieres.',

  'settings.title': 'Ajustes',
  'settings.appearance': 'Apariencia',
  'settings.theme.system': 'Igual que mi dispositivo',
  'settings.theme.light': 'Claro',
  'settings.theme.dark': 'Oscuro',
  'settings.language': 'Idioma',
  'settings.language.system': 'Igual que mi dispositivo',
  'settings.language.note':
    'Algunas pantallas siguen solo en inglés. Los nombres de las funciones son los mismos en todos los idiomas.',
  'settings.demo': 'Modo demostración',
  'settings.demo.label':
    'Acorta los temporizadores (fechas de apertura, periodos de aviso) para probar una función en minutos.',
  'settings.demo.note':
    'Solo para demostraciones. Los temporizadores cortos no sirven para uso real.',
  'settings.about': 'Acerca de',
  'settings.about.network':
    'Red: {network}. Zealed es un prototipo de red de pruebas y no maneja dinero real.',
  'settings.about.gallery': 'Galería de componentes',

  'lock.title': 'Bloqueado',
  'lock.intro':
    'Escribe tu frase de acceso para abrir tus datos. Se guardan en este dispositivo, cifrados, y en ningún otro sitio.',
  'lock.passphrase': 'Frase de acceso',
  'lock.unlock': 'Desbloquear',
  'lock.tooMany': 'Demasiados intentos fallidos.',
  'lock.wait': '{error} Inténtalo de nuevo en {seconds} segundos.',
  'lock.wrong': 'Esa frase de acceso no es correcta.',
  'lock.cannotOpen': 'No se pudieron abrir tus datos guardados. No se mostró nada.',
  'lock.forgot': '¿Olvidaste tu frase de acceso?',
  'lock.forgotBody':
    'No hay forma de recuperarla y nadie puede restablecerla por ti: eso es lo que mantiene tus datos privados. La única salida es borrar este dispositivo y empezar de nuevo. Los fondos de la cartera solo se podrán recuperar con tu frase semilla.',

  'notSaved.text':
    'Todavía no se guarda nada en este dispositivo, así que al recargar se borra todo.',
  'notSaved.choose': 'Elige una frase de acceso para conservar tus datos, cifrados.',
  'notSaved.unavailable': 'Este navegador no puede guardar datos de forma segura aquí.',

  'contacts.title': 'Contactos',
  'contacts.intro':
    'Nombres para las direcciones que usas, para elegir a una persona en lugar de pegar una dirección larga. Se quedan en este dispositivo.',
  'contacts.addTitle': 'Añadir un contacto',
  'contacts.name': 'Nombre',
  'contacts.address': 'Dirección',
  'contacts.addressHint': 'Escríbela, pégala o escanea un código QR o un enlace de contacto.',
  'contacts.save': 'Guardar contacto',
  'contacts.saved': 'Se guardó {name}.',
  'contacts.linkNote': 'Alguien también puede enviarte un enlace de contacto desde su página',
  'contacts.linkNote2': '. Al abrirlo se añade aquí después de que confirmes.',
  'contacts.listTitle': 'Tus contactos',
  'contacts.emptyTitle': 'Aún no hay contactos',
  'contacts.empty': 'Añade a alguien arriba, o abre un enlace de contacto que te envíe.',
  'contacts.rename': 'Renombrar',
  'contacts.renameLabel': 'Renombrar a {name}',
  'contacts.newName': 'Nuevo nombre para {name}',
  'contacts.saveName': 'Guardar nombre',
  'contacts.cancel': 'Cancelar',
  'contacts.remove': 'Quitar',
  'contacts.removeLabel': 'Quitar a {name}',
  'contacts.removeTitle': '¿Quitar a {name}?',
  'contacts.removeBody':
    'Solo se quita de esta lista. Las cartas y pagos ya enviados no se ven afectados.',
  'contacts.badName': 'Ese nombre no se puede usar.',

  'add.title': 'Añadir un contacto',
  'add.badTitle': 'Este enlace no parece correcto',
  'add.badBody': 'Pide de nuevo el enlace de contacto y comprueba que se copió completo.',
  'add.goContacts': 'Ir a contactos',
  'add.already': 'Esta dirección ya está guardada como {name}.',
  'add.intro':
    'Alguien te envió un enlace para añadirlo. Comprueba que viene de quien esperas: cualquiera puede crear uno.',
  'add.nameHint': 'Se rellenó el nombre que sugiere. Cámbialo si quieres.',
  'add.cannotSave': 'No se pudo guardar.',

  'receive.title': 'Recibir',
  'receive.intro':
    'Tu dirección, para dársela a quien quiera enviarte dinero, una carta o un mensaje.',
  'receive.noWalletTitle': 'Aún no hay cartera',
  'receive.noWallet':
    'La cartera aún se está construyendo, así que todavía no hay dirección que mostrar.',
  'receive.failed': 'No se pudo leer tu dirección.',
  'receive.yourAddress': 'Tu dirección',
  'receive.freshAddress': 'Una dirección nueva',
  'receive.qr': 'Código QR de tu dirección',
  'receive.copy': 'Copiar dirección',
  'receive.copied': 'Dirección copiada.',
  'receive.new': 'Crear una dirección nueva',
  'receive.newFailed': 'No se pudo crear una dirección nueva. Inténtalo de nuevo.',
  'receive.newNote':
    'Dar a cada persona una dirección distinta evita que se relacionen entre sí. Usa «Crear una dirección nueva» antes de compartirla con alguien nuevo.',
  'receive.copyFailed': 'No se pudo copiar. Selecciona el texto y cópialo a mano.',
  'receive.linkTitle': 'Un enlace de contacto',
  'receive.linkIntro':
    'Envía este enlace a alguien para que te añada como contacto, guardián o heredero sin escribir tu dirección. La dirección va en la parte del enlace que nunca se envía a ningún servidor.',
  'receive.yourName': 'Tu nombre (opcional)',
  'receive.yourNameHint': 'Se sugiere a quien lo abra. Puede cambiarlo.',
  'receive.linkLabel': 'Enlace de contacto',
  'receive.copyLink': 'Copiar enlace',
  'receive.linkCopied': 'Enlace copiado.',

  'invite.title': 'Invitación de guardián',
  'invite.badTitle': 'Esta invitación no parece correcta',
  'invite.badBody': 'Pide de nuevo la invitación y comprueba que el enlace se copió completo.',
  'invite.from': '{owner} te pide que seas guardián.',
  'invite.fromAnon': 'Alguien te pide que seas guardián.',
  'invite.check':
    'Cualquiera puede crear una invitación. Acepta solo si sabes quién la envió y has hablado con esa persona.',
  'invite.whatTitle': 'Qué hace un guardián',
  'invite.what1':
    'Guardas un trozo de una clave. Por sí solo no abre nada y no puedes leer su carta.',
  'invite.what2':
    'Si deja de avisar que está bien, recibes una alerta. Cuando abras Zealed, puede entregar tu trozo a su heredero.',
  'invite.what3': 'Si vuelve, no se entrega nada. Nunca ves el dinero ni la carta.',
  'invite.what4':
    'Necesitas abrir Zealed de vez en cuando. Un guardián que nunca se conecta no puede ayudar.',
  'invite.replyTitle': 'Envía tu dirección de vuelta',
  'invite.replyIntro':
    'Zealed crea un enlace con tu dirección. Envíaselo. Usa una dirección nueva hecha solo para esta persona.',
  'invite.yourName': 'Tu nombre (opcional)',
  'invite.yourNameHint': 'Se le muestra como nombre de contacto sugerido.',
  'invite.noWallet':
    'La cartera aún se está construyendo, así que todavía no hay dirección que enviar. Puedes volver a esta página más tarde.',
  'invite.newAddress': 'Usar una dirección nueva para esto',
  'invite.replyLabel': 'Enlace de respuesta',
  'invite.copyReply': 'Copiar enlace de respuesta',
  'invite.replyCopied': 'Enlace de respuesta copiado.',
  'invite.qr': 'Código QR de tu enlace de respuesta',
  'invite.failed': 'No se pudo leer tu dirección.',

  'inviteMaker.title': 'Invitar a un guardián',
  'inviteMaker.intro':
    '¿No tienes la dirección de un guardián? Envíale una invitación. Le explica el papel y le permite devolverte su dirección, lista para pegar en el campo de arriba.',
  'inviteMaker.yourName': 'Tu nombre (opcional)',
  'inviteMaker.yourNameHint': 'El guardián lo ve en la invitación.',
  'inviteMaker.linkLabel': 'Enlace de invitación',
  'inviteMaker.copy': 'Copiar invitación',
  'inviteMaker.copied': 'Invitación copiada.',
  'inviteMaker.note':
    'La invitación solo contiene tu nombre. Nada sobre tu carta, tu heredero ni dinero.',

  'nav.wallet': 'Cartera',
  'wallet.title': 'Cartera',
  'wallet.intro':
    'Tu cartera de Zcash en la red de pruebas. Funciona en este navegador y sus claves nunca salen de este dispositivo.',
  'wallet.needVault':
    'Las claves de la cartera se guardan cifradas en este dispositivo, así que primero elige una frase de acceso.',
  'wallet.needVaultLink': 'Elegir una frase de acceso',
  'wallet.createTitle': 'Crear una cartera',
  'wallet.createBody':
    'Crea una cartera nueva con una frase de recuperación de 24 palabras. Quien tenga la frase puede llevarse el dinero, y sin ella no se puede recuperar un dispositivo perdido.',
  'wallet.create': 'Crear una cartera nueva',
  'wallet.restoreTitle': 'Restaurar una cartera',
  'wallet.restoreBody':
    'Escribe las 24 palabras de una cartera de la red de pruebas que ya tengas.',
  'wallet.phrase': 'Frase de recuperación',
  'wallet.birthday': 'Bloque inicial (opcional)',
  'wallet.birthdayHint':
    'El bloque en que se creó la cartera. Uno posterior acelera mucho la primera sincronización. Déjalo vacío si no estás seguro.',
  'wallet.restore': 'Restaurar esta cartera',
  'wallet.badPhrase': 'Una frase de recuperación tiene exactamente 24 palabras.',
  'wallet.badBirthday': 'El bloque inicial debe ser un número entero.',
  'wallet.writeTitle': 'Apunta tu frase de recuperación',
  'wallet.writeBody':
    'Escribe estas 24 palabras en papel, en orden, y mantenlas en privado. Son la única forma de recuperar la cartera y no se vuelven a mostrar hasta que confirmes tu frase de acceso en Ajustes.',
  'wallet.written': 'He apuntado las 24 palabras',
  'wallet.continue': 'Crear la cartera',
  'wallet.cancel': 'Cancelar',
  'wallet.loading':
    'Preparando la cartera. La primera vez se descarga el código de pruebas criptográficas, unos 55 MB.',
  'wallet.failed': 'No se pudo abrir la cartera. Revisa tu conexión e inténtalo de nuevo.',
  'wallet.retry': 'Intentar de nuevo',
  'wallet.remove': 'Quitar esta cartera del dispositivo',
  'wallet.balance': 'Saldo',
  'wallet.spendable': 'Disponible',
  'wallet.pending': 'Esperando confirmaciones',
  'wallet.syncing': 'Poniéndose al día con la red…',
  'wallet.syncedAt': 'Al día. Última comprobación: {time}.',
  'wallet.syncFailed': 'La cartera no pudo conectarse a la red. Seguirá intentándolo.',
  'wallet.syncNow': 'Comprobar ahora',
  'wallet.fundTitle': 'Conseguir dinero de prueba',
  'wallet.fundBody':
    'Esta es una cartera de la red de pruebas. Envía ZEC de prueba (TAZ) desde un grifo de la red de pruebas a la dirección de la página Recibir. El dinero de prueba no tiene valor.',
  'wallet.receiveLink': 'Abrir Recibir',
  'wallet.backupLink': 'Respalda tu frase de recuperación en Ajustes',
  'wallet.details': 'Detalles técnicos',
}
