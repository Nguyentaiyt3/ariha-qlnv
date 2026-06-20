"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { onAuthChange } from "@/lib/firebase/auth";
import { getUser } from "@/lib/firebase/firestore";

export function Providers({ children }: { children: React.ReactNode }) {
  const { setCurrentUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const user = await getUser(firebaseUser.uid);
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });
    return unsubscribe;
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
