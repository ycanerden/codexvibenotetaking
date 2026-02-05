const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const transcribeBtn = document.getElementById('transcribeBtn');
const enhanceBtn = document.getElementById('enhanceBtn');

const transcriptEl = document.getElementById('transcript');
const draftEl = document.getElementById('draft');
const enhancedEl = document.getElementById('enhanced');

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const elapsedEl = document.getElementById('elapsed');

const apiKeyEl = document.getElementById('apiKey');
const sttModelEl = document.getElementById('sttModel');
const chatModelEl = document.getElementById('chatModel');

let displayStream;
let micStream;
let mixedStream;
let mediaRecorder;
let recordedChunks = [];
let elapsedTimer;
let elapsedSeconds = 0;

function setStatus(isRecording) {
  statusText.textContent = isRecording ? 'Recording' : 'Idle';
  statusDot.style.background = isRecording ? 'var(--recording)' : 'var(--edge)';
}

function tick() {
  elapsedSeconds += 1;
  const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const s = String(elapsedSeconds % 60).padStart(2, '0');
  elapsedEl.textContent = `${m}:${s}`;
}

async function startRecording() {
  recordedChunks = [];
  transcriptEl.textContent = '';
  enhancedEl.textContent = '';

  displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      channelCount: 2,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  // Stop video track to avoid capturing screen visuals.
  displayStream.getVideoTracks().forEach(t => t.stop());

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  const displaySource = audioContext.createMediaStreamSource(displayStream);
  const micSource = audioContext.createMediaStreamSource(micStream);

  displaySource.connect(destination);
  micSource.connect(destination);

  mixedStream = destination.stream;

  mediaRecorder = new MediaRecorder(mixedStream, { mimeType: 'audio/webm' });
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start();

  elapsedSeconds = 0;
  elapsedEl.textContent = '00:00';
  elapsedTimer = setInterval(tick, 1000);

  setStatus(true);
  startBtn.disabled = true;
  stopBtn.disabled = false;
  transcribeBtn.disabled = true;
  enhanceBtn.disabled = true;
}

function stopTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(elapsedTimer);
  setStatus(false);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  transcribeBtn.disabled = false;

  stopTracks(displayStream);
  stopTracks(micStream);
  stopTracks(mixedStream);
}

async function transcribe() {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    alert('Paste your Groq API key first.');
    return;
  }

  if (!recordedChunks.length) {
    alert('No recording found.');
    return;
  }

  const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', audioBlob, 'meeting.webm');
  form.append('model', sttModelEl.value.trim());
  form.append('response_format', 'json');

  transcriptEl.textContent = 'Transcribing...';

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!res.ok) {
    transcriptEl.textContent = `Transcription failed: ${res.status}`;
    return;
  }

  const data = await res.json();
  const text = data.text || '';
  transcriptEl.textContent = text;
  if (!draftEl.value.trim()) {
    draftEl.value = text
      .split('. ')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map(s => `- ${s}`)
      .join('\n');
  }

  enhanceBtn.disabled = false;
}

async function enhance() {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    alert('Paste your Groq API key first.');
    return;
  }

  const model = chatModelEl.value.trim();
  const transcript = transcriptEl.textContent.trim();
  const draft = draftEl.value.trim();

  const prompt = `Transcript:\n${transcript}\n\nDraft Notes:\n${draft}\n\nReturn:\nSummary (1 paragraph)\nDecisions (bullets)\nAction Items (bullets)`;

  enhancedEl.textContent = 'Enhancing...';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a concise meeting notes assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    enhancedEl.textContent = `Enhancement failed: ${res.status}`;
    return;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  enhancedEl.textContent = content;
}

startBtn.addEventListener('click', () => startRecording().catch(err => alert(err)));
stopBtn.addEventListener('click', stopRecording);
transcribeBtn.addEventListener('click', () => transcribe().catch(err => alert(err)));
enhanceBtn.addEventListener('click', () => enhance().catch(err => alert(err)));

setStatus(false);
