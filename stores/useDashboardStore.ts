"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DashboardProfile, WidgetConfig, WidgetType } from "@/types";
import { generateId } from "@/lib/utils";

interface DashboardState {
  profiles: DashboardProfile[];
  activeProfileId: string | null;
  isEditMode: boolean;
  setProfiles: (profiles: DashboardProfile[]) => void;
  setActiveProfile: (id: string) => void;
  updateWidgets: (profileId: string, widgets: WidgetConfig[]) => void;
  addProfile: (name: string, widgets: WidgetConfig[]) => DashboardProfile;
  deleteProfile: (id: string) => void;
  toggleEditMode: () => void;
  toggleWidgetVisibility: (profileId: string, widgetId: string) => void;
  getActiveProfile: () => DashboardProfile | null;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      isEditMode: false,

      setProfiles: (profiles) =>
        set({
          profiles,
          activeProfileId: profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? null,
        }),

      setActiveProfile: (id) => set({ activeProfileId: id }),

      updateWidgets: (profileId, widgets) =>
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === profileId ? { ...p, widgets } : p
          ),
        })),

      addProfile: (name, widgets) => {
        const newProfile: DashboardProfile = {
          id: generateId("profile"),
          name,
          widgets,
          isDefault: false,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ profiles: [...state.profiles, newProfile] }));
        return newProfile;
      },

      deleteProfile: (id) =>
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          activeProfileId:
            state.activeProfileId === id
              ? state.profiles.find((p) => p.id !== id)?.id ?? null
              : state.activeProfileId,
        })),

      toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),

      toggleWidgetVisibility: (profileId, widgetId) =>
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === profileId
              ? {
                  ...p,
                  widgets: p.widgets.map((w) =>
                    w.id === widgetId ? { ...w, visible: !w.visible } : w
                  ),
                }
              : p
          ),
        })),

      getActiveProfile: () => {
        const state = get();
        return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
      },
    }),
    {
      name: "ariha-dashboard",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
