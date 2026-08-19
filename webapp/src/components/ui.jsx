// Hand-rolled shadcn/ui-style primitives (zinc dark). Same class recipes as
// shadcn's Button/Card/Input/Badge/Dialog, without the generator.
import { Loader2 } from "lucide-react";

export const cn = (...cls) => cls.filter(Boolean).join(" ");

const buttonVariants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
};

export function Button({ variant = "default", size = "default", className, asChild, ...props }) {
  const Comp = props.href !== undefined ? "a" : "button";
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 px-3 text-xs",
    lg: "h-10 px-6",
    icon: "h-9 w-9",
  };
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "text-foreground border-border",
  success: "border-transparent bg-emerald-500/15 text-emerald-400",
  warning: "border-transparent bg-amber-500/15 text-amber-400",
  error: "border-transparent bg-red-500/15 text-red-400",
};

export function Badge({ variant = "default", className, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Dialog({ open, onClose, title, description, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4">{children}</div>
      </Card>
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

/** Clapperboard loader — the striped lid snaps like a slate between takes. */
export function ClapperLoader({ label = "Loading…", className }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 py-16", className)}>
      <svg viewBox="0 -20 48 64" className="h-16 w-16 text-foreground" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <g className="clapper-lid">
          <rect x="5" y="4" width="38" height="10" rx="2.5" fill="hsl(240 10% 5.9%)" />
          <path d="M12 4l-4 10M22 4l-4 10M32 4l-4 10M42 4l-4 10" strokeWidth="2" />
        </g>
        <rect x="5" y="16" width="38" height="24" rx="2.5" fill="hsl(240 10% 5.9%)" />
        <path d="M5 24h38" strokeWidth="1.5" className="text-muted-foreground" stroke="currentColor" />
      </svg>
      <span className="animate-pulse text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
