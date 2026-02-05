import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { google } from 'googleapis'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
app.use(express.json())

const PORT = process.env.SERVER_PORT || 5050
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Set them in server/.env')
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
const TOKEN_PATH = path.join(__dirname, 'tokens.json')

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
}

function getAuthedClient() {
  const tokens = loadTokens()
  if (!tokens) return null
  oauth2Client.setCredentials(tokens)
  return oauth2Client
}

app.get('/auth', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly'
  ]
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  })
  res.redirect(url)
})

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query
    const { tokens } = await oauth2Client.getToken(code)
    saveTokens(tokens)
    res.redirect('http://localhost:5177/?connected=1')
  } catch (err) {
    res.status(500).send('Auth failed')
  }
})

app.get('/api/status', (req, res) => {
  const tokens = loadTokens()
  res.json({ connected: Boolean(tokens) })
})

app.get('/api/events', async (req, res) => {
  try {
    const client = getAuthedClient()
    if (!client) return res.status(401).json({ error: 'Not connected' })

    const calendar = google.calendar({ version: 'v3', auth: client })
    const now = new Date().toISOString()
    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now,
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    })

    res.json({ items: result.data.items || [] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' })
  }
})

app.post('/api/events', async (req, res) => {
  try {
    const client = getAuthedClient()
    if (!client) return res.status(401).json({ error: 'Not connected' })

    const { title, date, time, durationMinutes, attendeeEmail } = req.body || {}
    if (!title || !date || !time || !durationMinutes) {
      return res.status(400).json({ error: 'Missing fields' })
    }

    const start = new Date(`${date}T${time}:00`)
    const end = new Date(start.getTime() + Number(durationMinutes) * 60000)

    const calendar = google.calendar({ version: 'v3', auth: client })
    const event = {
      summary: title,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined
    }

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    })

    res.json({ event: result.data })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create event' })
  }
})

app.listen(PORT, () => {
  console.log(`Calendar server running on http://localhost:${PORT}`)
})
