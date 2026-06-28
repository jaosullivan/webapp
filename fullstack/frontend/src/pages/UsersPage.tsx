import { useEffect, useState, useCallback } from "react";
import { users as usersApi, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

export function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await usersApi.list(page * PAGE_SIZE, PAGE_SIZE);
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function toggleStatus(id: string) {
    await usersApi.toggleStatus(id);
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Users</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{total.toLocaleString()} total</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[var(--border)] hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold pl-5">Email</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Joined</TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold text-right pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-[var(--border)]/50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j} className="first:pl-5 last:pr-5">
                        <Skeleton className="h-3.5 w-full bg-secondary/60" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : items.map((user, idx) => (
                  <TableRow
                    key={user.id}
                    className={`border-b border-[var(--border)]/50 transition-colors hover:bg-[oklch(0.19_0_0)] ${
                      idx % 2 === 0 ? "" : "bg-[oklch(0.155_0_0)]"
                    }`}
                  >
                    <TableCell className="font-medium text-sm pl-5">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? "success" : "secondary"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right pr-5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleStatus(user.id)}
                        className="text-xs h-7 px-2.5 text-muted-foreground hover:text-foreground border border-[var(--border)] hover:border-[var(--muted-foreground)]"
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </Button>
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
