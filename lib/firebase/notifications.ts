// Notifications adapter
export async function subscribeUserNotifications(userId: string, cb: (notifs: unknown[]) => void): Promise<() => void> { cb([]); return () => {}; }
export async function markNotificationRead(userId: string, notifId: string): Promise<void> {}
