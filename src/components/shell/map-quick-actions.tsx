import { Compass, Map, Navigation, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const glassButtonClassName =
  "ride-quick-action ride-glass min-h-[clamp(4.5rem,11dvh,5.5rem)] min-w-0 w-full justify-start gap-2 rounded-3xl px-2.5 py-2 text-left text-[clamp(0.78rem,3.3vw,1rem)] font-semibold leading-tight whitespace-normal text-white hover:bg-ride-glass-strong hover:text-white";

const iconClassName =
  "ride-quick-action-icon ride-icon-well size-[clamp(2.75rem,12vw,3.5rem)] [&_svg]:size-[clamp(1.3rem,5vw,1.65rem)]";

/*
 * One word on the plate. A rider glancing down from a handlebar mount reads a
 * colour and a single word, not a sentence — the badge and the hue already say
 * which action it is. The full wording stays on `aria-label`, so a screen
 * reader still hears "Rechercher une destination" rather than "Destination".
 */
function QuickActionLabel({ word }: { word: string }) {
  return <span className="ride-quick-action-label">{word}</span>;
}

export function MapQuickActions({
  onSearch,
  onDescribe,
  onCatalog,
  onImportGpx,
  onResume,
}: {
  onSearch: () => void;
  onDescribe: () => void;
  onCatalog: () => void;
  onImportGpx: () => void;
  onResume?: () => void;
}) {
  return (
    <section
      aria-label="Actions principales"
      className="ride-quick-actions pointer-events-auto grid w-full max-w-md grid-cols-2 gap-2"
    >
      <Button
        type="button"
        variant="ghost"
        aria-label="Rechercher une destination"
        data-quick-action="search"
        className={glassButtonClassName}
        onClick={onSearch}
      >
        <span className={iconClassName}><Search aria-hidden="true" /></span>
        <QuickActionLabel word="Destination" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Décrire mon trajet"
        data-quick-action="describe"
        className={glassButtonClassName}
        onClick={onDescribe}
      >
        <span className={iconClassName}>
          <Star aria-hidden="true" fill="currentColor" />
        </span>
        <QuickActionLabel word="Décrire" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Découvrir des trajets moto"
        data-quick-action="catalog"
        className={glassButtonClassName}
        onClick={onCatalog}
      >
        <span className={iconClassName}><Compass aria-hidden="true" /></span>
        <QuickActionLabel word="Découvrir" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Importer un fichier GPX"
        data-quick-action="gpx"
        className={glassButtonClassName}
        onClick={onImportGpx}
      >
        <span className={iconClassName}><Map aria-hidden="true" /></span>
        <QuickActionLabel word="Importer" />
      </Button>
      {onResume ? (
        <Button
          type="button"
          variant="ride"
          className="col-span-2 min-h-12 rounded-2xl text-sm"
          onClick={onResume}
        >
          <Navigation aria-hidden="true" className="size-5" />
          Reprendre la navigation
        </Button>
      ) : null}
    </section>
  );
}
