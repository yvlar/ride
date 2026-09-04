import styles from "./arcade-number.module.css";

export type ArcadeNumberProps = {
  text: string;
  className?: string;
  testId?: string;
};

/**
 * FR-046 — original arcade glyphs for navigation metrics. The visible
 * glyphs are decorative, while the complete value remains one accessible
 * label for VoiceOver ("250 m", not three unrelated digits).
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
          const isLetter =
            character.toLocaleLowerCase("fr-CA") !==
            character.toLocaleUpperCase("fr-CA");
          const glyphClass = isDigit
            ? styles.digit
            : isLetter
              ? styles.letter
              : styles.plain;

          return (
            <span
              className={glyphClass}
              data-digit={isDigit ? character : undefined}
              data-letter={
                isLetter ? character.toLocaleLowerCase("fr-CA") : undefined
              }
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
