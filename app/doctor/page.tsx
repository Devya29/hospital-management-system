'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import DoctorConsultationModal from '@/components/doctor/doctor-consultation-modal'
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  Sparkles,
  FileText,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Phone,
  Droplet,
} from 'lucide-react'
import { getGreeting } from '@/utils/greeting'
import { format } from 'date-fns'
import { Toaster, toast } from 'sonner'

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'All' | 'Scheduled' | 'Completed'>('Scheduled')

  // Modals state
  const [consultationModalOpen, setConsultationModalOpen] = useState(false)
  const [patientDetailsModalOpen, setPatientDetailsModalOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null)

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/appointments')
      if (res.ok) {
        const data = await res.json()
        setAppointments(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load appointments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const handleOpenConsultation = (appt: any) => {
    setSelectedAppointment(appt)
    setConsultationModalOpen(true)
  }

  const handleOpenPatientDetails = (appt: any) => {
    setSelectedAppointment(appt)
    setPatientDetailsModalOpen(true)
  }

  const filteredAppointments = appointments.filter((appt) => {
    const statusMatch =
      filterStatus === 'All'
        ? true
        : filterStatus === 'Scheduled'
          ? appt.status === 'Scheduled' || appt.status === 'Reschedule_Required'
          : appt.status === 'Completed'

    const patientName = `${appt.patients?.users?.first_name || ''} ${appt.patients?.users?.last_name || ''}`.toLowerCase()
    const symptoms = (appt.symptoms || '').toLowerCase()
    const q = searchQuery.toLowerCase()

    const searchMatch = patientName.includes(q) || symptoms.includes(q)

    return statusMatch && searchMatch
  })

  return (
    <div className="flex flex-col w-full gap-8 px-4 py-8 container mx-auto max-w-7xl">
      <Toaster position="top-right" richColors />

      {/* Header Greeting */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Stethoscope className="w-7 h-7 text-primary" />
            {getGreeting()}, Doctor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Doctor Clinical Portal • Examine AI pre-visit intake, conduct consultations, and issue structured prescriptions
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchAppointments} className="gap-1.5 self-start sm:self-auto">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh List
        </Button>
      </header>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-border/60">
          <div className="text-xs text-muted-foreground font-medium">Scheduled Today / Upcoming</div>
          <div className="text-2xl font-bold mt-1 text-primary">
            {appointments.filter((a) => a.status === 'Scheduled').length}
          </div>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="text-xs text-muted-foreground font-medium">Completed Consultations</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
            {appointments.filter((a) => a.status === 'Completed').length}
          </div>
        </Card>
        <Card className="p-4 border-border/60">
          <div className="text-xs text-muted-foreground font-medium">Total Patient Records</div>
          <div className="text-2xl font-bold mt-1 text-foreground">
            {appointments.length}
          </div>
        </Card>
      </div>

      {/* Main Appointments Management Section */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-xl font-bold">Clinical Patient Queue</CardTitle>
            <CardDescription>
              Review patient intake, AI pre-visit symptom triage, and record clinical notes
            </CardDescription>
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search patient name, symptoms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <Tabs
              value={filterStatus}
              onValueChange={(val: any) => setFilterStatus(val)}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-9">
                <TabsTrigger value="Scheduled" className="text-xs">
                  Upcoming
                </TabsTrigger>
                <TabsTrigger value="Completed" className="text-xs">
                  Completed
                </TabsTrigger>
                <TabsTrigger value="All" className="text-xs">
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground flex justify-center items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Loading appointment queue...
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              No appointments found in this view.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Details</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>AI Intake Triage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Clinical Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.map((appt) => {
                    const patientUser = appt.patients?.users
                    const patientName = patientUser
                      ? `${patientUser.first_name} ${patientUser.last_name}`
                      : 'Patient'

                    const preVisit = Array.isArray(appt.pre_visit_summaries)
                      ? appt.pre_visit_summaries[0]
                      : appt.pre_visit_summaries

                    const isHighUrgency = preVisit?.urgency === 'High'

                    return (
                      <TableRow key={appt.appointment_id || appt.record_id} className="hover:bg-muted/30">
                        <TableCell>
                          <div
                            onClick={() => handleOpenPatientDetails(appt)}
                            className="font-semibold text-sm hover:text-primary cursor-pointer flex items-center gap-1.5"
                          >
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            {patientName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {patientUser?.phone_number || 'No phone'} • Blood: {appt.patients?.blood_type || 'N/A'}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1 text-xs font-medium">
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            {appt.appointment_date || appt.visit_date?.split('T')[0]}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            {appt.start_time || '09:00'} - {appt.end_time || '09:30'}
                          </div>
                        </TableCell>

                        {/* AI Pre-Visit Triage column */}
                        <TableCell className="max-w-[260px]">
                          {preVisit ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  className={
                                    isHighUrgency
                                      ? 'bg-red-500 text-white text-[10px]'
                                      : preVisit.urgency === 'Medium'
                                        ? 'bg-amber-500 text-white text-[10px]'
                                        : 'bg-emerald-500 text-white text-[10px]'
                                  }
                                >
                                  {preVisit.urgency} Urgency
                                </Badge>
                                <span className="text-[11px] font-medium text-foreground truncate">
                                  {preVisit.chief_complaint}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground truncate">
                              {appt.symptoms || 'No symptoms noted'}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          {appt.status === 'Completed' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                              Completed
                            </Badge>
                          ) : appt.status === 'Reschedule_Required' ? (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300">
                              Reschedule
                            </Badge>
                          ) : (
                            <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300">
                              Scheduled
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => handleOpenPatientDetails(appt)}
                            >
                              Details
                            </Button>

                            {appt.status !== 'Completed' ? (
                              <Button
                                size="sm"
                                className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
                                onClick={() => handleOpenConsultation(appt)}
                              >
                                <Stethoscope className="w-3.5 h-3.5" /> Start Visit
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 gap-1.5"
                                onClick={() => handleOpenConsultation(appt)}
                              >
                                <FileText className="w-3.5 h-3.5" /> View / Edit Notes
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doctor Consultation & Prescription Modal */}
      <DoctorConsultationModal
        appointment={selectedAppointment}
        open={consultationModalOpen}
        onOpenChange={setConsultationModalOpen}
        onSuccess={fetchAppointments}
      />

      {/* Patient Profile & Intake Dialog */}
      <Dialog open={patientDetailsModalOpen} onOpenChange={setPatientDetailsModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> Patient Background & History
            </DialogTitle>
            <DialogDescription>
              Registered demographics and intake history for this patient.
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                <div>
                  <span className="text-xs text-muted-foreground block">Full Name:</span>
                  <span className="font-semibold">
                    {selectedAppointment.patients?.users?.first_name}{' '}
                    {selectedAppointment.patients?.users?.last_name}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Blood Group:</span>
                  <span className="font-semibold">{selectedAppointment.patients?.blood_type || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Phone:</span>
                  <span>{selectedAppointment.patients?.users?.phone_number || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Gender:</span>
                  <span>{selectedAppointment.patients?.users?.gender || 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Reported Symptoms:</span>
                <div className="p-3 bg-muted/20 border border-border/60 rounded-md text-xs">
                  {selectedAppointment.symptoms || 'No symptoms reported.'}
                </div>
              </div>

              {selectedAppointment.diagnosis && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Diagnosis:</span>
                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md text-xs font-medium">
                    {selectedAppointment.diagnosis}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPatientDetailsModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
