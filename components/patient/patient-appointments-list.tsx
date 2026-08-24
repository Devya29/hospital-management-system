'use client'

import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Calendar,
  Clock,
  User,
  Sparkles,
  FileText,
  Pill,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  Loader2,
  CalendarCheck,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export interface AppointmentItem {
  appointment_id: number
  appointment_date: string
  start_time: string
  end_time: string
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Reschedule_Required'
  symptoms?: string
  patient_notes?: string
  clinical_notes?: string
  diagnosis?: string
  treatment_plan?: string
  cancellation_reason?: string
  google_calendar_status?: string
  medical_staff?: {
    staff_id: number
    specialization?: string
    slot_duration_minutes?: number
    departments?: { name: string }
    users: {
      first_name: string
      last_name: string
      email?: string
    }
  }
  pre_visit_summaries?: {
    urgency: 'Low' | 'Medium' | 'High'
    chief_complaint: string
    suggested_questions: string[]
    status: string
  } | Array<any>
  post_visit_summaries?: {
    patient_friendly_notes: string
    medication_schedule: any
    follow_up_instructions: string
    status: string
  } | Array<any>
  prescriptions?: Array<{
    prescription_id: number
    diagnosis?: string
    general_notes?: string
    prescription_items?: Array<{
      item_id: number
      medicine_name: string
      dosage: string
      frequency: string
      duration_days: number
      timing?: string
      instructions?: string
    }>
  }>
}

interface Props {
  appointments: AppointmentItem[]
  onRefresh: () => void
}

