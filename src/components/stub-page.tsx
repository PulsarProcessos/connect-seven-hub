import { AppLayout } from "@/components/app-layout";

export function StubPage({ title, description }: { title: string; description: string }) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">
          Em construção
        </p>
      </div>
    </AppLayout>
  );
}
