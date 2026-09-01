export const FOREGROUND_ONLY_MESSAGE =
  "Sur iPhone, la navigation fonctionne au premier plan. Elle continue sur CarPlay si un écran véhicule est connecté.";

export const HIDDEN_WITHOUT_CARPLAY_MESSAGE =
  "La navigation nécessite que l’application reste ouverte au premier plan.";

export const CARPLAY_ACTIVE_MESSAGE = "Navigation active sur CarPlay.";

/** FR-042 — the rider tapped away from the follow camera. */
export const FOLLOW_SUSPENDED_MESSAGE = "Suivi automatique en pause";

export const RECENTER_LABEL = "Recentrer sur ma position";

/** FR-044 — the voice is gone, the earcons still mark every maneuver. */
export const VOICE_UNAVAILABLE_LABEL =
  "Guidage vocal indisponible — sons de manœuvre actifs";

export const STOP_NAVIGATION_LABEL = "Terminer la navigation";

export const STOP_NAVIGATION_CONFIRM = "Terminer la navigation ?";

/** FR-042 — asking for a new ride while a session is running. */
export const NAVIGATION_ACTIVE_BLOCK_TITLE = "Une navigation est en cours";

export const NAVIGATION_ACTIVE_BLOCK_MESSAGE =
  "Terminez la navigation active avant de générer un nouveau trajet.";

/**
 * FR-025 — phrase d'essai de la voix dans Réglages. Elle est façonnée comme une
 * vraie sortie de `formatFrenchInstruction` (un nombre, une liaison, un numéro de
 * route) : c'est ce qui révèle une voix peu intelligible sous un casque. Le clic
 * sur Essayer est aussi le geste utilisateur qui accorde `speechSynthesis` sur iOS.
 */
export const VOICE_PREVIEW_SENTENCE =
  "Au rond-point, prenez la deuxième sortie, puis tournez à droite sur la route 112.";

/** FR-044 — l'appareil n'a aucune synthèse; les sons de manœuvre prennent le relais. */
export const VOICE_UNAVAILABLE_SETTINGS_NOTE =
  "Ce navigateur n’offre pas de synthèse vocale. La navigation visuelle et les sons de manœuvre restent actifs.";
