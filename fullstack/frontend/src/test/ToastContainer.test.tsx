import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { ToastContainer } from "@/components/ui/toast";

function Setup({ messages }: { messages?: string[] }) {
  const { addToast } = useToast();
  return (
    <>
      <button onClick={() => addToast("Default error", "error")}>add-error</button>
      <button onClick={() => addToast("Warning msg", "warning")}>add-warning</button>
      <button onClick={() => addToast("Success msg", "success")}>add-success</button>
      <button onClick={() => addToast("Info msg", "info")}>add-info</button>
      {messages?.map((m, i) => (
        <button key={i} onClick={() => addToast(m, "error")}>
          {`add-${i}`}
        </button>
      ))}
      <ToastContainer />
    </>
  );
}

function renderSetup(messages?: string[]) {
  return render(
    <ToastProvider>
      <Setup messages={messages} />
    </ToastProvider>
  );
}

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there are no toasts", () => {
    renderSetup();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders an alert when a toast is added", () => {
    renderSetup();
    screen.getByRole("button", { name: "add-error" }).click();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Default error")).toBeInTheDocument();
  });

  it("renders multiple toasts simultaneously", () => {
    renderSetup();
    screen.getByRole("button", { name: "add-error" }).click();
    screen.getByRole("button", { name: "add-success" }).click();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("dismiss button removes the toast", () => {
    renderSetup();
    screen.getByRole("button", { name: "add-error" }).click();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disappears after auto-dismiss timeout", () => {
    renderSetup();
    screen.getByRole("button", { name: "add-warning" }).click();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    vi.advanceTimersByTime(5001);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("applies distinct styling classes for each variant", () => {
    renderSetup();

    screen.getByRole("button", { name: "add-error" }).click();
    expect(screen.getByRole("alert").className).toMatch(/red/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    screen.getByRole("button", { name: "add-warning" }).click();
    expect(screen.getByRole("alert").className).toMatch(/amber/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    screen.getByRole("button", { name: "add-success" }).click();
    expect(screen.getByRole("alert").className).toMatch(/emerald/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    screen.getByRole("button", { name: "add-info" }).click();
    expect(screen.getByRole("alert").className).toMatch(/sky/);
  });
});
