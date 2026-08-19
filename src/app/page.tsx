export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <p className="text-sm font-semibold tracking-wide uppercase">Ride</p>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Générateur de trajets moto
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Créez une sortie à partir d’un départ, d’une distance ou d’une
          destination, puis comparez des variantes adaptées aux courbes, aux
          paysages et au touring.
        </p>
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          Le formulaire de génération arrive à la phase suivante. Le projet est
          initialisé avec Next.js, TypeScript strict, Tailwind, Vitest et un
          fournisseur de routage simulé.
        </p>
      </main>
    </div>
  );
}
