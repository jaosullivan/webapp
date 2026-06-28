import { useEffect, useState, useCallback } from "react";
import { payments as paymentsApi, type Payment } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";

const PAGE_SIZE = 20;

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

const STATUS_VARIANTS: Record<Payment["status"], BadgeVariant> = {
  pending:   "warning",
  completed: "success",
  failed:    "destructive",
  refunded:  "secondary",
};

export function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await paymentsApi.list(page * PAGE_SIZE, PAGE_SIZE);
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function processPayment(id: string) {
    await paymentsApi.process(id);
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Payments</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{total.toLocaleString()} total</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold pl-5">Payment ID</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Order</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Amount</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Provider Ref</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Created</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold text-right pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-[var(--border)]/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j} className="first:pl-5 last:pr-5">
                        <Skeleton className="h-3.5 w-full bg-secondary/60" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : items.map((payment, idx) => (
                  <TableRow
                    key={payment.id}
                    className={`border-b border-[var(--border)]/50 transition-colors hover:bg-[oklch(0.19_0_0)] ${
                      idx % 2 === 0 ? "" : "bg-[oklch(0.155_0_0)]"
                    }`}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground pl-5">
                      {payment.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {payment.order_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      ${payment.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[payment.status]}>{payment.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {payment.provider_ref ? payment.provider_ref.slice(0, 12) + "…" : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right pr-5">
                      {payment.status === "pending" && (
                        <button
                          onClick={() => processPayment(payment.id)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary/20 border border-primary/30 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
                        >
                          <Zap className="h-3 w-3 fill-primary" />
                          Process
                        </button>
                      )}
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
