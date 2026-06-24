"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const { setCurrentUser, setLoading } = useAuthStore();

  useEffect(() => {
    setLoading(true);

    // Check if user is already logged in (JWT token in cookie)
    const checkAuth = async () => {
      try {
        // Token is automatically sent via cookies in HTTP requests
        // For now, we just set loading to false
        // The auth check will happen when user accesses protected pages
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
