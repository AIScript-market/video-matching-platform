"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Me, type Role } from "./api";

interface Session {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  has: (role: Role) => boolean;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    () =>
      api.GET("/me").then(({ data }) => {
        setUser(data ?? null);
        setLoading(false);
      }),
    [],
  );

  const logout = useCallback(async () => {
    await api.POST("/auth/logout");
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const has = useCallback((role: Role) => Boolean(user?.roles.includes(role)), [user]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout, has }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("SessionProvider 안에서만 쓸 수 있습니다");
  return ctx;
}
