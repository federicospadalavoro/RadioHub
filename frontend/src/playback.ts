export const playbackLabels = {
  idle: "Pronta all’ascolto",
  loading: "Connessione alla radio…",
  buffering: "Buffering…",
  playing: "In diretta",
  paused: "In pausa",
  "tap-required": "Tocca play per avviare la radio.",
  error: "Stream non disponibile. Riprova o scegli un’altra radio.",
};
export type PlaybackStatus = keyof typeof playbackLabels;
