// app/api/auth/google-calendar/callback/route.ts
// Google Calendar OAuth 2.0 callback: exchange code, securely store tokens, redirect to dashboard

import { NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/google-calendar'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code) {
    console.error('[Google OAuth Callback Error]', error)
    return NextResponse.redirect(new URL('/patient?gcal_error=access_denied', req.url))
  }

  try {
    let stateData: any = {}
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
      } catch {}
    }

    const userRole = await getUserRole()
    const targetUserId = stateData.userId || userRole?.userId

    if (!targetUserId) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    const tokenData = await exchangeCodeForTokens(code)

    if (!tokenData || !tokenData.access_token) {
      return NextResponse.redirect(new URL('/patient?gcal_error=token_exchange_failed', req.url))
    }

    const supabase = await createClient()
    const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000

    await supabase.from('google_calendar_tokens').upsert(
      {
        user_id: targetUserId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
        expiry_date: expiryDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    const returnRole = userRole?.role?.toLowerCase() || 'patient'
    return NextResponse.redirect(new URL(`/${returnRole}?gcal_connected=true`, req.url))
  } catch (err: any) {
    console.error('[Google OAuth Callback Fatal Exception]', err)
    return NextResponse.redirect(new URL('/patient?gcal_error=server_error', req.url))
  }
}
