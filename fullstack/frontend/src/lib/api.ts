import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true, // required to send the HttpOnly refresh_token cookie
});

let _onApiError: ((msg: string) => void) | null = null;
export const setApiErrorHandler = (fn: (msg: string) => void) => {
  _onApiError = fn;
};

// Single in-flight refresh promise — all concurrent 401s wait on the same call.
let _refreshPromise: Promise<string> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status: number | undefined = err.response?.status;
    const isRefreshUrl = err.config?.url === "/auth/refresh";
    const isLoginUrl = err.config?.url === "/auth/token";

    if (status === 401) {
      if (isRefreshUrl || isLoginUrl) {
        // Refresh itself got 401 — let the _refreshPromise .catch handle cleanup.
        return Promise.reject(err);
      }

      if (!_refreshPromise) {
        _refreshPromise = api
          .post<{ access_token: string }>("/auth/refresh")
          .then((r) => {
            const token = r.data.access_token;
            localStorage.setItem("token", token);
            return token;
          })
          .catch(() => {
            localStorage.removeItem("token");
            window.location.href = "/login";
            return Promise.reject(new Error("Session expired"));
          })
          .finally(() => {
            _refreshPromise = null;
          });
      }

      try {
        const newToken = await _refreshPromise;
        err.config.headers = err.config.headers ?? {};
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api(err.config);
      } catch {
        return Promise.reject(err);
      }
    } else if (status === 429) {
      _onApiError?.("Too many requests — please wait a moment.");
    } else if (status && status >= 500) {
      _onApiError?.("Server error — please try again.");
    } else if (!err.response) {
      _onApiError?.("Network error — check your connection.");
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email: string, password: string) => {
    const form = new FormData();
    form.append("username", email);
    form.append("password", password);
    return api.post<{ access_token: string }>("/auth/token", form);
  },
  logout: () => api.post("/auth/logout"),
};

export const users = {
  list: (skip = 0, limit = 20) =>
    api.get<{ items: User[]; total: number }>("/users", { params: { skip, limit } }),
  toggleStatus: (id: string) => api.patch<User>(`/users/${id}/status`),
};

export const orders = {
  list: (skip = 0, limit = 20) =>
    api.get<{ items: Order[]; total: number }>("/orders", { params: { skip, limit } }),
  updateStatus: (id: string, status: string) =>
    api.patch<Order>(`/orders/${id}/status`, { status }),
  stats: () => api.get<OrderStats>("/orders/stats"),
};

export const payments = {
  list: (skip = 0, limit = 20) =>
    api.get<{ items: Payment[]; total: number }>("/payments", { params: { skip, limit } }),
  process: (id: string) => api.post<Payment>(`/payments/${id}/process`),
  stats: () => api.get<PaymentStats>("/payments/stats"),
};

export interface User {
  id: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  total: number;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  status: "pending" | "completed" | "failed" | "refunded";
  provider_ref: string | null;
  created_at: string;
}

export interface OrderStats {
  total: number;
  by_status: Record<string, number>;
  total_value: number;
}

export interface PaymentStats {
  total: number;
  by_status: Record<string, number>;
  revenue: number;
}
