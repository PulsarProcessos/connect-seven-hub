import logoAsset from "@/assets/connect7-logo.png.asset.json";

export function Connect7Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoAsset.url}
        alt="Connect 7"
        className="h-10 w-10 shrink-0 object-contain"
      />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-foreground">Connect 7</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Financial Hub
        </span>
      </div>
    </div>
  );
}
