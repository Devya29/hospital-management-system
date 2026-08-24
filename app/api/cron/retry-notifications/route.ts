// app/api/cron/retry-notifications/route.ts
// Background retry processor for failed notifications

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendEmail } from '@/lib/resend'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()

    // Fetch failed notifications that haven't exceeded 3 retries
    const { data: failedNotifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('status', 'failed')
      .lt('retry_count', 3)
      .limit(20)

    let retried = 0
    let resolved = 0

    if (failedNotifs) {
      for (const notif of failedNotifs) {
        retried++
        const res = await sendEmail({
          to: notif.recipient_email,
          subject: notif.subject,
          html: notif.content_html,
          type: notif.type,
        })

        if (res.success) {
          await supabase
            .from('notifications')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null,
            })
            .eq('id', notif.id)

          resolved++
        } else {
          await supabase
            .from('notifications')
            .update({
              retry_count: (notif.retry_count || 0) + 1,
              error_message: res.error,
            })
            .eq('id', notif.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      retried,
      resolved,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
