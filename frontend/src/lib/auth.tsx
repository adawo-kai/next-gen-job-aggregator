"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { api, mockMode, tokens } from "./api";

function getAccess() {
  return tokens.access;
}
function getServerAccess() {
  return null;
}

export function useAccessToken() {
  return useSyncExternalStore(tokens.subscribe, getAccess, getServerAccess);
}

export function useAuth() {
  const access = useAccessToken();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me", access], queryFn: api.me, enabled: !!access, retry: false, staleTime: 60_000 });

  const login = useCallback(
    async (email: string, password: string, mode: "login" | "register" = "login") => {
      const t = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      tokens.set(t);
      await qc.invalidateQueries();
    },
    [qc],
  );

  const logout = useCallback(() => {
    tokens.clear();
    qc.clear();
  }, [qc]);

  return { isAuthed: !!access, user: me.data ?? null, loading: !!access && me.isLoading, login, logout };
}

function getMock() {
  return mockMode.active;
}
function getServerMock() {
  return false;
}
export function useMockMode() {
  return useSyncExternalStore(mockMode.subscribe, getMock, getServerMock);
}
