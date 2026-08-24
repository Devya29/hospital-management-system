// app/api/doctor/appointments/[id]/complete/route.ts
// Complete appointment, record clinical notes, create structured prescriptions & medication schedule, and trigger Groq AI Post-Visit Summary

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'
import { generatePostVisitSummary } from '@/lib/groq'

/**
 * Helper to parse medication timing strings into discrete daily reminder times
 */
function parseMedicationScheduleTimes(timing?: string, frequency?: string): string[] {
  const times: string[] = []
  const text = `${timing || ''} ${frequency || ''}`.toLowerCase()

  if (text.includes('morning') || text.includes('breakfast')) {
    times.push('08:00:00')
  }
  if (text.includes('afternoon') || text.includes('noon') || text.includes('lunch')) {
    times.push('13:00:00')
  }
  if (text.includes('night') || text.includes('evening') || text.includes('dinner') || text.includes('bedtime')) {
    times.push('20:00:00')
  }

  // If no explicit keywords matched, deduce from frequency count
  if (times.length === 0) {
    if (text.includes('twice') || text.includes('2 times') || text.includes('2x')) {
      times.push('08:00:00', '20:00:00')
    } else if (text.includes('three') || text.includes('3 times') || text.includes('3x')) {
      times.push('08:00:00', '13:00:00', '20:00:00')
    } else {
      times.push('08:00:00')
    }
  }

  return Array.from(new Set(times))
}

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
    if (!userRole || (userRole.role !== 'Doctor' && userRole.role !== 'Admin')) {
      return NextResponse.json(
        { error: 'Forbidden: Only attending doctors or admins can submit clinical notes' },
        { status: 403 },
      )
    }

    const {
      clinical_notes,
      diagnosis,
      treatment_plan,
      prescriptions = [], // array of { medicine_name, dosage, frequency, duration_days, timing, instructions }
    } = await req.json()

    if (!clinical_notes && !diagnosis) {
      return NextResponse.json(
        { error: 'Clinical notes or diagnosis is required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // 1. Fetch appointment details
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        patient_id,
        doctor_id,
        appointment_date,
        symptoms,
        medical_staff: doctor_id (
          staff_id,
          user_id,
          users: user_id (first_name, last_name)
        ),
        patients: patient_id (
          patient_id,
          users: user_id (first_name, last_name, email)
        )
      `,
      )
      .eq('appointment_id', appointmentId)
      .single()

    if (fetchError || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Strict Doctor Ownership check (unless Admin)
    if (userRole.role === 'Doctor') {
      const { data: doctorStaff } = await supabase
        .from('medical_staff')
        .select('staff_id')
        .eq('user_id', userRole.userId)
        .maybeSingle()

      if (!doctorStaff || doctorStaff.staff_id !== appointment.doctor_id) {
        return NextResponse.json(
          { error: 'Forbidden: You can only complete your own assigned appointments' },
          { status: 403 },
        )
      }
    }

    // 2. Update appointment status to 'Completed' with notes
    const { data: updatedAppt, error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'Completed',
        clinical_notes: clinical_notes || '',
        diagnosis: diagnosis || '',
        treatment_plan: treatment_plan || '',
        updated_at: new Date().toISOString(),
      })
      .eq('appointment_id', appointmentId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update appointment: ${updateError.message}` },
        { status: 500 },
      )
    }

    // Also update legacy medical_records if entry exists with same ID
    try {
      await supabase
        .from('medical_records')
        .update({
          visit_status: 'Completed',
          diagnosis: diagnosis || '',
          treatment_plan: treatment_plan || '',
        })
        .eq('record_id', appointmentId)
    } catch {}

    // 3. Record Prescriptions & Structured Medication Items
    let savedPrescriptionId: number | null = null

    if (Array.isArray(prescriptions) && prescriptions.length > 0) {
      const { data: presRecord, error: presError } = await supabase
        .from('prescriptions')
        .insert({
          appointment_id: appointmentId,
          patient_id: appointment.patient_id,
          doctor_id: appointment.doctor_id,
          diagnosis: diagnosis || '',
          general_notes: treatment_plan || '',
        })
        .select('prescription_id')
        .single()

      if (!presError && presRecord) {
        savedPrescriptionId = presRecord.prescription_id

        for (const item of prescriptions) {
          if (item.medicine_name) {
            const { data: itemData } = await supabase
              .from('prescription_items')
              .insert({
                prescription_id: savedPrescriptionId,
                medicine_name: item.medicine_name,
                dosage: item.dosage || 'As instructed',
                frequency: item.frequency || 'Daily',
                duration_days: item.duration_days || 7,
                timing: item.timing || 'Morning',
                instructions: item.instructions || 'Take after meals',
              })
              .select('item_id')
              .single()

            // 4. Create Multi-Timing Medication Reminders for patient
            if (itemData) {
              const startDate = new Date()
              const endDate = new Date(startDate.getTime() + (item.duration_days || 7) * 86400000)
              const scheduledTimes = parseMedicationScheduleTimes(item.timing, item.frequency)

              for (const schedTime of scheduledTimes) {
                try {
                  await supabase.from('medication_reminders').insert({
                    patient_id: appointment.patient_id,
                    prescription_item_id: itemData.item_id,
                    medicine_name: item.medicine_name,
                    dosage: item.dosage || 'As instructed',
                    scheduled_time: schedTime,
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                    is_active: true,
                  })
                } catch {}
              }
            }
          }
        }
      }
    }

    // 5. Generate Groq AI Patient-Friendly Post-Visit Summary
    const doctorUser = (appointment.medical_staff as any)?.users
    const doctorName = doctorUser
      ? `${doctorUser.first_name} ${doctorUser.last_name}`
      : 'Attending Physician'

    let postVisitSummaryResult: any = null

    try {
      postVisitSummaryResult = await generatePostVisitSummary({
        clinicalNotes: clinical_notes || 'Consultation completed.',
        diagnosis: diagnosis || 'Clinical review',
        prescriptions,
        doctorName,
      })

      // Upsert post visit summary
      await supabase
        .from('post_visit_summaries')
        .upsert(
          {
            appointment_id: appointmentId,
            patient_friendly_notes: postVisitSummaryResult.patient_friendly_notes,
            medication_schedule: postVisitSummaryResult.medication_schedule,
            follow_up_instructions: postVisitSummaryResult.follow_up_instructions,
            raw_response: postVisitSummaryResult.raw_response,
            status: postVisitSummaryResult.status,
            error_message: postVisitSummaryResult.error_message || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'appointment_id' },
        )
    } catch (aiErr: any) {
      console.error('[Post Visit Groq AI Error - Non Blocking]', aiErr.message)
      // Save graceful fallback record
      try {
        await supabase
          .from('post_visit_summaries')
          .upsert(
            {
              appointment_id: appointmentId,
              patient_friendly_notes: `You completed your consultation for ${diagnosis || 'medical checkup'}. Please follow the doctor's instructions: "${clinical_notes}".`,
              medication_schedule: prescriptions,
              follow_up_instructions: 'Take medications on schedule and follow up if symptoms persist.',
              status: 'completed',
            },
            { onConflict: 'appointment_id' },
          )
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: 'Consultation completed and patient-friendly post-visit summary generated.',
      appointment: updatedAppt,
      postVisitSummary: postVisitSummaryResult,
    })
  } catch (err: any) {
    console.error('[Complete Appointment Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
