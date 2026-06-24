// Notifications adapter
export async function subscribeUserNotifications(userId, cb) { cb([]); return () => {}; }
export async function markNotificationRead(userId, notifId) {}
