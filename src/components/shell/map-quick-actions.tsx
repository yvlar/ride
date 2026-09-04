import { Compass, Map, Navigation, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const glassButtonClassName =
  "ride-quick-action ride-glass min-h-[clamp(4.5rem,11dvh,5.5rem)] min-w-0 w-full justify-start gap-2 rounded-3xl px-2.5 py-2 text-left text-[clamp(0.78rem,3.3vw,1rem)] font-semibold leading-tight whitespace-normal text-white hover:bg-ride-glass-strong hover:text-white";

const iconClassName =
  "ride-quick-action-icon ride-icon-well size-[clamp(2.75rem,12vw,3.5rem)] [&_svg]:size-[clamp(1.3rem,5vw,1.65rem)]";

/*
 * Each action carries its label on two lines — the verb, then what it acts on.
 * The skin leans on that split to set the verb larger, the way the arcade
 * plates on the map are lettered, so the four actions can be told apart at a
 * glance from a handlebar mount. Themes that do not style the two spans simply
 * get the same words wrapped where they were always going to wrap.
 */
function QuickActionLabel({ verb, object }: { verb: string; object: string }) {
  return (
    <span className="ride-quick-action-label">
      <span className="ride-quick-action-verb">{verb}</span>
      <span className="ride-quick-action-object">{object}</span>
    </span>
  );
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
        <QuickActionLabel verb="Rechercher" object="une destination" />
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
        <QuickActionLabel verb="Décrire" object="mon trajet" />
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
        <QuickActionLabel verb="Découvrir" object="des trajets moto" />
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
        <QuickActionLabel verb="Importer un" object="fichier GPX" />
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
