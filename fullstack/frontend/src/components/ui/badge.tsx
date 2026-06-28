import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:     "border-indigo-700/40 bg-indigo-900/30 text-indigo-300",
        secondary:   "border-zinc-600/50 bg-zinc-800/60 text-zinc-400",
        destructive: "border-red-800/40 bg-red-900/30 text-red-400",
        outline:     "border-border text-foreground",
        success:     "border-emerald-800/40 bg-emerald-900/30 text-emerald-400",
        warning:     "border-amber-700/40 bg-amber-900/30 text-amber-400",
        info:        "border-sky-700/40 bg-sky-900/30 text-sky-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
