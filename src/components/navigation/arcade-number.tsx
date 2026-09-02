import styles from "./arcade-number.module.css";

export type ArcadeNumberProps = {
  text: string;
  className?: string;
  testId?: string;
};

/**
 * FR-046 — original arcade numerals for navigation metrics. The visible
 * glyphs are decorative, while the complete value remains one accessible
 * label for VoiceOver ("250 m", not three unrelated digits).
 *
 * Size floor: only on numerals of **1.25 rem or more**. The glyphs are drawn
 * as a transparent fill inside a `0.075em` stroke, and below that size the
 * stroke closes the counters of 0, 6 and 8 and the figure stops being
 * readable. Never use it for slider ticks, table cells or captions.
 */
export function ArcadeNumber({ text, className, testId }: ArcadeNumberProps) {
  return (
    <span
      aria-label={text}
      className={[styles.number, className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      <span aria-hidden="true">
        {Array.from(text).map((character, index) => {
          const isDigit = character >= "0" && character <= "9";

          return (
            <span
              className={isDigit ? styles.digit : styles.plain}
              data-digit={isDigit ? character : undefined}
              key={`${character}-${index}`}
            >
              {character === " " ? "\u00a0" : character}
            </span>
          );
        })}
      </span>
    </span>
  );
}
