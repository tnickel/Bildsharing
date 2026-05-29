const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const SECRETS_FILE = path.join(DB_DIR, 'secrets.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const PASSWORD_ITERATIONS = 310000;
const PASSWORD_KEYLEN = 32;
const PASSWORD_DIGEST = 'sha256';

// Create directories if they do not exist
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readOrCreateSecrets() {
  if (process.env.PASSWORD_PEPPER && process.env.SESSION_SECRET) {
    return {
      passwordPepper: process.env.PASSWORD_PEPPER,
      sessionSecret: process.env.SESSION_SECRET
    };
  }

  let secrets = {};
  if (fs.existsSync(SECRETS_FILE)) {
    try {
      secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
    } catch (err) {
      console.error('Error reading secrets file:', err);
    }
  }

  if (!secrets.passwordPepper) {
    secrets.passwordPepper = crypto.randomBytes(32).toString('hex');
  }
  if (!secrets.sessionSecret) {
    secrets.sessionSecret = crypto.randomBytes(48).toString('hex');
  }

  try {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    console.error('Error writing secrets file:', err);
  }

  return {
    passwordPepper: process.env.PASSWORD_PEPPER || secrets.passwordPepper,
    sessionSecret: process.env.SESSION_SECRET || secrets.sessionSecret
  };
}

const serverSecrets = readOrCreateSecrets();

// Initial database template
const defaultDb = {
  users: [],
  sessions: []
};

// Helper: read DB from file
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(defaultDb);
      return defaultDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file:', err);
    return defaultDb;
  }
}

