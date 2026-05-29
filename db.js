const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Global salt/pepper to hash passwords. Using the same salt ensures users with the same
// password get the same hash, enabling password-based group sharing.
const SERVER_SALT = 'bildsharing-platform-secure-salt-2026';

// Create directories if they do not exist
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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

// Hash password with static server salt
function hashPassword(password) {
  return crypto.createHmac('sha256', SERVER_SALT).update(password).digest('hex');
}

// Seed admin user if DB is empty or has no admin
function seedAdmin() {
  const db = readDb();
  const hasAdmin = db.users.some(u => u.role === 'admin');
  if (!hasAdmin) {
    const adminUser = {
      username: 'admin',
      password: hashPassword('admin123'), // Default password, user can delete/re-create or we log it
      plainPassword: 'admin123',
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    db.users.push(adminUser);
    writeDb(db);
    console.log('--- ADMIN SEED ---');
    console.log('Created default admin account:');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('Please change the password or create a new admin after login!');
    console.log('------------------');
  }
}

// Seed the admin user upon loading this module
seedAdmin();

// Seed demo user
function seedDemoUser() {
  const db = readDb();
  const hasDemo = db.users.some(u => u.username === 'demo');
  if (!hasDemo) {
    const demoUser = {
      username: 'demo',
      password: hashPassword('demo123'),
      plainPassword: 'demo123',
      role: 'user',
      createdAt: new Date().toISOString()
    };
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
      createdAt: u.createdAt,
      plainPassword: u.plainPassword || 'N/A'
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
      password: hashPassword(password),
      plainPassword: password,
      role: role,
      createdAt: new Date().toISOString()
    };

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
    user.password = hashPassword(password);
    user.plainPassword = password;
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

    // Find all users who share the exact same password hash
    const sharingGroupUsernames = db.users
      .filter(u => u.password === currentUser.password)
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
    
    // Group users by password hash (sharing group)
    const groupsMap = {};
    db.users.forEach(u => {
      // Exclude admin from regular group storage counting if desired, but let's count for all users
      const hash = u.password;
      if (!groupsMap[hash]) {
        groupsMap[hash] = {
          usernames: [],
          plainPassword: u.plainPassword || 'N/A'
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
        plainPassword: groupInfo.plainPassword,
        totalSize: totalSize,
        sessionCount: groupSessions.length,
        fileCount: fileCount
      });
    });

    return stats;
  }
};
