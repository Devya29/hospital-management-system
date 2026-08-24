import { createClient } from '@/utils/supabase/server'

type UserRoleResult = {
  role: string
  userId: string
}

export async function getUserRole(): Promise<UserRoleResult | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('Authentication failed:', userError)
    return null
  }

  const { data: staffData, error: staffError } = await supabase
    .from('medical_staff')
    .select('staff_type')
    .eq('user_id', user.id)
    .maybeSingle()

  if (staffData && staffData.staff_type) {
    return {
      role: staffData.staff_type,
      userId: user.id,
    }
  }

  // Check if role is specified on users table
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    role: userData?.role || 'Patient',
    userId: user.id,
  }
}
