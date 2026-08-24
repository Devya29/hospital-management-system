// lib/google-calendar.ts
// Google Calendar OAuth 2.0 and Event Lifecycle (Create, Update, Delete) with automatic token refresh

export interface CalendarEventPayload {
  summary: string
  description: string
  startDateTime: string // ISO string e.g. "2026-08-25T10:00:00"
  endDateTime: string   // ISO string e.g. "2026-08-25T10:30:00"
  timeZone?: string
  attendeeEmail?: string
  location?: string
}

export interface CalendarSyncResult {
  success: boolean
  eventId?: string
  status: 'synced' | 'failed' | 'pending' | 'deleted'
  error?: string
}

export interface StoredCalendarToken {
  id?: number
  user_id?: string
  access_token: string
  refresh_token?: string | null
  expiry_date?: number | null
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/**
 * Generate Google OAuth 2.0 authorization URL
 */
export function getGoogleOAuthUrl(state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return '#'
  }

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

  if (state) {
    params.append('state', state)
  }

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange Authorization Code for Access & Refresh Tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    console.warn('[Google Calendar] OAuth credentials not fully configured.')
    return null
  }

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Google OAuth Token Error]', err)
      return null
    }

    return await res.json()
  } catch (error: any) {
    console.error('[Google OAuth Exchange Failed]', error.message)
    return null
  }
}

/**
 * Refresh expired Access Token using Refresh Token
 */
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret || !refreshToken) return null

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    return data.access_token
  } catch {
    return null
  }
}

/**
 * Cleanly format ISO datetime string for Google Calendar API
 */
export function formatCalendarDateTime(dateStr: string, timeStr: string): string {
  const cleanTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr.substring(0, 8)
  return `${dateStr}T${cleanTime}`
}

/**
 * Create a Calendar Event on primary calendar
 * CRITICAL: Failure MUST NEVER fail the appointment booking.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: CalendarEventPayload,
): Promise<CalendarSyncResult> {
  if (!accessToken || accessToken === 'simulated') {
    return {
      success: true,
      eventId: `gcal_sim_${Date.now()}`,
      status: 'synced',
    }
  }

  try {
    const timeZone = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    const res = await fetch(GOOGLE_CALENDAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        location: event.location || 'Hospital Clinic Room',
        start: { dateTime: event.startDateTime, timeZone },
        end: { dateTime: event.endDateTime, timeZone },
        attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'email', minutes: 1440 }, // 24h
          ],
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Google Calendar Event Creation Failed]', err)
      return { success: false, status: 'failed', error: err }
    }

    const data = await res.json()
    return {
      success: true,
      eventId: data.id,
      status: 'synced',
    }
  } catch (error: any) {
    console.error('[Google Calendar Exception]', error.message)
    return { success: false, status: 'failed', error: error.message }
  }
}

/**
 * Update a Calendar Event (e.g., when rescheduled)
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventPayload,
): Promise<CalendarSyncResult> {
  if (!accessToken || !eventId || eventId.startsWith('gcal_sim_')) {
    return { success: true, eventId, status: 'synced' }
  }

  try {
    const timeZone = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    const res = await fetch(`${GOOGLE_CALENDAR_API_URL}/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startDateTime, timeZone },
        end: { dateTime: event.endDateTime, timeZone },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { success: false, status: 'failed', error: err }
    }

    const data = await res.json()
    return { success: true, eventId: data.id, status: 'synced' }
  } catch (error: any) {
    return { success: false, status: 'failed', error: error.message }
  }
}

/**
 * Delete / Cancel a Calendar Event
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<CalendarSyncResult> {
  if (!accessToken || !eventId || eventId.startsWith('gcal_sim_')) {
    return { success: true, status: 'deleted' }
  }

  try {
    const res = await fetch(`${GOOGLE_CALENDAR_API_URL}/${eventId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const err = await res.text()
      return { success: false, status: 'failed', error: err }
    }

    return { success: true, status: 'deleted' }
  } catch (error: any) {
    return { success: false, status: 'failed', error: error.message }
  }
}
