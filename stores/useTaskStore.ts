"use client";

import { create } from "zustand";
import type { Task, TaskFilters, TaskViewMode, User } from "@/types";

interface TaskState {
  tasks: Task[];
  users: User[];
  viewMode: TaskViewMode;
  filters: TaskFilters;
  selectedTaskId: string | null;
  isLoading: boolean;
  setTasks: (tasks: Task[]) => void;
  setUsers: (users: User[]) => void;
  setViewMode: (mode: TaskViewMode) => void;
  setFilters: (filters: Partial<TaskFilters>) => void;
  resetFilters: () => void;
  setSelectedTaskId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  addTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
}

const defaultFilters: TaskFilters = {
  search: "",
};

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  users: [],
  viewMode: "kanban",
  filters: defaultFilters,
  selectedTaskId: null,
  isLoading: false,

  setTasks: (tasks) => set({ tasks }),
  setUsers: (users) => set({ users }),
  setViewMode: (viewMode) => set({ viewMode }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({ filters: defaultFilters }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setLoading: (isLoading) => set({ isLoading }),
  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    })),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  removeTask: (taskId) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) })),
}));
