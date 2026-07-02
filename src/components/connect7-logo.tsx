export function Connect7Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-mono text-lg font-bold text-primary-foreground shadow-sm">
        7
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-foreground">Connect 7</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Financial Hub
        </span>
      </div>
    </div>
  );
}
