import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";

export function makeStub(path: string, title: string, description: string) {
  return function Stub() {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl py-20 text-center">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <p className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">
            {path} · em construção
          </p>
        </div>
      </AppLayout>
    );
  };
}

export function stubHead(title: string) {
  return () => ({
    meta: [
      { title: `${title} · Connect 7` },
      { name: "robots", content: "noindex" },
    ],
  });
}

// Re-export for convenience
export { createFileRoute };
