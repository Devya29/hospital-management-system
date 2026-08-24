// app/api/auth/google-calendar/route.ts
// Initiate Google Calendar OAuth 2.0 flow

import { NextResponse } from 'next/server'
import { getGoogleOAuthUrl } from '@/lib/google-calendar'
import { getUserRole } from '@/utils/get-role'

export async function GET(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    const state = JSON.stringify({ userId: userRole.userId, origin: new URL(req.url).origin })
    const url = getGoogleOAuthUrl(Buffer.from(state).toString('base64'))

    if (url === '#') {
      return NextResponse.json(
        {
          error:
            'Google OAuth credentials not configured in environment variables. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
        },
        { status: 400 },
      )
    }

    return NextResponse.redirect(url)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
