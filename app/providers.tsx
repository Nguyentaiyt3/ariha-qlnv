"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const { setCurrentUser, setLoading } = useAuthStore();

  useEffect(() => {
    setLoading(true);

    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const { user } = await res.json();
          if (user) setCurrentUser(user);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [setCurrentUser, setLoading]);

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: { fontFamily: "Inter, system-ui, sans-serif" },
        }}
      />
    </>
  );
}
