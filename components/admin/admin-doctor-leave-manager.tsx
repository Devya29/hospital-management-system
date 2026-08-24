'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  CalendarOff,
  AlertTriangle,
  Plus,
  Trash2,
  Users,
  CheckCircle2,
  Loader2,
  Calendar,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function AdminDoctorLeaveManager() {
  const [doctors, setDoctors] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Add leave modal
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Impact feedback modal
  const [impactModalOpen, setImpactModalOpen] = useState(false)
  const [impactSummary, setImpactSummary] = useState<{
    impactedCount: number
    impactedAppointments: any[]
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, leaveRes] = await Promise.all([
        fetch('/api/doctors'),
        fetch('/api/admin/leaves'),
      ])

      if (docRes.ok) {
        const docData = await docRes.json()
        setDoctors(docData)
        if (docData.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(String(docData[0].staff_id))
        }
      }

      if (leaveRes.ok) {
        const leaveData = await leaveRes.json()
        setLeaves(leaveData)
      }
    } catch {
      toast.error('Failed to load leave records.')
    } finally {
      setLoading(false)
    }
  }, [selectedDoctorId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDoctorId || !startDate || !endDate) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: Number(selectedDoctorId),
          start_date: startDate,
          end_date: endDate,
          reason,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(data.message || 'Leave recorded successfully.')
        setModalOpen(false)
        setReason('')
        fetchData()

        if (data.impactedCount > 0) {
          setImpactSummary({
            impactedCount: data.impactedCount,
            impactedAppointments: data.impactedAppointments || [],
          })
          setImpactModalOpen(true)
        }
      } else {
        toast.error(data.error || 'Failed to record leave.')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteLeave = async (leaveId: number) => {
    try {
      const res = await fetch(`/api/admin/leaves?id=${leaveId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Doctor leave schedule removed.')
        fetchData()
      } else {
        toast.error('Failed to delete leave.')
      }
    } catch {
      toast.error('Error deleting leave.')
    }
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <CalendarOff className="w-5 h-5 text-amber-500" />
            Doctor Leave & Schedule Conflict Manager
          </CardTitle>
          <CardDescription>
            Record doctor leaves; automatically detects affected appointments, marks them for priority rescheduling, and alerts patients.
          </CardDescription>
        </div>

        <Button onClick={() => setModalOpen(true)} size="sm" className="gap-1.5 font-semibold">
          <Plus className="w-4 h-4" /> Schedule Doctor Leave
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground flex justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading doctor leaves...
          </div>
        ) : leaves.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No active doctor leaves recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>Leave Duration</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((l) => {
                  const doc = l.medical_staff
                  const name = doc?.users
                    ? `Dr. ${doc.users.first_name} ${doc.users.last_name}`
                    : 'Doctor'

                  return (
                    <TableRow key={l.leave_id}>
                      <TableCell className="font-semibold text-sm">{name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {doc?.specialization || 'General'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-amber-500" />
                          {l.start_date} to {l.end_date}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {l.reason || 'Annual Leave'}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300">
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteLeave(l.leave_id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Schedule Leave Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="w-5 h-5 text-amber-500" /> Schedule Doctor Leave
            </DialogTitle>
            <DialogDescription>
              Mark a doctor as unavailable. Any booked appointments during this period will automatically be flagged for rescheduling.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLeave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="leave-doctor" className="text-xs font-semibold">
                Select Doctor <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger id="leave-doctor">
                  <SelectValue placeholder="Select a doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((doc) => (
                    <SelectItem key={doc.staff_id} value={String(doc.staff_id)}>
                      Dr. {doc.users.first_name} {doc.users.last_name} ({doc.specialization})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leave-start" className="text-xs font-semibold">
                  Start Date
                </Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leave-end" className="text-xs font-semibold">
                  End Date
                </Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leave-reason" className="text-xs font-semibold">
                Reason for Leave
              </Label>
              <Textarea
                id="leave-reason"
                placeholder="e.g. Medical conference, annual vacation, urgent leave..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="font-semibold">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recording Leave...
                  </>
                ) : (
                  'Confirm & Apply Leave'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Automated Conflict Resolution Feedback Dialog */}
      <Dialog open={impactModalOpen} onOpenChange={setImpactModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> Schedule Conflicts Resolved
            </DialogTitle>
            <DialogDescription>
              {impactSummary?.impactedCount} appointment(s) were scheduled during this leave period.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Actions Taken:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Appointments flagged as <strong>Reschedule_Required</strong></li>
                <li>Conflict email alerts queued and dispatched to patients</li>
                <li>Doctor calendar slots blocked for new bookings</li>
              </ul>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {impactSummary?.impactedAppointments.map((a) => (
                <div
                  key={a.appointment_id}
                  className="p-2.5 bg-muted/30 border border-border/60 rounded flex justify-between items-center"
                >
                  <div>
                    <span className="font-semibold">
                      {a.patients?.users?.first_name} {a.patients?.users?.last_name}
                    </span>
                    <div className="text-[11px] text-muted-foreground">
                      {a.appointment_date} at {a.start_time} - {a.end_time}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-amber-600">
                    Notified
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setImpactModalOpen(false)}>Acknowledge & Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
