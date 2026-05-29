const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const db = require('./db');
const security = require('./security');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Setup directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(UPLOADS_DIR, 'tmp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer setup for temporary uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique name for temp file to avoid clashes
    const uniqueSuffix = crypto.randomUUID();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    // Log to in-memory access log for admin overview
    security.logAccess(req, res, duration);
  });
  next();
});

app.use(session({
  secret: 'bildsharing-session-secret-98765-secure',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: 'lax',
    secure: 'auto',
    httpOnly: true
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for direct /login access
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Authentication Helper Middlewares
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Nicht authentifiziert.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin-Rechte erforderlich.' });
  }
  next();
}

// --- AUTHENTICATION API ---

app.post('/api/auth/login', security.securityLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });
  }

  const ip = security.getClientIp(req);
  const user = db.getUser(username);
  if (!user) {
    security.recordFailedAttempt(ip, username);
    return res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort.' });
  }

  const hashedPassword = db.hashPassword(password);
  if (user.password !== hashedPassword) {
    security.recordFailedAttempt(ip, username);
    return res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort.' });
  }

  // Set session user
  req.session.user = {
    username: user.username,
    role: user.role
  };

  // Track rolling last 3 admin login IPs in whitelist
  if (user.role === 'admin') {
    security.addAdminLoginIp(ip);
  }

  res.json({
    success: true,
    user: req.session.user
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout fehlgeschlagen.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// --- ADMIN API ---

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });
  }

  try {
    const newUser = db.createUser(username, password, role || 'user');
    res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:username', requireAuth, requireAdmin, (req, res) => {
  const usernameToDelete = req.params.username;
  try {
    db.deleteUser(usernameToDelete);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:username/password', requireAuth, requireAdmin, (req, res) => {
  const usernameToUpdate = req.params.username;
  const { password } = req.body;
  
  if (!password || password.trim() === '') {
    return res.status(400).json({ error: 'Das neue Passwort darf nicht leer sein.' });
  }
  
  try {
    db.updateUserPassword(usernameToUpdate, password.trim());
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/storage-stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const stats = db.getStorageStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/security/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(security.getSecurityStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/security/access-log', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(security.getAccessLog());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/security/unban', requireAuth, requireAdmin, (req, res) => {
  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ error: 'IP-Adresse ist erforderlich.' });
  }
  try {
    const success = security.unbanIp(ip);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'IP-Adresse nicht in Sperrliste oder Fehlversuchsliste gefunden.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/security/whitelist', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(security.getWhitelist());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/security/whitelist', requireAuth, requireAdmin, (req, res) => {
  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ error: 'IP-Adresse ist erforderlich.' });
  }
  try {
    const success = security.addToWhitelist(ip);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'IP-Adresse konnte nicht hinzugefügt werden (bereits whitelisted oder ungültig).' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/security/whitelist/remove', requireAuth, requireAdmin, (req, res) => {
  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ error: 'IP-Adresse ist erforderlich.' });
  }
  try {
    const success = security.removeFromWhitelist(ip);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'IP-Adresse konnte nicht aus der Whitelist entfernt werden (Localhost loopback IPs sind geschützt).' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- IMAGES & SESSIONS API ---

// Get all sessions visible to the user
app.get('/api/sessions', requireAuth, (req, res) => {
  const sessions = db.getSessionsForUser(req.session.user.username);
  res.json(sessions);
});

// Get demo user upload count in the last hour
app.get('/api/demo/upload-count', requireAuth, (req, res) => {
  try {
    const count = db.getUploadedFilesCountInLastHour(req.session.user.username);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a session
app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const sessionId = req.params.id;
  try {
    db.deleteSession(sessionId, req.session.user.username);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rename a session
app.put('/api/sessions/:id', requireAuth, (req, res) => {
  const sessionId = req.params.id;
  const { title } = req.body;
  try {
    const updatedSession = db.updateSessionTitle(sessionId, title, req.session.user.username);
    res.json({ success: true, session: updatedSession });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Upload images / ZIP files
app.post('/api/sessions/upload', requireAuth, upload.array('files'), (req, res) => {
  const { title } = req.body;
  const files = req.files;

  let sessionTitle = title ? title.trim() : '';
  if (!sessionTitle) {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const username = req.session.user.username;
    const displayUser = username.charAt(0).toUpperCase() + username.slice(1);
    sessionTitle = `${displayUser} ${formattedDate}`;
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Keine Dateien hochgeladen.' });
  }

  // Enforce demo mode limits (max 10 files per hour)
  if (req.session.user.username.toLowerCase() === 'demo') {
    const alreadyUploaded = db.getUploadedFilesCountInLastHour('demo');
    const incomingCount = files.length;
    if (alreadyUploaded + incomingCount > 10) {
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (e) {}
        }
      });
      return res.status(429).json({
        error: `Limit im Demomodus überschritten. Sie können maximal 10 Bilder pro Stunde hochladen (bereits hochgeladen: ${alreadyUploaded}, versucht: ${incomingCount}).`
      });
    }
  }

  const sessionId = crypto.randomUUID();
  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const processedFiles = [];

  try {
    for (const file of files) {
      const isZip = file.mimetype === 'application/zip' || 
                    file.mimetype === 'application/x-zip-compressed' || 
                    path.extname(file.originalname).toLowerCase() === '.zip';

      if (isZip) {
        // Handle ZIP extraction
        const zip = new AdmZip(file.path);
        const zipEntries = zip.getEntries();
        
        for (const entry of zipEntries) {
          if (!entry.isDirectory) {
            // Only extract image formats
            const isImage = /\.(jpe?g|png|gif|webp|bmp)$/i.test(entry.entryName);
            if (isImage) {
              const basename = path.basename(entry.entryName);
              // Extract file flatly to the session directory
              zip.extractEntryTo(entry, sessionDir, false, true);
              
              // Read size of extracted file
              const extractedPath = path.join(sessionDir, basename);
              const stats = fs.statSync(extractedPath);
              
              processedFiles.push({
                filename: basename,
                size: stats.size,
                mimetype: getMimeTypeByExtension(basename)
              });
            }
          }
        }
      } else {
        // Handle normal image
        const isImage = file.mimetype.startsWith('image/') || 
                        /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.originalname);
        
        if (isImage) {
          const destPath = path.join(sessionDir, file.originalname);
          // Move file from temp to session directory
          fs.renameSync(file.path, destPath);
          
          processedFiles.push({
            filename: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          });
        }
      }

      // Cleanup temp file if it still exists
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    // Check if we actually saved any images
    if (processedFiles.length === 0) {
      // Cleanup session dir if empty
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      return res.status(400).json({ error: 'Keine gültigen Bilder im Upload oder ZIP gefunden.' });
    }

    // Create session in DB
    const session = db.createSession(sessionId, sessionTitle, req.session.user.username, processedFiles);
    res.status(201).json({ success: true, session });

  } catch (err) {
    console.error('Upload processing error:', err);
    // Cleanup on failure
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    // Cleanup any remaining uploaded temp files
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
    }
    res.status(500).json({ error: 'Fehler bei der Upload-Verarbeitung: ' + err.message });
  }
});

// Secure image serving: only allow users who have access to view/download individual session files
app.get('/uploads/:sessionId/:filename', requireAuth, (req, res) => {
  const { sessionId, filename } = req.params;
  
  // Verify that the user has access to this session
  const userSessions = db.getSessionsForUser(req.session.user.username);
  const hasAccess = userSessions.some(s => s.id === sessionId);

  if (!hasAccess) {
    return res.status(403).json({ error: 'Keine Berechtigung zum Anzeigen dieses Bildes.' });
  }

  // Prevent directory traversal attacks
  const safeFilename = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, sessionId, safeFilename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Bild nicht gefunden.' });
  }
});

// Download entire session as a ZIP file
app.get('/api/sessions/:id/download', requireAuth, (req, res) => {
  const sessionId = req.params.id;

  // Verify access
  const userSessions = db.getSessionsForUser(req.session.user.username);
  const session = userSessions.find(s => s.id === sessionId);

  if (!session) {
    return res.status(403).json({ error: 'Keine Berechtigung zum Herunterladen dieser Session.' });
  }

  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: 'Session-Ordner nicht gefunden.' });
  }

  try {
    const zip = new AdmZip();
    zip.addLocalFolder(sessionDir);
    const zipBuffer = zip.toBuffer();

    // Format safe filename
    const safeTitle = (session.title || 'bilder')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .trim();

    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'images'}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err) {
    console.error('Error generating download ZIP:', err);
    res.status(500).json({ error: 'Fehler beim Generieren der ZIP-Datei.' });
  }
});

