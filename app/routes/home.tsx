import type { Route } from "./+types/home";

export default function Home({}: Route.ComponentProps) {
  return (
    <>
      <main className="text-center flex-1 flex flex-col gap-6">
        <h1 className="text-6xl font-bold font-happiness">Lil Slug Crew</h1>
        <h2 className="text-2xl font-bold">Welcome to Season 3!</h2>
      </main>
      <footer className="text-center">
        <p>
          <a href="/kitchen-sink" className="underline hover:text-gray-200">
            Kitchen Sink
          </a>
        </p>
      </footer>
    </>
  );
}
