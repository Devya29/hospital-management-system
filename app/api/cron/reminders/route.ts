// app/api/cron/reminders/route.ts
// Automated Appointment Reminders (24 Hours and 2 Hours in advance)

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendEmail, buildReminderEmail } from '@/lib/resend'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const now = new Date()

    // 1. Find appointments scheduled in the next 24-26 hours (24h reminder)
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const in24hDateStr = in24h.toISOString().split('T')[0]

    const { data: upcoming24h } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        appointment_date,
        start_time,
        end_time,
        status,
        patient_id,
        medical_staff: doctor_id (
          specialization,
          users: user_id (first_name, last_name)
        ),
        patients: patient_id (
          users: user_id (first_name, last_name, email)
        )
      `,
      )
      .eq('appointment_date', in24hDateStr)
      .eq('status', 'Scheduled')

    let sentCount24h = 0

    if (upcoming24h) {
      for (const appt of upcoming24h) {
        const patientUser = (appt.patients as any)?.users
        const doctorUser = (appt.medical_staff as any)?.users

        if (patientUser?.email) {
          // Check for duplicate reminder
          const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('recipient_email', patientUser.email)
            .eq('type', 'reminder_24h')
            .contains('metadata', { appointment_id: appt.appointment_id })
            .maybeSingle()

          if (!existingNotif) {
            const email = buildReminderEmail({
              patientName: `${patientUser.first_name} ${patientUser.last_name}`,
              doctorName: doctorUser ? `${doctorUser.first_name} ${doctorUser.last_name}` : 'Doctor',
              specialization: (appt.medical_staff as any)?.specialization || 'General',
              date: appt.appointment_date,
              time: `${appt.start_time} - ${appt.end_time}`,
              hoursRemaining: 24,
            })
            email.to = patientUser.email

            const res = await sendEmail(email)
            try {
              await supabase.from('notifications').insert({
                recipient_email: patientUser.email,
                recipient_name: `${patientUser.first_name} ${patientUser.last_name}`,
                type: 'reminder_24h',
                subject: email.subject,
                content_html: email.html,
                status: res.status,
                metadata: { appointment_id: appt.appointment_id },
                sent_at: res.success ? new Date().toISOString() : null,
              })
            } catch {}

            if (res.success) sentCount24h++
          }
        }
      }
    }

    // 2. Find appointments scheduled today within next 2 hours
    const todayStr = now.toISOString().split('T')[0]
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const targetMinStart = currentMinutes + 90 // 1.5h
    const targetMinEnd = currentMinutes + 150   // 2.5h

    const { data: upcomingToday } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        appointment_date,
        start_time,
        end_time,
        status,
        patient_id,
        medical_staff: doctor_id (
          specialization,
          users: user_id (first_name, last_name)
        ),
        patients: patient_id (
          users: user_id (first_name, last_name, email)
        )
      `,
      )
      .eq('appointment_date', todayStr)
      .eq('status', 'Scheduled')

    let sentCount2h = 0

    if (upcomingToday) {
      for (const appt of upcomingToday) {
        const [h, m] = (appt.start_time || '00:00').split(':').map(Number)
        const apptMinutes = (h || 0) * 60 + (m || 0)

        if (apptMinutes >= targetMinStart && apptMinutes <= targetMinEnd) {
          const patientUser = (appt.patients as any)?.users
          const doctorUser = (appt.medical_staff as any)?.users

          if (patientUser?.email) {
            // Check for duplicate
            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('recipient_email', patientUser.email)
              .eq('type', 'reminder_2h')
              .contains('metadata', { appointment_id: appt.appointment_id })
              .maybeSingle()

            if (!existingNotif) {
              const email = buildReminderEmail({
                patientName: `${patientUser.first_name} ${patientUser.last_name}`,
                doctorName: doctorUser ? `${doctorUser.first_name} ${doctorUser.last_name}` : 'Doctor',
                specialization: (appt.medical_staff as any)?.specialization || 'General',
                date: appt.appointment_date,
                time: `${appt.start_time} - ${appt.end_time}`,
                hoursRemaining: 2,
              })
              email.to = patientUser.email

              const res = await sendEmail(email)
              try {
                await supabase.from('notifications').insert({
                  recipient_email: patientUser.email,
                  recipient_name: `${patientUser.first_name} ${patientUser.last_name}`,
                  type: 'reminder_2h',
                  subject: email.subject,
                  content_html: email.html,
                  status: res.status,
                  metadata: { appointment_id: appt.appointment_id },
                  sent_at: res.success ? new Date().toISOString() : null,
                })
              } catch {}

              if (res.success) sentCount2h++
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: {
        sent24h: sentCount24h,
        sent2h: sentCount2h,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (err: any) {
    console.error('[Reminder Cron Error]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
