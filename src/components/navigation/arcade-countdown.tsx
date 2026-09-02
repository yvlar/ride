import styles from "./arcade-countdown.module.css";

export type ArcadeCountdownStep = 3 | 2 | 1 | 0;

export type ArcadeCountdownProps = {
  step: ArcadeCountdownStep;
};

/**
 * FR-046 — the start countdown: 3, 2, 1, GO !, once per session.
 *
 * Presentational only. The session owns the pacing, the audio and the decision
 * to run it at all; this renders whichever step it is handed.
 *
 * It deliberately does *not* reuse `ArcadeNumber`. Those numerals are drawn as
 * a transparent fill inside a `0.075em` stroke, which is proportioned for the
 * 2 rem figures of the navigation panel; at the size of a countdown the stroke
 * swallows the glyph and every digit comes out black. These numerals carry the
 * plate treatment instead — the one "GO !" uses — and take the colours of a
 * starting light: red, amber, green, then away.
 *
 * It is `aria-hidden` on purpose: the overlay already announces the state of
 * the session through its `role="status"` line, and a countdown talking over
 * that would be noise, not information. It is also transparent to touches at
 * every level, so "Terminer" stays pressable while it runs.
 */
export function ArcadeCountdown({ step }: ArcadeCountdownProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="arcade-countdown"
      data-step={step}
      className={`pointer-events-none absolute inset-0 grid place-items-center ${styles.stage}`}
    >
      {step === 0 ? (
        <p className={styles.go}>GO !</p>
      ) : (
        <p className={styles.count} data-step={step}>
          {step}
        </p>
      )}
    </div>
  );
}
