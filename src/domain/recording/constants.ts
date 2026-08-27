/**
 * FR-041 — filtrage des relevés GPS d'un parcours enregistré.
 *
 * Ces constantes sont la seule source des seuils de filtrage. Elles vivent
 * dans le domaine pour rester testables et indépendantes du fournisseur de
 * localisation (BR-004).
 */

/**
 * Précision horizontale maximale acceptée pendant l'enregistrement. Au-delà,
 * le relevé est ignoré : un point à ±120 m déforme la trace et la distance.
 */
export const RECORDING_MAX_ACCURACY_M = 50;

/**
 * Premier point : seuil plus strict. Les premiers relevés d'une puce GPS qui
 * vient de démarrer sont souvent une position réseau très imprécise, et le
 * premier point fixe le départ de toute la trace.
 */
export const RECORDING_FIRST_FIX_MAX_ACCURACY_M = 30;

/**
 * Déplacement minimal entre deux points conservés. Sous ce seuil, le relevé
 * est du bruit d'immobilité : il gonfle le fichier et la distance sans rien
 * ajouter. Le filtre est purement métrique, donc un vrai changement de
 * direction — qui déplace toujours la moto de plus de 5 m — est conservé.
 */
export const RECORDING_MIN_MOVE_M = 5;

/**
 * Vitesse implicite maximale entre deux points conservés (m/s), soit environ
 * 270 km/h. Au-delà, le saut est un artefact GPS (réflexion urbaine, reprise
 * après tunnel), pas un déplacement réel.
 */
export const RECORDING_MAX_SPEED_MPS = 75;

/**
 * Un saut isolé est rejeté, mais une position réellement décalée persiste.
 * Après ce nombre de rejets consécutifs, le relevé est accepté et la trace se
 * resynchronise : le parcours ne doit jamais se figer en silence.
 */
export const RECORDING_JUMP_RESYNC_FIXES = 3;

/** Un GPX exportable a besoin d'au moins un segment, donc deux points. */
export const RECORDING_MIN_EXPORT_POINTS = 2;

/**
 * Latitude/longitude exactement nulles : « Null Island », signature classique
 * d'un relevé vide plutôt qu'une position réelle.
 */
export const RECORDING_NULL_ISLAND_EPSILON = 1e-9;
