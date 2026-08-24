// app/api/appointments/[id]/reschedule/route.ts
// Atomically reschedule an appointment to a new date/time with concurrency and overlap checks

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'
import { sendEmail, buildBookingConfirmationEmail } from '@/lib/resend'
import {
  updateGoogleCalendarEvent,
  formatCalendarDateTime,
  refreshAccessToken,
} from '@/lib/google-calendar'
import { timeToMinutes } from '@/lib/slot-engine'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const appointmentId = parseInt(id, 10)

    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: 'Invalid appointment ID' }, { status: 400 })
    }

    const userRole = await getUserRole()
    if (!userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { new_date, new_start_time, new_end_time } = await req.json()

    if (!new_date || !new_start_time || !new_end_time) {
      return NextResponse.json(
        { error: 'New date, start time, and end time are required' },
        { status: 400 },
      )
    }

    // 1. Date not in past check
    const todayStr = new Date().toISOString().split('T')[0]
    if (new_date < todayStr) {
      return NextResponse.json(
        { error: 'Cannot reschedule to past dates' },
        { status: 400 },
      )
    }

    const startMin = timeToMinutes(new_start_time)
    const endMin = timeToMinutes(new_end_time)
    if (startMin >= endMin) {
      return NextResponse.json(
        { error: 'Start time must precede end time' },
        { status: 400 },
      )
    }

    if (new_date === todayStr) {
      const now = new Date()
      const currentMin = now.getHours() * 60 + now.getMinutes()
      if (startMin <= currentMin) {
        return NextResponse.json(
          { error: 'Cannot reschedule to a past time slot for today' },
          { status: 400 },
        )
      }
    }

    const supabase = await createClient()

    // 2. Fetch current appointment
    const { data: currentAppt, error: fetchError } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        doctor_id,
        patient_id,
        appointment_date,
        start_time,
        end_time,
        status,
        symptoms,
        google_event_id,
        medical_staff: doctor_id (
          staff_id,
          specialization,
          users: user_id (first_name, last_name, email)
        ),
        patients: patient_id (
          patient_id,
          user_id,
          users: user_id (first_name, last_name, email)
        )
      `,
      )
      .eq('appointment_id', appointmentId)
      .single()

    if (fetchError || !currentAppt) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // 3. Authorization check
    const isPatientOwner = (currentAppt.patients as any)?.user_id === userRole.userId
    const isDoctorOwner = (currentAppt.medical_staff as any)?.user_id === userRole.userId
    const isAdmin = userRole.role === 'Admin'

    if (!isPatientOwner && !isDoctorOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 4. Server-side Doctor Working Hours Validation
    const targetDateObj = new Date(`${new_date}T00:00:00`)
    const dayOfWeek = targetDateObj.getDay()

    const { data: workingHour } = await supabase
      .from('doctor_working_hours')
      .select('*')
      .eq('doctor_id', currentAppt.doctor_id)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (workingHour && !workingHour.is_available) {
      return NextResponse.json(
        { error: 'Doctor does not hold clinic hours on this day.' },
        { status: 409 },
      )
    }

    if (workingHour) {
      const shiftStart = timeToMinutes(workingHour.start_time)
      const shiftEnd = timeToMinutes(workingHour.end_time)
      if (startMin < shiftStart || endMin > shiftEnd) {
        return NextResponse.json(
          { error: `Time is outside doctor working hours (${workingHour.start_time} - ${workingHour.end_time})` },
          { status: 400 },
        )
      }
    }

    // 5. Check if doctor is on leave on the new date
    const { data: leaves } = await supabase
      .from('doctor_leaves')
      .select('leave_id')
      .eq('doctor_id', currentAppt.doctor_id)
      .eq('status', 'Approved')
      .lte('start_date', new_date)
      .gte('end_date', new_date)

    if (leaves && leaves.length > 0) {
      return NextResponse.json(
        { error: 'Doctor is on scheduled leave on the selected date.' },
        { status: 409 },
      )
    }

    // 6. Overlap Check (Excluding the current appointment itself)
    const { data: otherAppts } = await supabase
      .from('appointments')
      .select('appointment_id, start_time, end_time')
      .eq('doctor_id', currentAppt.doctor_id)
      .eq('appointment_date', new_date)
      .neq('status', 'Cancelled')
      .neq('appointment_id', appointmentId)

    if (otherAppts && otherAppts.length > 0) {
      const hasOverlap = otherAppts.some((appt) => {
        const apptStart = timeToMinutes(appt.start_time)
        const apptEnd = timeToMinutes(appt.end_time)
        return Math.max(startMin, apptStart) < Math.min(endMin, apptEnd)
      })

      if (hasOverlap) {
        return NextResponse.json(
          { error: 'The requested new slot is already booked. Please choose another.' },
          { status: 409 },
        )
      }
    }

    // 7. Update the appointment to the new slot
    const { data: updatedAppt, error: updateError } = await supabase
      .from('appointments')
      .update({
        appointment_date: new_date,
        start_time: new_start_time,
        end_time: new_end_time,
        status: 'Scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('appointment_id', appointmentId)
      .select()
      .single()

    if (updateError) {
      if (
        updateError.code === '23505' ||
        updateError.message?.includes('duplicate') ||
        updateError.message?.includes('idx_unique_doctor_slot_active')
      ) {
        return NextResponse.json(
          { error: 'The requested new slot is already booked. Please choose another.' },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: `Rescheduling failed: ${updateError.message}` },
        { status: 500 },
      )
    }

    const doctorUser = (currentAppt.medical_staff as any)?.users
    const patientUser = (currentAppt.patients as any)?.users
    const doctorName = doctorUser ? `${doctorUser.first_name} ${doctorUser.last_name}` : 'Doctor'
    const patientName = patientUser ? `${patientUser.first_name} ${patientUser.last_name}` : 'Patient'
    const specialization = (currentAppt.medical_staff as any)?.specialization || 'General Practice'

    // 8. Non-blocking Google Calendar Update
    if (currentAppt.google_event_id) {
      try {
        const { data: gcalToken } = await supabase
          .from('google_calendar_tokens')
          .select('*')
          .eq('user_id', userRole.userId)
          .maybeSingle()

        if (gcalToken?.access_token) {
          let validToken = gcalToken.access_token

          if (
            gcalToken.expiry_date &&
            Date.now() > gcalToken.expiry_date &&
            gcalToken.refresh_token
          ) {
            const refreshed = await refreshAccessToken(gcalToken.refresh_token)
            if (refreshed) {
              validToken = refreshed
              await supabase
                .from('google_calendar_tokens')
                .update({
                  access_token: refreshed,
                  expiry_date: Date.now() + 3500 * 1000,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', gcalToken.id)
            }
          }

          const startIso = formatCalendarDateTime(new_date, new_start_time)
          const endIso = formatCalendarDateTime(new_date, new_end_time)

          await updateGoogleCalendarEvent(
            validToken,
            currentAppt.google_event_id,
            {
              summary: `Rescheduled: Consultation with Dr. ${doctorName}`,
              description: `Appointment #${appointmentId} rescheduled to ${new_date}`,
              startDateTime: startIso,
              endDateTime: endIso,
            },
          )
        }
      } catch (calErr: any) {
        console.error('[Google Calendar Reschedule Sync Error]', calErr.message)
      }
    }

    // 9. Non-blocking Email Confirmation
    if (patientUser?.email) {
      try {
        const email = buildBookingConfirmationEmail({
          patientName,
          doctorName,
          specialization,
          date: new_date,
          time: `${new_start_time} - ${new_end_time}`,
          appointmentId,
        })
        email.subject = `Appointment Rescheduled - Dr. ${doctorName} on ${new_date}`
        email.to = patientUser.email

        const emailRes = await sendEmail(email)
        try {
          await supabase.from('notifications').insert({
            recipient_email: patientUser.email,
            recipient_name: patientName,
            user_id: patientUser.user_id,
            type: 'booking_confirmation',
            subject: email.subject,
            content_html: email.html,
            status: emailRes.status,
          })
        } catch {}
      } catch (emailErr: any) {
        console.error('[Reschedule Email Error]', emailErr.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Appointment successfully rescheduled.',
      appointment: updatedAppt,
    })
  } catch (err: any) {
    console.error('[Reschedule Fatal Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
