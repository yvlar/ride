import { Compass, FileUp, Navigation, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const glassButtonClassName =
  "ride-glass min-h-[clamp(4.5rem,11dvh,5.5rem)] min-w-0 w-full justify-start gap-2 rounded-3xl px-2.5 py-2 text-left text-[clamp(0.78rem,3.3vw,1rem)] font-semibold leading-tight whitespace-normal text-white hover:bg-ride-glass-strong hover:text-white";

const iconClassName =
  "ride-icon-well size-[clamp(2.75rem,12vw,3.5rem)] [&_svg]:size-[clamp(1.3rem,5vw,1.65rem)]";

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
      className="pointer-events-auto grid w-full max-w-md grid-cols-2 gap-2"
    >
      <Button
        type="button"
        variant="ghost"
        aria-label="Rechercher une destination"
        className={glassButtonClassName}
        onClick={onSearch}
      >
        <span className={iconClassName}><Search aria-hidden="true" /></span>
        <span>Rechercher une destination</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Décrire mon trajet"
        className={glassButtonClassName}
        onClick={onDescribe}
      >
        <span className={iconClassName}><Sparkles aria-hidden="true" /></span>
        <span>Décrire mon trajet</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Découvrir des trajets moto"
        className={glassButtonClassName}
        onClick={onCatalog}
      >
        <span className={iconClassName}><Compass aria-hidden="true" /></span>
        <span>Découvrir des trajets moto</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Importer un fichier GPX"
        className={glassButtonClassName}
        onClick={onImportGpx}
      >
        <span className={iconClassName}><FileUp aria-hidden="true" /></span>
        <span>Importer un fichier GPX</span>
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
