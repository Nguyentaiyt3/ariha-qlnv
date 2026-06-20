import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCode(code: string) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export interface GoogleEventInput {
  title: string;
  description?: string;
  start: string; // ISO string
  end: string;   // ISO string
  taskId?: string;
}

export async function createGoogleEvent(tokens: Record<string, unknown>, event: GoogleEventInput) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start, timeZone: "Asia/Ho_Chi_Minh" },
      end: { dateTime: event.end, timeZone: "Asia/Ho_Chi_Minh" },
      extendedProperties: event.taskId
        ? { private: { ariha_task_id: event.taskId } }
        : undefined,
    },
  });

  return res.data;
}

export async function listGoogleEvents(tokens: Record<string, unknown>, timeMin: string, timeMax: string) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return res.data.items ?? [];
}

export async function deleteGoogleEvent(tokens: Record<string, unknown>, eventId: string) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  await calendar.events.delete({ calendarId: "primary", eventId });
}
