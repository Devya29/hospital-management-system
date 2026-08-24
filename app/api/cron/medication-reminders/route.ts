// app/api/cron/medication-reminders/route.ts
// Background processing for daily patient medication reminders

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendEmail } from '@/lib/resend'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const todayStr = new Date().toISOString().split('T')[0]

    // Fetch active reminders for today
    const { data: reminders } = await supabase
      .from('medication_reminders')
      .select(
        `
        id,
        patient_id,
        medicine_name,
        dosage,
        scheduled_time,
        start_date,
        end_date,
        last_sent_at,
        patients: patient_id (
          users: user_id (first_name, last_name, email)
        )
      `,
      )
      .eq('is_active', true)
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)

    let sentCount = 0

    if (reminders) {
      for (const rem of reminders) {
        const lastSentDate = rem.last_sent_at ? rem.last_sent_at.split('T')[0] : null
        if (lastSentDate === todayStr) {
          // Already sent today
          continue
        }

        const patientUser = (rem.patients as any)?.users
        if (patientUser?.email) {
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0d9488;">💊 Daily Medication Reminder</h2>
              <p>Hello <strong>${patientUser.first_name}</strong>,</p>
              <p>This is your daily reminder to take your prescribed medication:</p>
              <div style="background-color: #f0fdfa; padding: 16px; border-radius: 6px; margin: 16px 0;">
                <p style="margin: 4px 0; font-size: 16px;"><strong>Medicine:</strong> ${rem.medicine_name}</p>
                <p style="margin: 4px 0;"><strong>Dosage:</strong> ${rem.dosage}</p>
                <p style="margin: 4px 0;"><strong>Scheduled Time:</strong> ${rem.scheduled_time}</p>
              </div>
              <p style="font-size: 13px; color: #64748b;">Please follow your doctor's instructions carefully.</p>
            </div>
          `

          const res = await sendEmail({
            to: patientUser.email,
            subject: `Medication Reminder: ${rem.medicine_name} (${rem.dosage})`,
            html,
            type: 'medication_reminder',
          })

          if (res.success) {
            await supabase
              .from('medication_reminders')
              .update({ last_sent_at: new Date().toISOString() })
              .eq('id', rem.id)

            sentCount++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: sentCount,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
