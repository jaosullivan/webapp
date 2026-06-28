import { useEffect, useState } from "react";
import { users, orders, payments } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShoppingCart, CreditCard, DollarSign } from "lucide-react";

interface Stats {
  totalUsers: number;
  totalOrders: number;
  totalPayments: number;
  totalRevenue: number;
}

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const CARDS = [
  {
    title: "Users",
    key: "totalUsers" as const,
    prefix: "",
    icon: Users,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/10 border-indigo-500/20",
    valueColor: "text-indigo-300",
  },
  {
    title: "Orders",
    key: "totalOrders" as const,
    prefix: "",
    icon: ShoppingCart,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20",
    valueColor: "text-emerald-300",
  },
  {
    title: "Payments",
    key: "totalPayments" as const,
    prefix: "",
    icon: CreditCard,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 border-amber-500/20",
    valueColor: "text-amber-300",
  },
  {
    title: "Revenue",
    key: "totalRevenue" as const,
    prefix: "$",
    icon: DollarSign,
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10 border-violet-500/20",
    valueColor: "text-violet-300",
  },
];

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([users.list(0, 1), orders.stats(), payments.stats()]).then(
      ([u, o, p]) => {
        setStats({
          totalUsers: u.data.total,
          totalOrders: o.data.total,
          totalPayments: p.data.total,
          totalRevenue: p.data.revenue,
        });
      }
    );
  }, []);

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Overview</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ title, key, prefix, icon: Icon, iconColor, iconBg, valueColor }) => {
          const raw = stats?.[key];
          const value =
            raw === undefined
              ? undefined
              : key === "totalRevenue"
              ? (raw as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : (raw as number).toLocaleString();

          return (
            <div
              key={title}
              className="rounded-xl border border-[var(--border)] bg-card p-5 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {title}
                </span>
                <div className={`rounded-lg border p-2 ${iconBg}`}>
                  <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                </div>
              </div>
              {value === undefined ? (
                <Skeleton className="h-8 w-24 bg-secondary" />
              ) : (
                <span className={`font-mono text-3xl font-bold tracking-tight ${valueColor}`}>
                  {prefix}{value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
