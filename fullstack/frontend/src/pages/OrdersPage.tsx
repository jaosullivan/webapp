import { useEffect, useState, useCallback } from "react";
import { orders as ordersApi, type Order } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

const PAGE_SIZE = 20;

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

const STATUS_VARIANTS: Record<Order["status"], BadgeVariant> = {
  pending:   "warning",
  confirmed: "info",
  shipped:   "default",
  delivered: "success",
  cancelled: "destructive",
};

const ORDER_STATUSES: Order["status"][] = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

export function OrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await ordersApi.list(page * PAGE_SIZE, PAGE_SIZE);
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id: string, status: string) {
    await ordersApi.updateStatus(id, status);
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Orders</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{total.toLocaleString()} total</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold pl-5">Order ID</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">User</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Total</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Created</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold text-right pr-5">Update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-[var(--border)]/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="first:pl-5 last:pr-5">
                        <Skeleton className="h-3.5 w-full bg-secondary/60" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : items.map((order, idx) => (
                  <TableRow
                    key={order.id}
                    className={`border-b border-[var(--border)]/50 transition-colors hover:bg-[oklch(0.19_0_0)] ${
                      idx % 2 === 0 ? "" : "bg-[oklch(0.155_0_0)]"
                    }`}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground pl-5">
                      {order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {order.user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      ${order.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[order.status]}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right pr-5">
                      {/* Overlay a styled badge with a transparent native select for zero-dependency custom dropdown */}
                      <div className="relative inline-flex items-center gap-1 cursor-pointer group">
                        <Badge
                          variant={STATUS_VARIANTS[order.status]}
                          className="cursor-pointer group-hover:opacity-80 transition-opacity pr-1.5"
                        >
                          {order.status}
                          <ChevronDown className="h-2.5 w-2.5 ml-1 opacity-60" />
                        </Badge>
                        <select
                          className="absolute inset-0 opacity-0 cursor-pointer w-full"
                          value={order.status}
                          onChange={(e) => changeStatus(order.id, e.target.value)}
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="h-7 w-7 p-0 border border-[var(--border)]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground font-mono">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 w-7 p-0 border border-[var(--border)]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
