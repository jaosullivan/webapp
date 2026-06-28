import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast, type ToastVariant } from "@/contexts/ToastContext";

function ToastConsumer({
  message = "Hello",
  variant,
}: {
  message?: string;
  variant?: ToastVariant;
}) {
  const { toasts, addToast, removeToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast(message, variant)}>add</button>
      <button onClick={() => toasts[0] && removeToast(toasts[0].id)}>remove-first</button>
      <ul>
        {toasts.map((t) => (
          <li key={t.id} data-variant={t.variant} data-testid="toast-item">
            {t.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("ToastContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when useToast is called outside ToastProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ToastConsumer />)).toThrow(
      "useToast must be used inside <ToastProvider>"
    );
    spy.mockRestore();
  });

  it("addToast appends a toast with the correct message and variant", () => {
    render(
      <ToastProvider>
        <ToastConsumer message="Test message" variant="success" />
      </ToastProvider>
    );
    act(() => { screen.getByRole("button", { name: "add" }).click(); });
    const item = screen.getByTestId("toast-item");
    expect(item).toHaveTextContent("Test message");
    expect(item).toHaveAttribute("data-variant", "success");
  });

  it("defaults variant to 'error' when not specified", () => {
    render(
      <ToastProvider>
        <ToastConsumer message="oops" />
      </ToastProvider>
    );
    act(() => { screen.getByRole("button", { name: "add" }).click(); });
    expect(screen.getByTestId("toast-item")).toHaveAttribute("data-variant", "error");
  });

  it("removeToast removes the toast from the list", () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    act(() => { screen.getByRole("button", { name: "add" }).click(); });
    expect(screen.getByTestId("toast-item")).toBeInTheDocument();
    act(() => { screen.getByRole("button", { name: "remove-first" }).click(); });
    expect(screen.queryByTestId("toast-item")).not.toBeInTheDocument();
  });

  it("toasts auto-dismiss after 5 seconds", () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    act(() => { screen.getByRole("button", { name: "add" }).click(); });
    expect(screen.getByTestId("toast-item")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(screen.queryByTestId("toast-item")).not.toBeInTheDocument();
  });

  it("caps the list at 5 toasts when more are added rapidly", () => {
    function SpamConsumer() {
      const { toasts, addToast } = useToast();
      return (
        <div>
          <button
            onClick={() => {
              for (let i = 0; i < 7; i++) addToast(`msg-${i}`, "info");
            }}
          >
            spam
          </button>
          <span data-testid="count">{toasts.length}</span>
        </div>
      );
    }
    render(
      <ToastProvider>
        <SpamConsumer />
      </ToastProvider>
    );
    act(() => { screen.getByRole("button", { name: "spam" }).click(); });
    expect(screen.getByTestId("count").textContent).toBe("5");
  });

  it("multiple toasts of different variants can coexist", () => {
    function MultiVariantConsumer() {
      const { toasts, addToast } = useToast();
      return (
        <div>
          <button onClick={() => addToast("err", "error")}>add-error</button>
          <button onClick={() => addToast("ok", "success")}>add-success</button>
          <span data-testid="count">{toasts.length}</span>
        </div>
      );
    }
    render(
      <ToastProvider>
        <MultiVariantConsumer />
      </ToastProvider>
    );
    act(() => { screen.getByRole("button", { name: "add-error" }).click(); });
    act(() => { screen.getByRole("button", { name: "add-success" }).click(); });
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByText("err")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});
