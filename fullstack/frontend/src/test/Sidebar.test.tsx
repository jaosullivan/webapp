import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";

const mockAssign = vi.fn();
Object.defineProperty(window, "location", {
  value: { href: "" },
  writable: true,
});

vi.mock("@/lib/api", () => ({
  auth: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/auth", () => ({
  isAdmin: vi.fn().mockReturnValue(true),
}));

import { auth } from "@/lib/api";
const mockLogout = vi.mocked(auth.logout);

function renderSidebar(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "test-token");
  });

  it("renders the Nexus brand name", () => {
    renderSidebar();
    expect(screen.getByText("Nexus")).toBeInTheDocument();
  });

  it("renders all four nav items", () => {
    renderSidebar();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
  });

  it("shows the PROD environment badge", () => {
    renderSidebar();
    expect(screen.getByText("PROD")).toBeInTheDocument();
  });

  it("calls auth.logout and clears token on sign-out", async () => {
    renderSidebar();
    fireEvent.click(screen.getByText(/sign out/i));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledOnce();
      expect(localStorage.getItem("token")).toBeNull();
    });
  });

  it("highlights the active route link", () => {
    renderSidebar("/users");
    const usersLink = screen.getByText("Users").closest("a");
    expect(usersLink).toHaveClass("bg-accent");
  });
});
