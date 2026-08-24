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
  Calendar,
  Clock,
  User,
  Search,
  RefreshCw,
  AlertTriangle,
  FileText,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

export default function AdminAppointmentsManager() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/appointments')
      if (res.ok) {
        const data = await res.json()
        setAppointments(Array.isArray(data) ? data : [])
      }
    } catch {
      toast.error('Failed to load appointments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const handleCancelAppointment = async (apptId: number) => {
    try {
      const res = await fetch(`/api/appointments/${apptId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin cancelled' }),
      })
      if (res.ok) {
        toast.success('Appointment cancelled and slot released.')
        fetchAppointments()
      } else {
        toast.error('Failed to cancel appointment.')
      }
    } catch {
      toast.error('Error cancelling appointment.')
    }
  }

  const filtered = appointments.filter((a) => {
    const docName = `${a.medical_staff?.users?.first_name || ''} ${a.medical_staff?.users?.last_name || ''}`.toLowerCase()
    const patName = `${a.patients?.users?.first_name || ''} ${a.patients?.users?.last_name || ''}`.toLowerCase()
    const q = searchQuery.toLowerCase()
    return docName.includes(q) || patName.includes(q) || (a.status || '').toLowerCase().includes(q)
  })

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-xl font-bold">Hospital-Wide Appointment Records</CardTitle>
          <CardDescription>
            Audit all scheduled, completed, and rescheduled appointments across all clinical departments
          </CardDescription>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search doctor, patient, status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchAppointments} className="gap-1 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground flex justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading appointment records...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No appointments found matching your query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor & Dept</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Symptoms / Diagnosis</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((appt) => {
                  const pat = appt.patients?.users
                  const doc = appt.medical_staff?.users
                  const patName = pat ? `${pat.first_name} ${pat.last_name}` : 'Patient'
                  const docName = doc ? `Dr. ${doc.first_name} ${doc.last_name}` : 'Doctor'

                  return (
                    <TableRow key={appt.appointment_id || appt.record_id} className="text-xs">
                      <TableCell className="font-mono">#{appt.appointment_id || appt.record_id}</TableCell>
                      <TableCell className="font-semibold text-foreground">{patName}</TableCell>
                      <TableCell>
                        <div className="font-medium">{docName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {appt.medical_staff?.specialization || 'General'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {appt.appointment_date || appt.visit_date?.split('T')[0]}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {appt.start_time || '09:00'} - {appt.end_time || '09:30'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {appt.status === 'Completed' ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                            Completed
                          </Badge>
                        ) : appt.status === 'Reschedule_Required' ? (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300">
                            Reschedule Needed
                          </Badge>
                        ) : appt.status === 'Cancelled' ? (
                          <Badge variant="secondary">Cancelled</Badge>
                        ) : (
                          <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300">
                            Scheduled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">
                        {appt.diagnosis || appt.symptoms || 'General Consultation'}
                      </TableCell>
                      <TableCell className="text-right">
                        {appt.status === 'Scheduled' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              handleCancelAppointment(appt.appointment_id || appt.record_id)
                            }
                          >
                            Cancel
                          </Button>
                        )}
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
  )
}
