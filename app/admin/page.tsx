'use client'

import React, { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import AdminScheduleManager from '@/components/admin/admin-schedule-manager'
import AdminDoctorLeaveManager from '@/components/admin/admin-doctor-leave-manager'
import AdminAppointmentsManager from '@/components/admin/admin-appointments-manager'
import CreateStaffSection from '@/components/admin/create-staff'
import UpdateStaffSection from '@/components/admin/update-staff'
import {
  ShieldCheck,
  CalendarOff,
  Clock,
  CalendarCheck,
  Users,
} from 'lucide-react'
import { Toaster } from 'sonner'

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('schedules')

  return (
    <div className="flex flex-col w-full gap-6 px-4 py-8 container mx-auto max-w-7xl">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            Hospital Administration Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage doctor profiles, working shifts, slot durations, leaves, and system-wide appointments
          </p>
        </div>
      </header>

      {/* Admin Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-2xl h-11">
          <TabsTrigger value="schedules" className="flex items-center gap-1.5 text-xs font-semibold">
            <Clock className="w-4 h-4" /> Working Hours & Slots
          </TabsTrigger>
          <TabsTrigger value="leaves" className="flex items-center gap-1.5 text-xs font-semibold">
            <CalendarOff className="w-4 h-4" /> Doctor Leaves
          </TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-1.5 text-xs font-semibold">
            <CalendarCheck className="w-4 h-4" /> Appointments
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-1.5 text-xs font-semibold">
            <Users className="w-4 h-4" /> Staff Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-0 space-y-6">
          <AdminScheduleManager />
        </TabsContent>

        <TabsContent value="leaves" className="mt-0 space-y-6">
          <AdminDoctorLeaveManager />
        </TabsContent>

        <TabsContent value="appointments" className="mt-0 space-y-6">
          <AdminAppointmentsManager />
        </TabsContent>

        <TabsContent value="staff" className="mt-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CreateStaffSection
              userList={[]}
              createFeedback={null}
              handleCreateStaff={async () => {}}
            />
            <UpdateStaffSection
              staffList={[]}
              updateData={{
                staffId: '',
                departmentId: '',
                staffType: '',
                licenseNumber: '',
                employmentStatus: '',
              }}
              updateFeedback={null}
              handleUpdateStaff={async () => {}}
              handleStaffSelectChange={() => {}}
              setUpdateData={() => {}}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
