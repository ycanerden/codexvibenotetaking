import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Textarea } from './components/ui/textarea'

export default function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState('')
  const [enhanced, setEnhanced] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [sttModel, setSttModel] = useState('whisper-large-v3-turbo')
  const [chatModel, setChatModel] = useState('llama-3.1-8b-instant')
  const [statusText, setStatusText] = useState('Idle')
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [eventTitle, setEventTitle] = useState('Meeting')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('10:00')
  const [eventDuration, setEventDuration] = useState('30')
  const [attendeeEmail, setAttendeeEmail] = useState('')
  const [events, setEvents] = useState<{ id: string; summary?: string; start?: any }[]>([])

  const displayStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const mixedStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  async function checkCalendarStatus() {
    const res = await fetch('/api/status')
    if (res.ok) {
      const data = await res.json()
      setCalendarConnected(Boolean(data.connected))
    }
  }

  async function loadEvents() {
    const res = await fetch('/api/events')
    if (!res.ok) return
    const data = await res.json()
    setEvents(data.items || [])
  }

  useEffect(() => {
    checkCalendarStatus()
  }, [])

  const timeString = useMemo(() => {
    const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')
    const s = String(elapsedSeconds % 60).padStart(2, '0')
    return `${m}:${s}`
  }, [elapsedSeconds])

  function stopTracks(stream: MediaStream | null) {
    if (!stream) return
    stream.getTracks().forEach((t) => t.stop())
  }

  async function startRecording() {
    setTranscript('')
    setEnhanced('')
    recordedChunksRef.current = []

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        channelCount: 2,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    displayStream.getVideoTracks().forEach((t) => t.stop())

    const audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()
    const displaySource = audioContext.createMediaStreamSource(displayStream)
    const micSource = audioContext.createMediaStreamSource(micStream)

    displaySource.connect(destination)
    micSource.connect(destination)

    const mixedStream = destination.stream
    const mediaRecorder = new MediaRecorder(mixedStream, { mimeType: 'audio/webm' })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }

    mediaRecorder.start()

    displayStreamRef.current = displayStream
    micStreamRef.current = micStream
    mixedStreamRef.current = mixedStream
    mediaRecorderRef.current = mediaRecorder

    setIsRecording(true)
    setStatusText('Recording')
    setElapsedSeconds(0)

    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }

    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    stopTracks(displayStreamRef.current)
    stopTracks(micStreamRef.current)
    stopTracks(mixedStreamRef.current)

    setIsRecording(false)
    setStatusText('Idle')
  }

  async function transcribe() {
    if (!apiKey.trim()) {
      alert('Paste your Groq API key first.')
      return
    }

    if (!recordedChunksRef.current.length) {
      alert('No recording found.')
      return
    }

    setStatusText('Transcribing')

    const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
    const form = new FormData()
    form.append('file', audioBlob, 'meeting.webm')
    form.append('model', sttModel.trim())
    form.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    })

    if (!res.ok) {
      setTranscript(`Transcription failed: ${res.status}`)
      setStatusText('Idle')
      return
    }

    const data = await res.json()
    const text = data.text || ''
    setTranscript(text)

    if (!draft.trim()) {
      const bullets = text
        .split('. ')
        .map((s: string) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((s: string) => `- ${s}`)
        .join('\n')
      setDraft(bullets)
    }

    setStatusText('Idle')
  }

  async function enhanceNotes() {
    if (!apiKey.trim()) {
      alert('Paste your Groq API key first.')
      return
    }

    setStatusText('Enhancing')

    const prompt = `Transcript:\n${transcript}\n\nDraft Notes:\n${draft}\n\nReturn:\nSummary (1 paragraph)\nDecisions (bullets)\nAction Items (bullets)`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: chatModel.trim(),
        messages: [
          { role: 'system', content: 'You are a concise meeting notes assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    })

    if (!res.ok) {
      setEnhanced(`Enhancement failed: ${res.status}`)
      setStatusText('Idle')
      return
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    setEnhanced(content)
    setStatusText('Idle')
  }

  async function createEvent() {
    if (!calendarConnected) {
      alert('Connect Google Calendar first.')
      return
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: eventTitle,
        date: eventDate,
        time: eventTime,
        durationMinutes: eventDuration,
        attendeeEmail: attendeeEmail || undefined
      })
    })
    if (!res.ok) {
      alert('Failed to create event')
      return
    }
    await loadEvents()
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl text-ink">Granola Notes</h1>
          <Badge variant="default">Built by ChatGPT</Badge>
        </div>
        <p className="mt-2 text-sm text-ink/60">
          Google Meet only · No bot · Local capture from shared Chrome tab
        </p>
      </div>
          <div className="flex items-center gap-3 rounded-full border border-edge bg-white/80 px-4 py-2 text-sm font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${
                isRecording ? 'bg-recording animate-pulse' : 'bg-edge'
              }`}
            />
            <span>{statusText}</span>
            <span className="text-ink/60">{timeString}</span>
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-3">
          <Button onClick={startRecording} disabled={isRecording}>
            Start Recording
          </Button>
          <Button variant="danger" onClick={stopRecording} disabled={!isRecording}>
            Stop
          </Button>
          <Button variant="secondary" onClick={transcribe} disabled={isRecording}>
            Transcribe
          </Button>
          <Button variant="secondary" onClick={enhanceNotes} disabled={isRecording}>
            Enhance Notes
          </Button>
        </section>

        <div className="rounded-2xl border border-edge bg-white/70 px-4 py-3 text-xs text-ink/70">
          Before you start, choose <strong>Chrome Tab</strong> and enable <strong>Share tab audio</strong>.
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-h-[320px] max-h-[420px] whitespace-pre-wrap text-sm text-ink/90">
                {transcript || 'Transcript appears here after transcription.'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Draft Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type quick bullets while you meet…"
              />
              <div className="h-px bg-edge" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Enhanced</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-ink/90">
                  {enhanced || 'Enhanced notes will appear here.'}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>API</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-ink/60">Groq API Key</label>
              <Input
                type="password"
                placeholder="Paste key here (stored only in this page)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink/60">Transcription Model</label>
              <Input value={sttModel} onChange={(e) => setSttModel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink/60">LLM Model</label>
              <Input value={chatModel} onChange={(e) => setChatModel(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calendar + Scheduling (Single User)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  window.open('/auth', '_blank')
                  setTimeout(() => checkCalendarStatus(), 1500)
                }}
              >
                Connect Google Calendar
              </Button>
              <Button variant="secondary" onClick={loadEvents}>
                Refresh Events
              </Button>
              <Badge variant={calendarConnected ? 'accent' : 'default'}>
                {calendarConnected ? 'Connected' : 'Not Connected'}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-ink/60">Title</label>
                <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink/60">Attendee Email (optional)</label>
                <Input
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  placeholder="guest@company.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink/60">Date</label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-ink/60">Time</label>
                  <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink/60">Duration (min)</label>
                  <Input
                    type="number"
                    value={eventDuration}
                    onChange={(e) => setEventDuration(e.target.value)}
                    min={15}
                    step={15}
                  />
                </div>
              </div>
            </div>

            <Button onClick={createEvent}>Create Event</Button>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Upcoming</div>
              <div className="mt-2 space-y-2 text-sm text-ink/80">
                {events.length === 0 ? (
                  <div>No upcoming events loaded.</div>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="rounded-xl border border-edge bg-white/70 px-3 py-2">
                      <div className="font-semibold">{event.summary || 'Untitled'}</div>
                      <div className="text-xs text-ink/60">
                        {event.start?.dateTime || event.start?.date}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <footer className="text-xs text-ink/50">
          Recording stays local. Transcription + enhancement run via your Groq key.
        </footer>
      </div>
    </div>
  )
}
