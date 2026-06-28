import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, ShoppingCart, CreditCard, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

const baseNavItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/payments", label: "Payments", icon: CreditCard },
];

const adminNavItem = { href: "/users", label: "Users", icon: Users };

export function Sidebar() {
  const { pathname } = useLocation();
  const navItems = isAdmin() ? [baseNavItems[0], adminNavItem, ...baseNavItems.slice(1)] : baseNavItems;

  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen border-r border-[var(--border)] bg-[oklch(0.145_0_0)]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--border)]">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/20 border border-primary/30">
          <Zap className="h-3.5 w-3.5 text-primary fill-primary" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">Nexus</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors relative group",
                active
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-[oklch(0.19_0_0)]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
              )}
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span className={cn("font-medium", active ? "text-foreground" : "")}>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[var(--border)] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">Environment</span>
          <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
            PROD
          </span>
        </div>
        <button
          onClick={async () => {
            try { await auth.logout(); } catch { /* clear token regardless */ }
            localStorage.removeItem("token");
            window.location.href = "/login";
          }}
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