// Helper: write DB to file
function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function createPasswordGroup(password) {
  return crypto.createHmac('sha256', serverSecrets.passwordPepper).update(password).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;

  if (storedPassword.startsWith('pbkdf2$')) {
    const parts = storedPassword.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expectedHash = parts[3];
    const actualHash = crypto.pbkdf2Sync(password, salt, iterations, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
    return safeEqual(actualHash, expectedHash);
  }

  // Legacy HMAC-SHA256 support for accounts not yet migrated.
  return safeEqual(hashPassword(password), storedPassword);
}

// Legacy hash kept only so old DB entries can still log in before password rotation.
function hashPassword(password) {
  return crypto.createHmac('sha256', 'bildsharing-platform-secure-salt-2026').update(password).digest('hex');
}

function applyPassword(user, password) {
  user.password = createPasswordRecord(password);
  user.passwordGroup = createPasswordGroup(password);
  delete user.plainPassword;
}

function migrateStoredPasswords() {
  const db = readDb();
  let changed = false;

  db.users.forEach(user => {
    if (user.plainPassword) {
      applyPassword(user, user.plainPassword);
      changed = true;
      return;
    }

    if (!user.passwordGroup) {
      // Legacy rows without a plaintext migration source keep their old sharing bucket
      // until the admin rotates their password.
      user.passwordGroup = `legacy:${user.password}`;
      changed = true;
    }
  });

  if (changed) {
    writeDb(db);
  }
}

// Seed admin user if DB is empty or has no admin
function seedAdmin() {
  const db = readDb();
  const hasAdmin = db.users.some(u => u.role === 'admin');
  if (!hasAdmin) {
    const adminUser = {
      username: 'admin',
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    applyPassword(adminUser, process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url'));
    db.users.push(adminUser);
    writeDb(db);
    console.log('--- ADMIN SEED ---');
    console.log('Created default admin account:');
    console.log('Username: admin');
    console.log('Password was generated or read from INITIAL_ADMIN_PASSWORD.');
    console.log('Set INITIAL_ADMIN_PASSWORD on first deployment and rotate it after login.');
    console.log('------------------');
  }
}

// Seed the admin user upon loading this module
seedAdmin();
migrateStoredPasswords();

// Seed demo user
function seedDemoUser() {
  const db = readDb();
  const hasDemo = db.users.some(u => u.username === 'demo');
  if (!hasDemo) {
    const demoUser = {
      username: 'demo',
      role: 'user',
      createdAt: new Date().toISOString()
    };
    applyPassword(demoUser, 'demo123');
    db.users.push(demoUser);
    writeDb(db);
  }
}

// Seed demo session containing 3 nature images
function seedDemoSession() {
  const db = readDb();
  const demoSessionId = 'demo-session-1111-2222-333333333333';
  const hasDemoSession = db.sessions.some(s => s.id === demoSessionId);
  if (!hasDemoSession) {
    const demoSessionDir = path.join(UPLOADS_DIR, demoSessionId);
    if (!fs.existsSync(demoSessionDir)) {
      fs.mkdirSync(demoSessionDir, { recursive: true });
    }

    const images = [
      { name: 'misty_meditation.png', src: path.join(__dirname, 'public', 'images', 'demo', 'misty_meditation.png') },
      { name: 'zen_stones.png', src: path.join(__dirname, 'public', 'images', 'demo', 'zen_stones.png') },
      { name: 'mountain_lake.png', src: path.join(__dirname, 'public', 'images', 'demo', 'mountain_lake.png') }
    ];


    const filesList = [];
    images.forEach(img => {
      const destPath = path.join(demoSessionDir, img.name);
      let size = 1000;
      if (fs.existsSync(img.src)) {
        try {
          fs.copyFileSync(img.src, destPath);
          size = fs.statSync(destPath).size;
        } catch (e) {
          console.error("Failed to copy image:", img.src, e.message);
        }
      } else {
        const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        fs.writeFileSync(destPath, dummyPng);
        size = dummyPng.length;
      }

      filesList.push({
        filename: img.name,
        size: size,
        mimetype: 'image/png'
      });
    });

    const demoSession = {
      id: demoSessionId,
      title: 'Achtsamkeit in der Natur (Demo)',
      uploadedBy: 'demo',
      createdAt: new Date().toISOString(),
      files: filesList
    };

    db.sessions.push(demoSession);
    writeDb(db);
  }
}

seedDemoUser();
seedDemoSession();

module.exports = {
  hashPassword,
  verifyPassword,
  sessionSecret: serverSecrets.sessionSecret,

  getUploadedFilesCountInLastHour(username) {
    const db = readDb();
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentSessions = db.sessions.filter(s => 
      s.uploadedBy.toLowerCase() === username.toLowerCase() &&
      s.id !== 'demo-session-1111-2222-333333333333' &&
      new Date(s.createdAt).getTime() > oneHourAgo
    );
    return recentSessions.reduce((acc, s) => acc + (s.files ? s.files.length : 0), 0);
  },

  // --- USER OPERATIONS ---
  getUsers() {
    const db = readDb();
    return db.users.map(u => ({
      username: u.username,
      role: u.role,
      createdAt: u.createdAt
    }));
  },

  getUser(username) {
    const db = readDb();
    return db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  },

  createUser(username, password, role = 'user') {
    const db = readDb();
    const normalizedUsername = username.trim();
    
    // Check if user already exists
    if (db.users.some(u => u.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      throw new Error('Benutzername existiert bereits.');
    }

    const newUser = {
      username: normalizedUsername,
      role: role,
      createdAt: new Date().toISOString()
    };
    applyPassword(newUser, password);

    db.users.push(newUser);
    writeDb(db);
    return { username: newUser.username, role: newUser.role, createdAt: newUser.createdAt };
  },

  deleteUser(username) {
    const db = readDb();
    const normalizedUsername = username.toLowerCase();
    
    if (normalizedUsername === 'admin') {
      throw new Error('Der Haupt-Admin-Account kann nicht gelöscht werden.');
    }

    const index = db.users.findIndex(u => u.username.toLowerCase() === normalizedUsername);
    if (index === -1) {
      throw new Error('Benutzer nicht gefunden.');
    }

    db.users.splice(index, 1);
    writeDb(db);
    return true;
  },

  updateUserPassword(username, password) {
    const db = readDb();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      throw new Error('Benutzer nicht gefunden.');
    }
    applyPassword(user, password);
    writeDb(db);
    return true;
  },

  // --- SESSION OPERATIONS ---
  // Get sessions visible to a specific user (users with the same password see each other's sessions)
  getSessionsForUser(username) {
    const db = readDb();
    const currentUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!currentUser) return [];

    // Admins can see all sessions
    if (currentUser.role === 'admin') {
      return db.sessions;
    }

    // Find all users who share the same password group without storing plaintext passwords.
    const sharingGroupUsernames = db.users
      .filter(u => u.passwordGroup && u.passwordGroup === currentUser.passwordGroup)
      .map(u => u.username.toLowerCase());

    // Filter sessions uploaded by anyone in this group
    return db.sessions.filter(s => sharingGroupUsernames.includes(s.uploadedBy.toLowerCase()));
  },

  createSession(id, title, uploadedBy, files) {
    const db = readDb();
    const newSession = {
      id: id,
      title: title || `${uploadedBy} vom ${new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      uploadedBy: uploadedBy,
      createdAt: new Date().toISOString(),
      files: files // Array of { filename, originalname, size, mimetype }
    };

    db.sessions.unshift(newSession); // Add to the beginning of the list
    writeDb(db);
    return newSession;
  },

  deleteSession(id, username) {
    const db = readDb();
    const index = db.sessions.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Session nicht gefunden.');
    }

    const session = db.sessions[index];
    const currentUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!currentUser) {
      throw new Error('Nicht autorisiert.');
    }

    // Only the creator, an admin, or someone in the sharing group can delete?
    // Let's restrict deletion to the creator or an admin.
    if (currentUser.role !== 'admin' && session.uploadedBy.toLowerCase() !== username.toLowerCase()) {
      throw new Error('Keine Berechtigung zum Löschen dieser Session.');
    }

    // Delete session files from disk
    const sessionDir = path.join(UPLOADS_DIR, id);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Error deleting files for session ${id}:`, err);
      }
    }

    db.sessions.splice(index, 1);
    writeDb(db);
    return true;
  },

  deleteFileFromSession(id, filename, username) {
    const db = readDb();
    const index = db.sessions.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Session nicht gefunden.');
    }

    const session = db.sessions[index];
    const currentUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!currentUser) {
      throw new Error('Nicht autorisiert.');
    }

    // Only owner or admin can delete
    if (currentUser.role !== 'admin' && session.uploadedBy.toLowerCase() !== username.toLowerCase()) {
      throw new Error('Keine Berechtigung zum Löschen dieses Bildes.');
    }

    const fileIndex = session.files.findIndex(f => f.filename === filename);
    if (fileIndex === -1) {
      throw new Error('Datei nicht in der Session gefunden.');
    }

    // Delete file from disk
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, id, safeFilename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Error deleting file ${filename} from disk:`, err);
      }
    }

    // Remove file entry from DB
    session.files.splice(fileIndex, 1);
    
    writeDb(db);
    return true;
  },

  updateSessionTitle(id, title, username) {
    const db = readDb();
    const index = db.sessions.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Session nicht gefunden.');
    }

    const session = db.sessions[index];
    const currentUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!currentUser) {
      throw new Error('Nicht autorisiert.');
    }

    // Only creator or admin can update title
    if (currentUser.role !== 'admin' && session.uploadedBy.toLowerCase() !== username.toLowerCase()) {
      throw new Error('Keine Berechtigung zum Bearbeiten dieser Session.');
    }

    if (!title || title.trim() === '') {
      throw new Error('Name der Galerie darf nicht leer sein.');
    }

    session.title = title.trim();
    writeDb(db);
    return session;
  },

  getStorageStats() {
    const db = readDb();
    
    // Group users by password group (sharing group)
    const groupsMap = {};
    db.users.forEach(u => {
      // Exclude admin from regular group storage counting if desired, but let's count for all users
      const hash = u.passwordGroup || `legacy:${u.password}`;
      if (!groupsMap[hash]) {
        groupsMap[hash] = {
          usernames: []
        };
      }
      groupsMap[hash].usernames.push(u.username);
    });

    const stats = [];
    Object.keys(groupsMap).forEach(hash => {
      const groupInfo = groupsMap[hash];
      const usernamesLower = groupInfo.usernames.map(name => name.toLowerCase());

      // Filter all sessions uploaded by any member of this sharing group
      const groupSessions = db.sessions.filter(s => usernamesLower.includes(s.uploadedBy.toLowerCase()));
      
      let totalSize = 0;
      let fileCount = 0;
      groupSessions.forEach(s => {
        if (s.files && Array.isArray(s.files)) {
          s.files.forEach(f => {
            totalSize += (f.size || 0);
            fileCount++;
          });
        }
      });

      stats.push({
        usernames: groupInfo.usernames,
        totalSize: totalSize,
        sessionCount: groupSessions.length,
        fileCount: fileCount
      });
    });

    return stats;
  }
};
