"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { api, mockMode, tokens } from "./api";
import { track } from "./analytics";

function getAccess() {
  return tokens.access;
}
function getServerAccess() {
  return null;
}

export function useAccessToken() {
  return useSyncExternalStore(tokens.subscribe, getAccess, getServerAccess);
}

/** Revokes the current session on the server (best effort: never blocks signing out locally). */
export async function revokeCurrentSession() {
  const rt = tokens.refresh;
  if (!rt || rt.startsWith("mock")) return;
  try {
    await api.logout(rt);
  } catch {}
}

export function useAuth() {
  const access = useAccessToken();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me", access], queryFn: api.me, enabled: !!access, retry: false, staleTime: 60_000 });

  const login = useCallback(
    async (email: string, password: string, mode: "login" | "register" = "login") => {
      const t = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      tokens.set(t);
      if (mode === "register") track("signup");
      await qc.invalidateQueries();
    },
    [qc],
  );

  /** Sign in with tokens obtained elsewhere (password reset, password change). */
  const adoptTokens = useCallback(
    async (t: Parameters<typeof tokens.set>[0]) => {
      tokens.set(t);
      await qc.invalidateQueries();
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await revokeCurrentSession();
    tokens.clear();
    qc.clear();
  }, [qc]);

  /** Local sign-out only: for when the server already revoked everything (logout-all, account deletion). */
  const forget = useCallback(() => {
    tokens.clear();
    qc.clear();
  }, [qc]);

  return { isAuthed: !!access, user: me.data ?? null, loading: !!access && me.isLoading, login, logout, forget, adoptTokens };
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
