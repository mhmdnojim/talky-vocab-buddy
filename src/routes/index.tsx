import { createFileRoute, Link } from "@tanstack/react-router";
import { CATEGORIES, VOCABULARY } from "@/data/vocabulary";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vocabulary - Learn English with Pictures & Voice" },
      {
        name: "description",
        content:
          "Learn English vocabulary with cartoon illustrations and natural human voice pronunciation. Free flashcards across emergency, daily life, food and travel.",
      },
      { property: "og:title", content: "Vocabulary - Learn English with Pictures & Voice" },
      {
        property: "og:description",
        content: "Cartoon flashcards with human-voice pronunciation.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="bg-primary text-primary-foreground px-5 py-6 shadow-md">
        <h1 className="text-2xl font-bold tracking-tight">Vocabulary</h1>
        <p className="mt-1 text-sm opacity-90">
          Tap a category to start learning with pictures and voice
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Categories</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const count = VOCABULARY.filter((w) => w.category === c.id).length;
            return (
              <Link
                key={c.id}
                to="/learn/$category"
                params={{ category: c.id }}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-border bg-card p-5 text-center shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <div className="text-4xl">{c.emoji}</div>
                <div className="mt-2 font-semibold text-foreground">{c.label}</div>
                <div className="text-xs text-muted-foreground">{count} words</div>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {VOCABULARY.length} words available · More coming soon
        </p>
      </main>
    </div>
  );
}