// Download selected files from a session as a ZIP file
app.post('/api/sessions/:id/download-selected', requireAuth, (req, res) => {
  const sessionId = req.params.id;
  const { filenames } = req.body;

  if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
    return res.status(400).json({ error: 'Keine Dateien ausgewählt.' });
  }

  // Verify access
  const userSessions = db.getSessionsForUser(req.session.user.username);
  const session = userSessions.find(s => s.id === sessionId);

  if (!session) {
    return res.status(403).json({ error: 'Keine Berechtigung zum Herunterladen dieser Auswahl.' });
  }

  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return res.status(404).json({ error: 'Session-Ordner nicht gefunden.' });
  }

  try {
    const zip = new AdmZip();
    for (const filename of filenames) {
      // Prevent directory traversal
      const safeFilename = path.basename(filename);
      const filePath = path.join(sessionDir, safeFilename);
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath);
      }
    }

    const zipBuffer = zip.toBuffer();
    
    // Format safe filename
    const safeTitle = `${(session.title || 'bilder')}-auswahl`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .trim();

    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'selection'}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err) {
    console.error('Error generating selection ZIP:', err);
    res.status(500).json({ error: 'Fehler beim Generieren der ZIP-Datei.' });
  }
});

// Helper: Mime type mapper for ZIP extractions
function getMimeTypeByExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.bmp': return 'image/bmp';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Express global error handler:', err);
  res.status(500).json({ error: 'Ein interner Serverfehler ist aufgetreten.' });
});

// Start Server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`==================================================`);
  console.log(`Bildsharing Server läuft auf Port ${PORT}`);
  console.log(`Lokal erreichbar unter: http://127.0.0.1:${PORT}`);
  console.log(`==================================================`);
});