export default function PatientAppointmentsList({ appointments, onRefresh }: Props) {
  // Modal states
  const [selectedAppt, setSelectedAppt] = useState<AppointmentItem | null>(null)
  const [preVisitModalOpen, setPreVisitModalOpen] = useState(false)
  const [postVisitModalOpen, setPostVisitModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  // Reschedule Modal State
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlots, setRescheduleSlots] = useState<any[]>([])
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false)
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<any>(null)
  const [isRescheduling, setIsRescheduling] = useState(false)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Scheduled':
        return <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300">Scheduled</Badge>
      case 'Completed':
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300">Completed</Badge>
      case 'Reschedule_Required':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Reschedule Needed
          </Badge>
        )
      case 'Cancelled':
        return <Badge variant="secondary" className="text-muted-foreground">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Handle Cancel Appointment
  const handleConfirmCancel = async () => {
    if (!selectedAppt) return
    setIsCancelling(true)
    try {
      const res = await fetch(`/api/appointments/${selectedAppt.appointment_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Appointment cancelled successfully.')
        setCancelModalOpen(false)
        setCancelReason('')
        onRefresh()
      } else {
        toast.error(data.error || 'Failed to cancel appointment.')
      }
    } catch {
      toast.error('Could not cancel appointment.')
    } finally {
      setIsCancelling(false)
    }
  }

  // Handle Open Reschedule Modal & Fetch Slots
  const handleOpenReschedule = (appt: AppointmentItem) => {
    setSelectedAppt(appt)
    const initialDate = appt.appointment_date || format(new Date(), 'yyyy-MM-dd')
    setRescheduleDate(initialDate)
    setSelectedRescheduleSlot(null)
    setRescheduleModalOpen(true)
    fetchSlotsForDoctor(appt.medical_staff?.staff_id, initialDate)
  }

  const fetchSlotsForDoctor = async (doctorId?: number, date?: string) => {
    if (!doctorId || !date) return
    setLoadingRescheduleSlots(true)
    try {
      const res = await fetch(`/api/doctors/${doctorId}/availability?date=${date}`)
      if (res.ok) {
        const data = await res.json()
        setRescheduleSlots(data.slots || [])
      }
    } catch {
      toast.error('Failed to fetch doctor availability for that date.')
    } finally {
      setLoadingRescheduleSlots(false)
    }
  }

  // Handle Confirm Reschedule
  const handleConfirmReschedule = async () => {
    if (!selectedAppt || !selectedRescheduleSlot) return
    setIsRescheduling(true)
    try {
      const res = await fetch(`/api/appointments/${selectedAppt.appointment_id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_date: rescheduleDate,
          new_start_time: selectedRescheduleSlot.startTime,
          new_end_time: selectedRescheduleSlot.endTime,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Appointment rescheduled successfully! Check your email for confirmation.')
        setRescheduleModalOpen(false)
        onRefresh()
      } else {
        toast.error(data.error || 'Rescheduling failed.')
      }
    } catch {
      toast.error('An unexpected error occurred during rescheduling.')
    } finally {
      setIsRescheduling(false)
    }
  }

  const upcomingList = appointments.filter(
    (a) => a.status === 'Scheduled' || a.status === 'Reschedule_Required',
  )
  const pastList = appointments.filter(
    (a) => a.status === 'Completed' || a.status === 'Cancelled',
  )

  // Helper to extract Pre-Visit Summary
  const getPreVisitData = (appt: AppointmentItem) => {
    if (Array.isArray(appt.pre_visit_summaries)) {
      return appt.pre_visit_summaries[0]
    }
    return appt.pre_visit_summaries
  }

  // Helper to extract Post-Visit Summary
  const getPostVisitData = (appt: AppointmentItem) => {
    if (Array.isArray(appt.post_visit_summaries)) {
      return appt.post_visit_summaries[0]
    }
    return appt.post_visit_summaries
  }

  const renderTable = (list: AppointmentItem[], isUpcoming: boolean) => {
    if (list.length === 0) {
      return (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {isUpcoming ? 'No upcoming appointments scheduled.' : 'No past appointment history.'}
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doctor & Specialization</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Symptoms / Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((appt) => {
              const docName = appt.medical_staff?.users
                ? `Dr. ${appt.medical_staff.users.first_name} ${appt.medical_staff.users.last_name}`
                : 'Doctor'
              const spec = appt.medical_staff?.specialization || 'General Practice'
              const preVisit = getPreVisitData(appt)
              const postVisit = getPostVisitData(appt)
              const hasPrescription = (appt.prescriptions?.length || 0) > 0

              return (
                <TableRow key={appt.appointment_id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="font-semibold text-sm">{docName}</div>
                    <div className="text-xs text-muted-foreground">{spec}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      {appt.appointment_date}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {appt.start_time} - {appt.end_time}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(appt.status)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {appt.symptoms || appt.patient_notes || 'Routine visit'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* Pre-Visit AI Summary Button */}
                      {preVisit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-primary hover:bg-primary/10 gap-1"
                          onClick={() => {
                            setSelectedAppt(appt)
                            setPreVisitModalOpen(true)
                          }}
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Pre-Visit
                        </Button>
                      )}

                      {/* Post-Visit AI Summary / Prescription Button */}
                      {appt.status === 'Completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 gap-1"
                          onClick={() => {
                            setSelectedAppt(appt)
                            setPostVisitModalOpen(true)
                          }}
                        >
                          <FileText className="w-3.5 h-3.5" /> Summary & Rx
                        </Button>
                      )}

                      {/* Reschedule Button */}
                      {(appt.status === 'Scheduled' || appt.status === 'Reschedule_Required') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => handleOpenReschedule(appt)}
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Reschedule
                        </Button>
                      )}

                      {/* Cancel Button */}
                      {appt.status === 'Scheduled' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setSelectedAppt(appt)
                            setCancelModalOpen(true)
                          }}
                        >
                          Cancel
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
    )
  }

  const activePreVisit = selectedAppt ? getPreVisitData(selectedAppt) : null
  const activePostVisit = selectedAppt ? getPostVisitData(selectedAppt) : null
  const activePrescriptions = selectedAppt?.prescriptions || []

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-xl font-bold">My Appointments</CardTitle>
          <CardDescription>
            View your consultation schedule, pre-visit triage, and post-visit treatment summaries
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full max-w-xs grid-cols-2 mb-4">
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingList.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              History ({pastList.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-0">
            {renderTable(upcomingList, true)}
          </TabsContent>

          <TabsContent value="past" className="mt-0">
            {renderTable(pastList, false)}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Pre-Visit AI Intake Dialog */}
      <Dialog open={preVisitModalOpen} onOpenChange={setPreVisitModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-primary" />
              Pre-Visit Intake & Triage Summary
            </DialogTitle>
            <DialogDescription>
              AI-generated summary prepared for your attending physician prior to your visit.
            </DialogDescription>
          </DialogHeader>

          {activePreVisit ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg text-xs">
                <span>Triage Urgency Rating:</span>
                <Badge
                  className={
                    activePreVisit.urgency === 'High'
                      ? 'bg-red-500 text-white'
                      : activePreVisit.urgency === 'Medium'
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-500 text-white'
                  }
                >
                  {activePreVisit.urgency} Urgency
                </Badge>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Chief Complaint</Label>
                <div className="p-3 bg-muted/20 border border-border/60 rounded-md text-sm font-medium">
                  {activePreVisit.chief_complaint}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Suggested Questions for Your Doctor
                </Label>
                <div className="space-y-1.5">
                  {(Array.isArray(activePreVisit.suggested_questions)
                    ? activePreVisit.suggested_questions
                    : []
                  ).map((q: string, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-primary/5 border border-primary/15 rounded-md text-xs text-foreground flex items-start gap-2"
                    >
                      <span className="font-bold text-primary">{idx + 1}.</span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-2">
                * Note: This AI intake summary assists with triage organization and does NOT constitute a diagnosis.
              </p>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No pre-visit summary available.</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreVisitModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Visit AI Summary & Prescription Dialog */}
      <Dialog open={postVisitModalOpen} onOpenChange={setPostVisitModalOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-emerald-700 dark:text-emerald-400">
              <FileText className="w-5 h-5" />
              Post-Visit Care & Prescription Schedule
            </DialogTitle>
            <DialogDescription>
              Patient-friendly explanation, medication schedule, and recovery instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* AI Patient-Friendly Notes */}
            {activePostVisit?.patient_friendly_notes && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Doctor Explanation & Guidance
                </Label>
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg text-sm leading-relaxed text-foreground">
                  {activePostVisit.patient_friendly_notes}
                </div>
              </div>
            )}

            {/* Prescriptions & Medication Schedule */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-primary" /> Prescribed Medications
              </Label>

              {activePrescriptions.length > 0 &&
              activePrescriptions[0].prescription_items &&
              activePrescriptions[0].prescription_items.length > 0 ? (
                <div className="space-y-2">
                  {activePrescriptions[0].prescription_items.map((item) => (
                    <div
                      key={item.item_id}
                      className="p-3 bg-muted/30 border border-border/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                          {item.medicine_name}
                          <Badge variant="outline" className="text-xs font-normal">
                            {item.dosage}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.frequency} • Duration: {item.duration_days} days
                        </div>
                        {item.instructions && (
                          <div className="text-xs text-primary/90 mt-1 italic">
                            Instructions: {item.instructions}
                          </div>
                        )}
                      </div>
                      {item.timing && (
                        <Badge variant="secondary" className="self-start sm:self-center text-xs">
                          {item.timing}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-muted/20 rounded-md text-xs text-muted-foreground">
                  No specific medications prescribed for this visit.
                </div>
              )}
            </div>

            {/* Follow-up instructions */}
            {activePostVisit?.follow_up_instructions && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Follow-Up & Warning Signs
                </Label>
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg text-xs leading-relaxed text-foreground">
                  {activePostVisit.follow_up_instructions}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPostVisitModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Appointment Dialog */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Cancel Appointment
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment? Your reserved slot will be released back to other patients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="cancel-reason" className="text-xs font-semibold">
              Reason for Cancellation (Optional)
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder="e.g. Schedule conflict, feeling better..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
              Keep Appointment
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={isCancelling}>
              {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Appointment Dialog */}
      <Dialog open={rescheduleModalOpen} onOpenChange={setRescheduleModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" /> Reschedule Appointment
            </DialogTitle>
            <DialogDescription>
              Select a new date and time slot with{' '}
              <strong>
                Dr. {selectedAppt?.medical_staff?.users?.first_name}{' '}
                {selectedAppt?.medical_staff?.users?.last_name}
              </strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date" className="text-xs font-semibold">
                Select New Date
              </Label>
              <Input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => {
                  setRescheduleDate(e.target.value)
                  setSelectedRescheduleSlot(null)
                  fetchSlotsForDoctor(selectedAppt?.medical_staff?.staff_id, e.target.value)
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Available Slot</Label>
              {loadingRescheduleSlots ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex justify-center items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" /> Checking availability...
                </div>
              ) : rescheduleSlots.filter((s) => s.isAvailable).length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-md">
                  No slots available on this date. Please pick another date.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {rescheduleSlots
                    .filter((s) => s.isAvailable)
                    .map((slot, idx) => {
                      const isSelected = selectedRescheduleSlot?.startTime === slot.startTime
                      return (
                        <Button
                          key={idx}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          className="h-10 text-xs font-semibold"
                          onClick={() => setSelectedRescheduleSlot(slot)}
                        >
                          {slot.startTime}
                        </Button>
                      )
                    })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRescheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedRescheduleSlot || isRescheduling}
              onClick={handleConfirmReschedule}
            >
              {isRescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
