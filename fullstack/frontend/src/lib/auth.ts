export interface JwtPayload {
  sub: string;
  exp: number;
  admin?: boolean;
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isAdmin(): boolean {
  const token = localStorage.getItem("token");
  if (!token) return false;
  const payload = decodeToken(token);
  return payload?.admin === true;
}
