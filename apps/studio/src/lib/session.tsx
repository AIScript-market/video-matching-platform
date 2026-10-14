"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Me, type PublicConfig, type Role } from "./api";

interface Session {
  user: Me | null;
  /** 베타 여부와 켜진 기능 (GET /config). 불러오기 전에는 null */
  config: PublicConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  has: (role: Role) => boolean;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PublicConfig | null>(null);

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
    void api.GET("/config").then(({ data }) => setConfig(data ?? null));
  }, [refresh]);

  const has = useCallback((role: Role) => Boolean(user?.roles.includes(role)), [user]);

  return (
    <SessionContext.Provider value={{ user, config, loading, refresh, logout, has }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("SessionProvider 안에서만 쓸 수 있습니다");
  return ctx;
}
