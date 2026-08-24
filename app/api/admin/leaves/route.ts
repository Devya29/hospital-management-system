// app/api/admin/leaves/route.ts
// Doctor Leave Management with Automated Patient Conflict Detection & Notification

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'
import { sendEmail, buildDoctorLeaveConflictEmail } from '@/lib/resend'

// GET: List all doctor leaves
export async function GET(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: leaves, error } = await supabase
      .from('doctor_leaves')
      .select(
        `
        leave_id,
        doctor_id,
        start_date,
        end_date,
        reason,
        status,
        created_at,
        medical_staff: doctor_id (
          staff_id,
          specialization,
          users (first_name, last_name, email)
        )
      `,
      )
      .order('start_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(leaves || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: Add new doctor leave & resolve existing appointment conflicts
export async function POST(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole || (userRole.role !== 'Admin' && userRole.role !== 'Doctor')) {
      return NextResponse.json(
        { error: 'Forbidden: Only admins or doctors can schedule leave' },
        { status: 403 },
      )
    }

    const { doctor_id, start_date, end_date, reason } = await req.json()

    if (!doctor_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Doctor ID, start date, and end date are required' },
        { status: 400 },
      )
    }

    if (new Date(end_date) < new Date(start_date)) {
      return NextResponse.json(
        { error: 'End date cannot be earlier than start date' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // If caller is Doctor, ensure they can only schedule leaves for themselves
    if (userRole.role === 'Doctor') {
      const { data: staff } = await supabase
        .from('medical_staff')
        .select('staff_id')
        .eq('user_id', userRole.userId)
        .maybeSingle()

      if (!staff || staff.staff_id !== Number(doctor_id)) {
        return NextResponse.json(
          { error: 'Forbidden: Doctors can only schedule leaves for themselves' },
          { status: 403 },
        )
      }
    }

    // 1. Insert leave record
    const { data: leave, error: leaveError } = await supabase
      .from('doctor_leaves')
      .insert({
        doctor_id,
        start_date,
        end_date,
        reason: reason || 'Scheduled Leave',
        status: 'Approved',
        created_by: userRole.userId,
      })
      .select()
      .single()

    if (leaveError) {
      console.error('[Doctor Leave Insert Error]', leaveError)
      return NextResponse.json({ error: leaveError.message }, { status: 500 })
    }

    // 2. Find all existing active appointments affected by this leave
    const { data: impactedAppointments, error: apptError } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        appointment_date,
        start_time,
        end_time,
        status,
        patient_id,
        patients: patient_id (
          patient_id,
          users: user_id (
            first_name,
            last_name,
            email,
            phone_number
          )
        ),
        medical_staff: doctor_id (
          users (first_name, last_name)
        )
      `,
      )
      .eq('doctor_id', doctor_id)
      .gte('appointment_date', start_date)
      .lte('appointment_date', end_date)
      .in('status', ['Scheduled'])

    const impactedCount = impactedAppointments?.length || 0

    // 3. Mark affected appointments as 'Reschedule_Required' and notify patients
    if (impactedCount > 0 && impactedAppointments) {
      const apptIds = impactedAppointments.map((a) => a.appointment_id)

      await supabase
        .from('appointments')
        .update({
          status: 'Reschedule_Required',
          cancellation_reason: `Doctor on leave (${start_date} to ${end_date}): ${reason || 'Schedule Conflict'}`,
          updated_at: new Date().toISOString(),
        })
        .in('appointment_id', apptIds)

      // 4. Send non-blocking emails to all affected patients
      for (const appt of impactedAppointments) {
        const patientUser = (appt.patients as any)?.users
        const doctorUser = (appt.medical_staff as any)?.users
        const patientEmail = patientUser?.email
        const patientName = patientUser
          ? `${patientUser.first_name} ${patientUser.last_name}`
          : 'Patient'
        const doctorName = doctorUser
          ? `${doctorUser.first_name} ${doctorUser.last_name}`
          : 'Doctor'

        if (patientEmail) {
          try {
            const conflictEmail = buildDoctorLeaveConflictEmail({
              patientName,
              doctorName,
              date: appt.appointment_date,
              time: `${appt.start_time} - ${appt.end_time}`,
              reason,
            })
            conflictEmail.to = patientEmail

            const emailResult = await sendEmail(conflictEmail)

            await supabase.from('notifications').insert({
              recipient_email: patientEmail,
              recipient_name: patientName,
              type: 'leave_conflict',
              subject: conflictEmail.subject,
              content_html: conflictEmail.html,
              status: emailResult.status,
              error_message: emailResult.error || null,
              metadata: {
                appointment_id: appt.appointment_id,
                leave_id: leave.leave_id,
              },
            })
          } catch (err: any) {
            console.error(`[Leave Conflict Email Failed for appt #${appt.appointment_id}]`, err.message)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Leave recorded successfully. ${impactedCount} affected appointment(s) have been flagged for priority rescheduling and patients notified.`,
      leave,
      impactedCount,
      impactedAppointments: impactedAppointments || [],
    })
  } catch (err: any) {
    console.error('[Doctor Leave Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE: Cancel a leave
export async function DELETE(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole || userRole.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const leaveId = searchParams.get('id')

    if (!leaveId) {
      return NextResponse.json({ error: 'Leave ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    await supabase.from('doctor_leaves').delete().eq('leave_id', Number(leaveId))

    return NextResponse.json({ success: true, message: 'Leave removed' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
