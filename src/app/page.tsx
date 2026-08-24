import { Badge } from "@/components/ui/badge";
import { RideRequestForm } from "@/components/ride-form/ride-request-form";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
        <p className="text-sm font-semibold tracking-wide uppercase">Ride</p>
        <Badge variant="outline">MVP</Badge>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Générateur de trajets moto
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            Créez une sortie à partir d’un départ, d’une distance ou d’une
            destination, selon le type et le style de conduite.
          </p>
        </div>
        <RideRequestForm />
      </main>
    </div>
  );
}
