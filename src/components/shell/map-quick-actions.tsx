import { Compass, FileUp, Navigation, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const glassButtonClassName =
  "min-h-[clamp(3.5rem,10dvh,4.5rem)] min-w-0 w-full flex-col gap-1 rounded-2xl border border-white/20 bg-slate-950/55 px-2 py-2 text-center text-xs font-semibold leading-tight whitespace-normal text-white shadow-lg shadow-black/20 backdrop-blur-md hover:bg-slate-950/70 hover:text-white supports-[backdrop-filter]:bg-slate-950/45";

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
        <Search aria-hidden="true" className="size-5" />
        <span>Rechercher destination</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Décrire mon trajet"
        className={glassButtonClassName}
        onClick={onDescribe}
      >
        <Sparkles aria-hidden="true" className="size-5" />
        <span>Décrire mon trajet</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Découvrir des trajets moto"
        className={glassButtonClassName}
        onClick={onCatalog}
      >
        <Compass aria-hidden="true" className="size-5" />
        <span>Découvrir trajets moto</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Importer un fichier GPX"
        className={glassButtonClassName}
        onClick={onImportGpx}
      >
        <FileUp aria-hidden="true" className="size-5" />
        <span>Importer GPX</span>
      </Button>
      {onResume ? (
        <Button
          type="button"
          variant="ghost"
          className="col-span-2 min-h-12 rounded-2xl border border-white/20 bg-slate-950/55 text-sm font-semibold text-white shadow-lg shadow-black/20 backdrop-blur-md hover:bg-slate-950/70 hover:text-white supports-[backdrop-filter]:bg-slate-950/45"
          onClick={onResume}
        >
          <Navigation aria-hidden="true" className="size-5" />
          Reprendre la navigation
        </Button>
      ) : null}
    </section>
  );
}
