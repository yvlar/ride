/** FR-041 — libellés de l'enregistrement de parcours. Aucun message technique brut. */

export const RECORDING_START_LABEL = "Démarrer l’enregistrement";
export const RECORDING_STOP_LABEL = "Arrêter l’enregistrement";
export const RECORDING_ACTIVE_LABEL = "Enregistrement en cours";
export const RECORDING_ACQUIRING_LABEL = "Recherche du signal GPS…";
export const RECORDING_PREVIEW_LABEL = "Parcours enregistré";
export const RECORDING_EXPORT_LABEL = "Sauvegarder en GPX";
export const RECORDING_EXPORTING_LABEL = "Création du fichier GPX…";
export const RECORDING_DELETE_LABEL = "Supprimer";
export const RECORDING_DELETE_CONFIRM_QUESTION =
  "Supprimer ce parcours ? Cette action est irréversible.";
export const RECORDING_DELETE_CONFIRM_LABEL = "Supprimer définitivement";
export const RECORDING_KEEP_LABEL = "Conserver";
export const RECORDING_FINISH_LABEL = "Terminer";
export const RECORDING_DISMISS_LABEL = "Fermer";

export const RECORDING_PERMISSION_DENIED_MESSAGE =
  "L’autorisation de localisation a été refusée. Autorisez la position pour enregistrer votre parcours.";
export const RECORDING_LOCATION_DISABLED_MESSAGE =
  "La localisation est désactivée. Activez-la dans les réglages de l’appareil pour enregistrer votre parcours.";
export const RECORDING_NO_SIGNAL_MESSAGE =
  "Aucun signal GPS utilisable pour le moment. Placez-vous à l’extérieur puis réessayez.";
export const RECORDING_NOT_ENOUGH_POINTS_MESSAGE =
  "Le parcours ne contient pas assez de points pour être exporté. Roulez un peu plus avant d’arrêter l’enregistrement.";
export const RECORDING_EXPORT_FAILED_MESSAGE =
  "Le fichier GPX n’a pas pu être créé. Votre parcours est conservé, réessayez.";

export function recordingExportedMessage(fileName: string): string {
  return `Parcours enregistré dans ${fileName}.`;
}

/** FR-041 — durée écoulée lisible d'un coup d'œil, sans dépendre d'Intl. */
export function formatElapsedLabel(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
