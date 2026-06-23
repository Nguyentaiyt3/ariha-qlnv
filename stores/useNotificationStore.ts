"use client";

import { create } from "zustand";
import type { Notification } from "@/types";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isPanelOpen: boolean;
  setNotifications: (notifs: Notification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  removeAllRead: () => void;
  togglePanel: () => void;
  closePanel: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isPanelOpen: false,

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.read).length }),

  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  removeNotification: (id) =>
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    }),

  removeAllRead: () =>
    set((state) => {
      const notifications = state.notifications.filter((n) => !n.read);
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  closePanel: () => set({ isPanelOpen: false }),
}));
