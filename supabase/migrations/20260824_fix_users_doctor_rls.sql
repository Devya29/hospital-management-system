-- ==============================================================================
-- FIX: Allow Patients & Authenticated Users to Read Doctor User Profiles
-- ==============================================================================
-- Problem:
-- When Row Level Security (RLS) is enabled on public.users, patients are only allowed
-- to SELECT rows where auth.uid() = user_id. When querying /api/doctors, PostgreSQL
-- blocks patients from reading the doctor's user_id record, causing PostgREST to return
-- "users": null and crashing the patient UI with "Cannot read properties of null (reading 'first_name')".
--
-- Solution:
-- Update the SELECT policy on public.users to allow reading rows where role is Doctor/Staff
-- or user_id is registered in medical_staff, while preserving patient privacy.
-- ==============================================================================

DROP POLICY IF EXISTS "Users can read own profile or staff/admin can read" ON public.users;

CREATE POLICY "Users can read own profile or staff/admin can read"
ON public.users FOR SELECT
TO authenticated, anon
USING (
    auth.uid() = user_id
    OR role IN ('Doctor', 'Nurse', 'Pharmacist', 'Admin')
    OR user_id IN (SELECT user_id FROM public.medical_staff)
    OR public.get_auth_role() IN ('Admin', 'Doctor', 'Nurse', 'Pharmacist')
);
