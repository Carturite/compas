import type { AdviceKey } from '../core/advice.js';
import type { ProfileId, StateKind } from '../core/types.js';

/** All interface text lives here: short, calm, kind. */
export const S = {
  appName: 'compaz',
  donate: 'Apoyar',
  settings: 'Ajustes',

  setup: {
    question: '¿Cuánto tiempo quieres dedicar hoy?',
    hint: 'Puedes cambiarlo cuando quieras.',
  },

  state: {
    idle: 'En pausa',
    focus: 'Enfocado',
    break: 'Recreo',
    waiting: 'Un momento',
  } satisfies Record<StateKind, string>,

  idle: {
    start: (min: number) => `Empezar ${min} min`,
    progress: (done: number, goal: number) => `Hoy: ${done} de ${goal} min`,
    goalReached: 'Meta de hoy cumplida. Lo que sigue es extra.',
    reminder: '¿Retomamos cuando quieras?',
  },

  focus: {
    left: 'para tu recreo',
    leave: 'Necesito salir',
  },

  leaving: {
    title: '¿Lo dejamos por ahora?',
    postpone: (min: number) => `Posponer ${min} min`,
    cancel: 'Terminar sesión',
    stay: 'Sigo un poco más',
    strictNote: (min: number) => `Modo estricto: habrá una espera de ${min} min.`,
  },

  advice: {
    'leaving.early': 'Empezar cuesta. Respira, toma agua y dale cinco minutos más; si sigue pesado, posponer está bien.',
    'leaving.late': 'Te queda poquito. Si puedes cerrar este bloque, tu recreo llega enseguida.',
    'leaving.tired': 'Hoy viene difícil, y está bien. Quizás un descanso real o una sesión más corta te haga mejor.',
    'leaving.default': 'Si algo te está costando, levántate un minuto y vuelve. Si necesitas parar, para.',
  } satisfies Record<AdviceKey, string>,

  break: {
    title: 'Te lo ganaste',
    piece: 'Y un personaje nuevo para tu escena.',
    left: 'de recreo',
    back: 'Volver a enfocarme',
  },

  waiting: {
    title: 'Respira un momento',
    body: 'Los sitios se liberan cuando termine el reloj.',
    escape: 'Puedes apagar el modo estricto en ajustes cuando quieras.',
  },

  blocked: {
    title: 'Esto puede esperar',
    focusBody: 'Estás en una sesión de concentración. Vuelve a lo tuyo, ya casi.',
    waitingBody: 'Estás en la espera del modo estricto.',
    remaining: 'restantes',
  },

  suggestion: {
    lower: (p: string) => `¿Probamos sesiones ${p}? A veces más corto rinde más.`,
    higher: (p: string) => `Vas muy bien. ¿Quieres probar sesiones ${p}?`,
    accept: 'Probar',
  },

  profiles: {
    gentle: { name: 'Suave', detail: '25 min + 5 de recreo', adjective: 'suaves' },
    medium: { name: 'Media', detail: '50 min + 10 de recreo', adjective: 'medias' },
    deep: { name: 'Profunda', detail: '90 min + 20 de recreo', adjective: 'profundas' },
  } satisfies Record<ProfileId, { name: string; detail: string; adjective: string }>,

  options: {
    title: 'Ajustes',
    daily: 'Tiempo para hoy y los próximos días',
    minutes: 'minutos',
    profile: 'Tipo de sesión',
    sites: 'Sitios que se bloquean',
    sitesHint: 'Uno por línea. Ej: youtube.com',
    strict: 'Modo estricto',
    strictHint: 'Al terminar antes, pide una espera antes de liberar los sitios. Puedes apagarlo cuando quieras.',
    wait: 'Minutos de espera',
    sync: 'Sincronizar entre tus equipos',
    syncHint:
      'Tus personajes, tu historial y tus ajustes viajan con la cuenta de tu navegador a tus otros equipos. Gratis y sin pasar por servidores de compaz. Funciona si tienes activada la sincronización del navegador.',
    save: 'Guardar',
    saved: 'Guardado',
    permissionDenied: 'Sin permiso para algunos sitios; no se bloquearán.',
  },

  pieces: {
    title: 'Tus escenas',
    /** How many different characters of all casts you have. */
    summary: (have: number, total: number, inTray: number) =>
      `Tienes ${have} de ${total} personajes${inTray > 0 ? ` · ${inTray} en la bandeja` : ''}.`,
    next: (left: number) => `Te ${left === 1 ? 'falta 1 personaje' : `faltan ${left} personajes`} para abrir un fondo nuevo.`,
    /** Small corner note in the popup. */
    nextShort: (left: number) => `Fondo nuevo en ${left}`,
    opened: (scene: string) => `¡Se abrió un fondo nuevo: ${scene}! Elígelo en ajustes.`,
    background: 'Fondo:',
    none: 'Cada sesión completa te regala un personaje para la escena de fondo.',
    edit: 'Acomodar personajes',
    hint: 'Elige un personaje de la bandeja o de la escena.',
    hintSelected: 'Toca dónde ponerlo. R para voltearlo, Esc para soltar.',
    rotate: 'Voltear',
    toTray: 'A la bandeja',
    save: 'Guardar',
    cancel: 'Cancelar',
    unsaved: 'Tienes cambios sin guardar.',
    tray: 'Bandeja',
    trayEmpty: 'Todos están en alguna escena.',
    noFit: 'Ahí no cabe. Prueba otro lugar.',
    boardLabel:
      'Escena. Flechas para moverte, F para cambiar de lugar (suelo, tarimas, bancos, trapecios), Enter para tomar o dejar un personaje, R para voltearlo, Supr para mandarlo a la bandeja, Esc para soltar.',
  },

  dev: {
    complete: 'Completar sesión (dev)',
  },

  notify: {
    focusDone: 'Sesión completa. Disfruta tu recreo.',
    breakDone: 'Terminó el recreo. ¿Otra sesión?',
    reminder: '¿Retomamos? Un clic y seguimos.',
  },
} as const;
