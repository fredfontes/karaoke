import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json());

// Persistent session store & SSE clients for seamless real-time syncing
const SESSIONS_FILE = path.join(__dirname, '.sessions.json');
let sessions = new Map();

try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    sessions = new Map(Object.entries(parsed));
  }
} catch (e) {
  sessions = new Map();
}

function persistSessions() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {}
}

const sseClients = new Map(); // sessionCode -> Set of res objects

function broadcastSession(code, data) {
  const clients = sseClients.get(code);
  if (clients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of Array.from(clients)) {
      try {
        client.write(payload);
      } catch (err) {
        clients.delete(client);
      }
    }
  }
}

// Session sync endpoints
app.get('/api/sessions/:code', (req, res) => {
  const { code } = req.params;
  const session = sessions.get(code);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

app.post('/api/sessions/:code', (req, res) => {
  const { code } = req.params;
  const incoming = req.body;
  const existing = sessions.get(code) || { songs: [], currentSong: null };
  const updated = {
    ...existing,
    ...incoming,
    code,
    updatedAt: new Date().toISOString()
  };
  sessions.set(code, updated);
  persistSessions();
  broadcastSession(code, updated);
  res.json({ success: true, session: updated });
});

// Direct endpoint to add a song to the queue
app.post('/api/sessions/:code/songs', (req, res) => {
  const { code } = req.params;
  const song = req.body;
  if (!song || !song.videoId) {
    return res.status(400).json({ error: 'Missing song information' });
  }

  let session = sessions.get(code);
  if (!session) {
    session = {
      code,
      host: 'Anfitrião',
      songs: [],
      currentSong: null,
      createdAt: new Date().toISOString()
    };
  }

  if (!session.songs) session.songs = [];
  session.songs.push(song);
  session.updatedAt = new Date().toISOString();

  sessions.set(code, session);
  persistSessions();
  broadcastSession(code, session);

  res.json({ success: true, session });
});

// Update countdown state across all devices
app.post('/api/sessions/:code/countdown', (req, res) => {
  const { code } = req.params;
  const { singer, title, songId, seconds, active } = req.body;
  let session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (active) {
    session.countdown = { singer, title, songId, seconds: seconds || 10, startedAt: Date.now() };
    session.status = 'countdown';
  } else {
    session.countdown = null;
    if (session.status === 'countdown') session.status = 'idle';
  }
  session.updatedAt = new Date().toISOString();
  sessions.set(code, session);
  persistSessions();
  broadcastSession(code, session);
  res.json({ success: true, session });
});

// Skip song endpoint
app.post('/api/sessions/:code/skip', (req, res) => {
  const { code } = req.params;
  let session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  session.currentSong = null;
  session.countdown = null;
  session.status = 'idle';
  session.updatedAt = new Date().toISOString();
  sessions.set(code, session);
  persistSessions();
  broadcastSession(code, session);
  res.json({ success: true, session });
});

// Server-Sent Events for real-time room updates
app.get('/api/sessions/:code/stream', (req, res) => {
  const { code } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!sseClients.has(code)) {
    sseClients.set(code, new Set());
  }
  const clientSet = sseClients.get(code);
  clientSet.add(res);

  // Send current state immediately if available
  const current = sessions.get(code);
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clientSet.delete(res);
    if (clientSet.size === 0) {
      sseClients.delete(code);
    }
  });
});

// Video search proxy for reliable YouTube karaoke results
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing search query' });
  }

  const searchTerm = query.toLowerCase().includes('karaoke') ? query : `${query} karaoke`;

  // 1. First attempt: Direct YouTube search scrape (no API key needed)
  try {
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`;
    const ytRes = await fetch(ytUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (ytRes.ok) {
      const html = await ytRes.text();

      // Find ytInitialData JSON
      const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});\s*<\/script>/);
      if (jsonMatch) {
        const initialData = JSON.parse(jsonMatch[1]);
        const contents = initialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
        
        if (Array.isArray(contents)) {
          for (const item of contents) {
            const v = item.videoRenderer;
            if (v && v.videoId) {
              const title = v.title?.runs?.[0]?.text || searchTerm;
              return res.json({ videoId: v.videoId, title });
            }
          }
        }
      }

      // Regex fallback on raw HTML
      const videoMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (videoMatch) {
        return res.json({ videoId: videoMatch[1], title: searchTerm });
      }
    }
  } catch (err) {
    console.warn('YouTube direct search attempt failed:', err.message);
  }

  // 2. Second attempt: Piped API instance
  try {
    const pipedRes = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(searchTerm)}&filter=videos`);
    if (pipedRes.ok) {
      const pipedData = await pipedRes.json();
      if (pipedData?.items?.length > 0) {
        const item = pipedData.items[0];
        const videoId = item.url ? item.url.replace('/watch?v=', '') : null;
        if (videoId) {
          return res.json({ videoId, title: item.title || searchTerm });
        }
      }
    }
  } catch (err) {
    console.warn('Piped search attempt failed:', err.message);
  }

  // Default fallback if all search providers fail
  return res.json({ videoId: 'L0MK7qz13bU', title: searchTerm });
});

// Serve static assets and HTML
app.use(express.static(__dirname));

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`KARAOKE.TOP dev server running at http://${HOST}:${PORT}`);
});
