// app/api/doctors/route.ts
// Search and list doctors with specialization, department, and profile info

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const specialization = searchParams.get('specialization')
    const search = searchParams.get('search')
    const departmentId = searchParams.get('department_id')

    const supabase = await createClient()

    let query = supabase
      .from('medical_staff')
      .select(
        `
        staff_id,
        user_id,
        staff_type,
        specialization,
        slot_duration_minutes,
        consultation_fee,
        bio,
        employment_status,
        license_number,
        departments (
          department_id,
          name,
          description
        ),
        users (
          user_id,
          first_name,
          last_name,
          email,
          phone_number
        )
      `,
      )
      .eq('staff_type', 'Doctor')
      .neq('employment_status', 'Resigned')
      .neq('employment_status', 'Retired')

    if (specialization && specialization !== 'all') {
      query = query.ilike('specialization', `%${specialization}%`)
    }

    if (departmentId) {
      query = query.eq('department_id', Number(departmentId))
    }

    const { data: doctors, error } = await query

    if (error) {
      console.error('[Doctors API Error]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const doctorList = doctors || []

    // Fallback: If any doctor has users as null (e.g. if RLS or foreign key name varied), resolve from users table directly
    const missingUserIds = doctorList
      .filter((doc: any) => (!doc.users || !doc.users.first_name) && doc.user_id)
      .map((doc: any) => doc.user_id)

    if (missingUserIds.length > 0) {
      const { data: userProfiles } = await supabase
        .from('users')
        .select('user_id, first_name, last_name, email, phone_number')
        .in('user_id', missingUserIds)

      if (userProfiles && userProfiles.length > 0) {
        const userMap = new Map(userProfiles.map((u: any) => [u.user_id, u]))
        doctorList.forEach((doc: any) => {
          if ((!doc.users || !doc.users.first_name) && doc.user_id && userMap.has(doc.user_id)) {
            doc.users = userMap.get(doc.user_id)
          }
        })
      }
    }

    let filtered = doctorList

    if (search && search.trim()) {
      const s = search.toLowerCase()
      filtered = filtered.filter((doc: any) => {
        const fullName = `${doc.users?.first_name || ''} ${doc.users?.last_name || ''}`.toLowerCase()
        const spec = (doc.specialization || '').toLowerCase()
        const dept = (doc.departments?.name || '').toLowerCase()
        return fullName.includes(s) || spec.includes(s) || dept.includes(s)
      })
    }

    return NextResponse.json(filtered)
  } catch (err: any) {
    console.error('[Doctors API Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
