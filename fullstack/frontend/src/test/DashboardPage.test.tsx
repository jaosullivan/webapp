import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "@/pages/DashboardPage";

vi.mock("@/lib/api", () => ({
  users: {
    list: vi.fn(),
  },
  orders: {
    stats: vi.fn(),
  },
  payments: {
    stats: vi.fn(),
  },
}));

import { users, orders, payments } from "@/lib/api";
const mockUsersList = vi.mocked(users.list);
const mockOrdersStats = vi.mocked(orders.stats);
const mockPaymentsStats = vi.mocked(payments.stats);

const STATS_RESPONSE = {
  users: { data: { items: [], total: 42 } },
  orders: { data: { total: 135, by_status: {}, total_value: 9800 } },
  payments: { data: { total: 120, by_status: {}, revenue: 7500.5 } },
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersList.mockResolvedValue(STATS_RESPONSE.users as never);
    mockOrdersStats.mockResolvedValue(STATS_RESPONSE.orders as never);
    mockPaymentsStats.mockResolvedValue(STATS_RESPONSE.payments as never);
  });

  it("renders the Overview heading", () => {
    renderDashboard();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("shows skeleton loaders before data arrives", () => {
    mockUsersList.mockReturnValueOnce(new Promise(() => {}) as never);
    mockOrdersStats.mockReturnValueOnce(new Promise(() => {}) as never);
    mockPaymentsStats.mockReturnValueOnce(new Promise(() => {}) as never);

    renderDashboard();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders stat values after data loads", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();       // users
      expect(screen.getByText("135")).toBeInTheDocument();      // orders
      expect(screen.getByText("120")).toBeInTheDocument();      // payments
      expect(screen.getByText("$7,500.50")).toBeInTheDocument(); // revenue
    });
  });

  it("renders all four stat card labels", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/users/i)).toBeInTheDocument();
      expect(screen.getByText(/orders/i)).toBeInTheDocument();
      expect(screen.getByText(/payments/i)).toBeInTheDocument();
      expect(screen.getByText(/revenue/i)).toBeInTheDocument();
    });
  });
});
