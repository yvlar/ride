import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-sm font-semibold tracking-wide uppercase">Ride</p>
        <Badge variant="outline">MVP</Badge>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Générateur de trajets moto
          </h1>
          <p className="max-w-xl text-lg leading-8 text-muted-foreground">
            Créez une sortie à partir d’un départ, d’une distance ou d’une
            destination, puis comparez des variantes adaptées aux courbes, aux
            paysages et au touring.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Prochaine étape</CardTitle>
            <CardDescription>
              Le formulaire de génération arrive à la phase suivante. Le projet
              est initialisé avec Next.js, TypeScript strict, Tailwind, shadcn/ui,
              Vitest et un fournisseur de routage simulé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" disabled>
              Générer ma ride
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
