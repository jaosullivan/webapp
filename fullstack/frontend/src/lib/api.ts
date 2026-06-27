import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
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
