'use client'

import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, CheckCircle2, ExternalLink, Sparkles } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

export default function GoogleCalendarBanner() {
  const searchParams = useSearchParams()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (searchParams.get('gcal_connected') === 'true') {
      setIsConnected(true)
      toast.success('Google Calendar connected successfully! Your appointments will automatically sync.')
    }
    if (searchParams.get('gcal_error')) {
      toast.error('Google Calendar connection failed or was cancelled.')
    }
  }, [searchParams])

  return (
    <Card className="p-4 border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">Google Calendar Auto-Sync</h4>
              {isConnected ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-300 text-[10px] gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Optional
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically sync your booked medical consultations, reminders, and reschedules directly with your Google Calendar.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant={isConnected ? 'outline' : 'default'}
          asChild
          className="shrink-0 gap-1.5 text-xs font-semibold"
        >
          <a href="/api/auth/google-calendar">
            <ExternalLink className="w-3.5 h-3.5" />
            {isConnected ? 'Reconnect Calendar' : 'Connect Google Calendar'}
          </a>
        </Button>
      </div>
    </Card>
  )
}
