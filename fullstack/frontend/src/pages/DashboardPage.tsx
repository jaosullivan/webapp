import { useEffect, useState } from "react";
import { users, orders, payments } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShoppingCart, CreditCard, DollarSign } from "lucide-react";

interface Stats {
  totalUsers: number;
  totalOrders: number;
  totalPayments: number;
  totalRevenue: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      users.list(0, 1),
      orders.stats(),
      payments.stats(),
    ]).then(([u, o, p]) => {
      setStats({
        totalUsers: u.data.total,
        totalOrders: o.data.total,
        totalPayments: p.data.total,
        totalRevenue: p.data.revenue,
      });
    });
  }, []);

  const cards = [
    { title: "Total Users", icon: Users, value: stats?.totalUsers, prefix: "" },
    { title: "Total Orders", icon: ShoppingCart, value: stats?.totalOrders, prefix: "" },
    { title: "Total Payments", icon: CreditCard, value: stats?.totalPayments, prefix: "" },
    { title: "Revenue", icon: DollarSign, value: stats != null ? stats.totalRevenue.toFixed(2) : undefined, prefix: "$" },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, icon: Icon, value, prefix }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {value === undefined ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{prefix}{value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
