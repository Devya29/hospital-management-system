// app/api/appointments/[id]/cancel/route.ts
// Cancel appointment, release slot, update Google Calendar, and send email notification

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'
import { sendEmail, buildCancellationEmail } from '@/lib/resend'
import { deleteGoogleCalendarEvent } from '@/lib/google-calendar'

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

    const { reason } = await req.json().catch(() => ({ reason: '' }))
    const supabase = await createClient()

    // 1. Fetch appointment details with doctor and patient
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        appointment_date,
        start_time,
        end_time,
        status,
        google_event_id,
        doctor_id,
        patient_id,
        medical_staff: doctor_id (
          staff_id,
          user_id,
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

    if (fetchError || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    if (appointment.status === 'Cancelled') {
      return NextResponse.json(
        { error: 'Appointment is already cancelled' },
        { status: 400 },
      )
    }

    // 2. Authorization check (only owner patient, assigned doctor, or admin can cancel)
    const isPatientOwner = (appointment.patients as any)?.user_id === userRole.userId
    const isDoctorOwner = (appointment.medical_staff as any)?.user_id === userRole.userId
    const isAdmin = userRole.role === 'Admin'

    if (!isPatientOwner && !isDoctorOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to cancel this appointment' },
        { status: 403 },
      )
    }

    // 3. Mark appointment as Cancelled in database (releases database unique constraint)
    const { data: updated, error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'Cancelled',
        cancellation_reason: reason || 'Cancelled by user',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('appointment_id', appointmentId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Cancellation failed: ${updateError.message}` },
        { status: 500 },
      )
    }

    const patientUser = (appointment.patients as any)?.users
    const doctorUser = (appointment.medical_staff as any)?.users
    const patientName = patientUser ? `${patientUser.first_name} ${patientUser.last_name}` : 'Patient'
    const doctorName = doctorUser ? `${doctorUser.first_name} ${doctorUser.last_name}` : 'Doctor'

    // 4. Non-blocking Google Calendar cancellation
    if (appointment.google_event_id) {
      try {
        const { data: gcalToken } = await supabase
          .from('google_calendar_tokens')
          .select('access_token')
          .eq('user_id', userRole.userId)
          .maybeSingle()

        if (gcalToken?.access_token) {
          await deleteGoogleCalendarEvent(
            gcalToken.access_token,
            appointment.google_event_id,
          )
          await supabase
            .from('appointments')
            .update({ google_calendar_status: 'deleted' })
            .eq('appointment_id', appointmentId)
        }
      } catch (calErr: any) {
        console.error('[Google Calendar Delete Error]', calErr.message)
      }
    }

    // 5. Non-blocking Resend cancellation email
    if (patientUser?.email) {
      try {
        const cancelEmail = buildCancellationEmail({
          patientName,
          doctorName,
          date: appointment.appointment_date,
          time: `${appointment.start_time} - ${appointment.end_time}`,
          reason,
        })
        cancelEmail.to = patientUser.email

        const emailRes = await sendEmail(cancelEmail)
        await supabase.from('notifications').insert({
          recipient_email: patientUser.email,
          recipient_name: patientName,
          type: 'cancellation',
          subject: cancelEmail.subject,
          content_html: cancelEmail.html,
          status: emailRes.status,
        })
      } catch (emailErr: any) {
        console.error('[Cancellation Email Error]', emailErr.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Appointment cancelled successfully. Slot is now available for other patients.',
      appointment: updated,
    })
  } catch (err: any) {
    console.error('[Cancel Appointment Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
