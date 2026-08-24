// app/api/appointments/hold/route.ts
// Slot Hold Mechanism: Temporarily reserve a slot for 5 minutes during patient intake with ownership awareness

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'

export async function POST(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { doctor_id, slot_date, start_time, end_time, hold_duration_seconds = 300 } =
      await req.json()

    if (!doctor_id || !slot_date || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'Missing required slot details' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // Resolve patient record if patient user
    let patientId: number | null = null
    const { data: patient } = await supabase
      .from('patients')
      .select('patient_id')
      .eq('user_id', userRole.userId)
      .maybeSingle()

    if (patient) {
      patientId = patient.patient_id
    }

    // 1. Check if doctor is on leave
    const { data: leaves } = await supabase
      .from('doctor_leaves')
      .select('start_date, end_date, status')
      .eq('doctor_id', doctor_id)
      .eq('status', 'Approved')
      .lte('start_date', slot_date)
      .gte('end_date', slot_date)

    if (leaves && leaves.length > 0) {
      return NextResponse.json(
        { error: 'Doctor is on scheduled leave for the selected date' },
        { status: 409 },
      )
    }

    // 2. Check if already booked
    const { data: existingAppt } = await supabase
      .from('appointments')
      .select('appointment_id')
      .eq('doctor_id', doctor_id)
      .eq('appointment_date', slot_date)
      .eq('start_time', start_time)
      .neq('status', 'Cancelled')
      .maybeSingle()

    if (existingAppt) {
      return NextResponse.json(
        { error: 'This slot has already been booked' },
        { status: 409 },
      )
    }

    // 3. Check if active hold already exists
    const nowIso = new Date().toISOString()
    const { data: existingHold } = await supabase
      .from('slot_holds')
      .select('id, expires_at, hold_token, user_session_id')
      .eq('doctor_id', doctor_id)
      .eq('slot_date', slot_date)
      .eq('start_time', start_time)
      .gt('expires_at', nowIso)
      .maybeSingle()

    const expiresAt = new Date(Date.now() + hold_duration_seconds * 1000).toISOString()

    if (existingHold) {
      // If the existing active hold belongs to the SAME user, refresh/extend it!
      if (existingHold.user_session_id === userRole.userId) {
        await supabase
          .from('slot_holds')
          .update({ expires_at: expiresAt })
          .eq('id', existingHold.id)

        return NextResponse.json({
          success: true,
          holdToken: existingHold.hold_token,
          expiresAt,
          message: 'Slot hold extended for 5 minutes.',
        })
      }

      // Held by another user
      return NextResponse.json(
        {
          error:
            'This slot is currently being reserved by another patient. Please choose another slot or try again shortly.',
          isHeld: true,
        },
        { status: 409 },
      )
    }

    // 4. Create new Hold with 5-minute expiry
    const holdToken = `hold_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: hold, error: holdError } = await supabase
      .from('slot_holds')
      .insert({
        doctor_id,
        slot_date,
        start_time,
        end_time,
        hold_token: holdToken,
        patient_id: patientId,
        user_session_id: userRole.userId,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (holdError) {
      console.error('[Slot Hold Insert Error]', holdError)
      return NextResponse.json(
        { error: 'Failed to hold slot. It might have just been reserved.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      holdToken,
      expiresAt,
      message: 'Slot held successfully for 5 minutes.',
    })
  } catch (err: any) {
    console.error('[Slot Hold Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const holdToken = searchParams.get('token')

    if (!holdToken) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = await createClient()
    await supabase.from('slot_holds').delete().eq('hold_token', holdToken)

    return NextResponse.json({ success: true, message: 'Hold released' })
  } catch {
    return NextResponse.json({ success: true })
  }
}
