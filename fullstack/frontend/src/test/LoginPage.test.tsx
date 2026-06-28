import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/lib/api", () => ({
  auth: {
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

import { auth } from "@/lib/api";
const mockLogin = vi.mocked(auth.login);

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders the app name and form", () => {
    renderLogin();
    expect(screen.getByText("Nexus")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows an error on failed login", async () => {
    mockLogin.mockRejectedValueOnce(new Error("401"));
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bad@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("stores token and navigates on successful login", async () => {
    mockLogin.mockResolvedValueOnce({
      data: { access_token: "test-token-abc" },
    } as never);
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem("token")).toBe("test-token-abc");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("disables the submit button while loading", async () => {
    let resolve!: (v: unknown) => void;
    mockLogin.mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pass" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    resolve({ data: { access_token: "tok" } });
  });
});
