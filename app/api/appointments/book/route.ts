// app/api/appointments/book/route.ts
// Robust Appointment Booking with Database-Level Double-Booking Protection & Non-Blocking AI/Email/Calendar Integration

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'
import { generatePreVisitSummary } from '@/lib/groq'
import {
  sendEmail,
  buildBookingConfirmationEmail,
  buildDoctorAppointmentNotificationEmail,
} from '@/lib/resend'
import {
  createGoogleCalendarEvent,
  formatCalendarDateTime,
  refreshAccessToken,
} from '@/lib/google-calendar'
import { timeToMinutes } from '@/lib/slot-engine'

export async function POST(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      doctor_id,
      appointment_date,
      start_time,
      end_time,
      symptoms,
      patient_notes,
      hold_token,
      target_patient_id, // For Admin or Doctor booking on behalf
    } = await req.json()

    // 1. Validate inputs
    if (!doctor_id || !appointment_date || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'Missing required appointment parameters' },
        { status: 400 },
      )
    }

    // 2. Validate date is not in the past
    const todayStr = new Date().toISOString().split('T')[0]
    if (appointment_date < todayStr) {
      return NextResponse.json(
        { error: 'Cannot book appointments for past dates' },
        { status: 400 },
      )
    }

    const startMin = timeToMinutes(start_time)
    const endMin = timeToMinutes(end_time)
    if (startMin >= endMin) {
      return NextResponse.json(
        { error: 'Invalid slot time: start_time must precede end_time' },
        { status: 400 },
      )
    }

    if (appointment_date === todayStr) {
      const now = new Date()
      const currentMin = now.getHours() * 60 + now.getMinutes()
      if (startMin <= currentMin) {
        return NextResponse.json(
          { error: 'Cannot book past time slots for today' },
          { status: 400 },
        )
      }
    }

    const supabase = await createClient()

    // 3. Resolve Patient ID with strict authorization
    let patientId: number

    if (
      target_patient_id &&
      (userRole.role === 'Admin' || userRole.role === 'Doctor')
    ) {
      patientId = Number(target_patient_id)
    } else {
      // Find or create patient record for the logged-in user
      const { data: existingPatient } = await supabase
        .from('patients')
        .select('patient_id')
        .eq('user_id', userRole.userId)
        .maybeSingle()

      if (existingPatient) {
        patientId = existingPatient.patient_id
      } else {
        // Auto-create patient profile if first time
        const { data: newPatient, error: patientCreateError } = await supabase
          .from('patients')
          .insert({
            user_id: userRole.userId,
            blood_type: 'O+',
          })
          .select('patient_id')
          .single()

        if (patientCreateError || !newPatient) {
          console.error('[Patient Init Error]', patientCreateError)
          return NextResponse.json(
            { error: 'Failed to initialize patient profile' },
            { status: 500 },
          )
        }
        patientId = newPatient.patient_id
      }
    }

    // 4. Server-Side Doctor Shift & Working Hours Validation
    const targetDateObj = new Date(`${appointment_date}T00:00:00`)
    const dayOfWeek = targetDateObj.getDay()

    const { data: workingHour } = await supabase
      .from('doctor_working_hours')
      .select('*')
      .eq('doctor_id', doctor_id)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (workingHour && !workingHour.is_available) {
      return NextResponse.json(
        { error: 'Doctor does not hold clinic hours on this day of the week.' },
        { status: 409 },
      )
    }

    if (workingHour) {
      const shiftStartMin = timeToMinutes(workingHour.start_time)
      const shiftEndMin = timeToMinutes(workingHour.end_time)
      if (startMin < shiftStartMin || endMin > shiftEndMin) {
        return NextResponse.json(
          { error: `Requested time is outside doctor clinic hours (${workingHour.start_time} - ${workingHour.end_time})` },
          { status: 400 },
        )
      }
    }

    // 5. Pre-check Doctor Leaves
    const { data: leaves } = await supabase
      .from('doctor_leaves')
      .select('leave_id, reason')
      .eq('doctor_id', doctor_id)
      .eq('status', 'Approved')
      .lte('start_date', appointment_date)
      .gte('end_date', appointment_date)

    if (leaves && leaves.length > 0) {
      return NextResponse.json(
        {
          error:
            'Doctor is unavailable/on leave on this date. Please select another date.',
        },
        { status: 409 },
      )
    }

    // 6. Server-Side Overlapping Interval Check
    const { data: existingAppts } = await supabase
      .from('appointments')
      .select('appointment_id, start_time, end_time')
      .eq('doctor_id', doctor_id)
      .eq('appointment_date', appointment_date)
      .neq('status', 'Cancelled')

    if (existingAppts && existingAppts.length > 0) {
      const hasOverlap = existingAppts.some((appt) => {
        const apptStart = timeToMinutes(appt.start_time)
        const apptEnd = timeToMinutes(appt.end_time)
        return Math.max(startMin, apptStart) < Math.min(endMin, apptEnd)
      })

      if (hasOverlap) {
        return NextResponse.json(
          {
            error:
              'This slot overlaps with an existing appointment. Please choose a different time slot.',
            code: 'DOUBLE_BOOKING_PREVENTED',
          },
          { status: 409 },
        )
      }
    }

    // 7. DATABASE-LEVEL ATOMIC INSERT WITH UNIQUE CONSTRAINT ENFORCEMENT
    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert({
        doctor_id,
        patient_id: patientId,
        appointment_date,
        start_time,
        end_time,
        status: 'Scheduled',
        symptoms: symptoms || '',
        patient_notes: patient_notes || '',
        google_calendar_status: 'pending',
        created_at: new Date().toISOString(),
      })
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
        medical_staff: doctor_id (
          staff_id,
          specialization,
          users: user_id (first_name, last_name, email)
        ),
        patients: patient_id (
          patient_id,
          users: user_id (first_name, last_name, email, phone_number)
        )
      `,
      )
      .single()

    if (insertError) {
      console.error('[Booking Database Error]', insertError)
      if (
        insertError.code === '23505' ||
        insertError.message?.includes('duplicate key') ||
        insertError.message?.includes('idx_unique_doctor_slot_active')
      ) {
        return NextResponse.json(
          {
            error:
              'This slot was just booked by another user. Please choose a different time slot.',
            code: 'DOUBLE_BOOKING_PREVENTED',
          },
          { status: 409 },
        )
      }

      return NextResponse.json(
        { error: `Booking failed: ${insertError.message}` },
        { status: 500 },
      )
    }

    // 8. Clean up any slot hold
    if (hold_token) {
      supabase.from('slot_holds').delete().eq('hold_token', hold_token).then()
    }

    // 9. ASYNC DECOUPLED OPERATIONS (Groq AI, Resend Email, Google Calendar)
    const doctorUser = (appointment.medical_staff as any)?.users
    const patientUser = (appointment.patients as any)?.users
    const doctorName = doctorUser ? `${doctorUser.first_name} ${doctorUser.last_name}` : 'Doctor'
    const patientName = patientUser ? `${patientUser.first_name} ${patientUser.last_name}` : 'Patient'
    const specialization = (appointment.medical_staff as any)?.specialization || 'General Medicine'

    // 9A. Groq AI Pre-Visit Summary
    let aiSummaryData: any = null
    try {
      if (symptoms && symptoms.trim()) {
        const aiSummary = await generatePreVisitSummary(symptoms)
        aiSummaryData = aiSummary

        await supabase.from('pre_visit_summaries').insert({
          appointment_id: appointment.appointment_id,
          urgency: aiSummary.urgency,
          chief_complaint: aiSummary.chief_complaint,
          suggested_questions: aiSummary.suggested_questions,
          raw_response: aiSummary.raw_response,
          status: aiSummary.status,
          error_message: aiSummary.error_message || null,
        })
      }
    } catch (aiErr: any) {
      console.error('[Background Groq AI Error - Non Blocking]', aiErr.message)
      try {
        await supabase.from('pre_visit_summaries').insert({
          appointment_id: appointment.appointment_id,
          urgency: 'Medium',
          chief_complaint: symptoms ? symptoms.slice(0, 100) : 'Intake symptoms',
          suggested_questions: [
            'What are your primary symptoms?',
            'When did symptoms first begin?',
            'Are there any relieving or aggravating factors?',
          ],
          status: 'failed',
          error_message: aiErr.message,
        })
      } catch {}
    }

    // 9B. Resend Email Notifications (Patient Confirmation & Doctor Notification)
    try {
      if (patientUser?.email) {
        const patientEmailPayload = buildBookingConfirmationEmail({
          patientName,
          doctorName,
          specialization,
          date: appointment_date,
          time: `${start_time} - ${end_time}`,
          appointmentId: appointment.appointment_id,
        })
        patientEmailPayload.to = patientUser.email

        const emailResult = await sendEmail(patientEmailPayload)
        try {
          await supabase.from('notifications').insert({
            recipient_email: patientUser.email,
            recipient_name: patientName,
            user_id: patientUser.user_id,
            type: 'booking_confirmation',
            subject: patientEmailPayload.subject,
            content_html: patientEmailPayload.html,
            status: emailResult.status,
            error_message: emailResult.error || null,
            sent_at: emailResult.success ? new Date().toISOString() : null,
          })
        } catch {}
      }

      if (doctorUser?.email) {
        const docEmailPayload = buildDoctorAppointmentNotificationEmail({
          doctorName,
          doctorEmail: doctorUser.email,
          patientName,
          date: appointment_date,
          time: `${start_time} - ${end_time}`,
          symptoms: symptoms || 'None specified',
          urgency: aiSummaryData?.urgency || 'Low',
          appointmentId: appointment.appointment_id,
        })

        const docEmailResult = await sendEmail(docEmailPayload)
        try {
          await supabase.from('notifications').insert({
            recipient_email: doctorUser.email,
            recipient_name: doctorName,
            user_id: doctorUser.user_id,
            type: 'doctor_alert',
            subject: docEmailPayload.subject,
            content_html: docEmailPayload.html,
            status: docEmailResult.status,
            error_message: docEmailResult.error || null,
            sent_at: docEmailResult.success ? new Date().toISOString() : null,
          })
        } catch {}
      }
    } catch (emailErr: any) {
      console.error('[Background Email Error - Non Blocking]', emailErr.message)
    }

    // 9C. Google Calendar Synchronization (with automatic token refresh)
    try {
      const { data: gcalToken } = await supabase
        .from('google_calendar_tokens')
        .select('*')
        .eq('user_id', userRole.userId)
        .maybeSingle()

      if (gcalToken?.access_token) {
        let validToken = gcalToken.access_token

        // Refresh token if expired
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

        const startIso = formatCalendarDateTime(appointment_date, start_time)
        const endIso = formatCalendarDateTime(appointment_date, end_time)

        const calResult = await createGoogleCalendarEvent(validToken, {
          summary: `Medical Consultation: Dr. ${doctorName} & ${patientName}`,
          description: `Appointment ID: #${appointment.appointment_id}\nSpecialization: ${specialization}\nSymptoms: ${symptoms || 'General Consultation'}`,
          startDateTime: startIso,
          endDateTime: endIso,
          attendeeEmail: patientUser?.email,
          location: 'Hospital Clinic Room',
        })

        if (calResult.success && calResult.eventId) {
          await supabase
            .from('appointments')
            .update({
              google_event_id: calResult.eventId,
              google_calendar_status: 'synced',
            })
            .eq('appointment_id', appointment.appointment_id)
        } else {
          await supabase
            .from('appointments')
            .update({ google_calendar_status: 'failed' })
            .eq('appointment_id', appointment.appointment_id)
        }
      }
    } catch (calErr: any) {
      console.error('[Background Google Calendar Error - Non Blocking]', calErr.message)
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Appointment booked successfully',
        appointment,
        preVisitSummary: aiSummaryData,
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[Booking Fatal Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
