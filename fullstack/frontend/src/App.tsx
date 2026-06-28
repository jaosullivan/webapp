import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { Layout } from "@/components/layout/Layout";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { ToastContainer } from "@/components/ui/toast";
import { setApiErrorHandler } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (!isAdmin()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { addToast } = useToast();

  useEffect(() => {
    setApiErrorHandler(addToast);
  }, [addToast]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                  <Route path="/users" element={<RequireAdmin><ErrorBoundary><UsersPage /></ErrorBoundary></RequireAdmin>} />
                  <Route path="/orders" element={<ErrorBoundary><OrdersPage /></ErrorBoundary>} />
                  <Route path="/payments" element={<ErrorBoundary><PaymentsPage /></ErrorBoundary>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}
