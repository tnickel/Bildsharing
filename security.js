// --- SECURITY MODULE: FAIL-TO-BAN & IP LIMITER ---

const MAX_ATTEMPTS = 5;
const BAN_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window for failed attempts

// In-Memory storage
const failedAttempts = new Map(); // IP -> { count, lastAttemptAt }
const bans = new Map(); // IP -> bannedUntil (Timestamp)
const securityLog = []; // Array of { timestamp, type, ip, message }
const accessLog = []; // Array of { timestamp, method, url, ip, username, statusCode, durationMs }

// Whitelisted IPs
const whitelist = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  '84.46.247.222'
]);

const lastAdminLogins = []; // Stores rolling last 3 successful admin login IPs

function getWhitelist() {
  const combined = new Set(whitelist);
  lastAdminLogins.forEach(ip => combined.add(ip));
  return Array.from(combined);
}

function isWhitelisted(ip) {
  if (!ip) return false;
  const ipTrimmed = ip.trim();
  return whitelist.has(ipTrimmed) || lastAdminLogins.includes(ipTrimmed);
}

function addAdminLoginIp(ip) {
  if (!ip) return;
  const ipTrimmed = ip.trim();
  
  // If it's already a static system IP, no need to track in rolling list
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1', '84.46.247.222'].includes(ipTrimmed)) {
    return;
  }
  
  // Remove if already in the list to move it to the end (most recent)
  const idx = lastAdminLogins.indexOf(ipTrimmed);
  if (idx !== -1) {
    lastAdminLogins.splice(idx, 1);
  }
  
  // Push as most recent
  lastAdminLogins.push(ipTrimmed);
  logEvent('INFO', ipTrimmed, 'Erfolgreicher Admin-Login. IP im Verlauf der letzten 3 Admin-Logins registriert.');
  
  // Ensure we unban if they were banned or had failed attempts
  if (bans.has(ipTrimmed)) {
    bans.delete(ipTrimmed);
    logEvent('UNBAN', ipTrimmed, 'IP-Adresse automatisch entsperrt da erfolgreicher Admin-Login.');
  }
  if (failedAttempts.has(ipTrimmed)) {
    failedAttempts.delete(ipTrimmed);
  }
  
  // Keep only the last 3
  if (lastAdminLogins.length > 3) {
    const removedIp = lastAdminLogins.shift();
    logEvent('INFO', removedIp, 'IP aus Verlauf der letzten 3 Admin-Logins entfernt (Rollierendes Limit von 3 überschritten).');
  }
}

function addToWhitelist(ip) {
  if (!ip) return false;
  const ipTrimmed = ip.trim();
  if (!whitelist.has(ipTrimmed)) {
    whitelist.add(ipTrimmed);
    logEvent('UNBAN', ipTrimmed, 'IP-Adresse manuell zur Ausnahmeliste (Whitelist) hinzugefügt.');
    
    // Also remove from active bans or failed attempts if present
    if (bans.has(ipTrimmed)) {
      bans.delete(ipTrimmed);
      logEvent('UNBAN', ipTrimmed, 'IP-Adresse automatisch entsperrt da whitelisted.');
    }
    if (failedAttempts.has(ipTrimmed)) {
      failedAttempts.delete(ipTrimmed);
    }
    return true;
  }
  return false;
}

function removeFromWhitelist(ip) {
  if (!ip) return false;
  const ipTrimmed = ip.trim();
  // Do not allow removing localhost loopbacks
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ipTrimmed)) {
    return false;
  }
  
  let removed = false;
  if (whitelist.has(ipTrimmed)) {
    whitelist.delete(ipTrimmed);
    removed = true;
  }
  
  const idx = lastAdminLogins.indexOf(ipTrimmed);
  if (idx !== -1) {
    lastAdminLogins.splice(idx, 1);
    removed = true;
  }
  
  if (removed) {
    logEvent('INFO', ipTrimmed, 'IP-Adresse aus Ausnahmeliste (Whitelist) entfernt.');
    return true;
  }
  return false;
}

// Helper to limit log size
function logEvent(type, ip, message) {
  securityLog.unshift({
    timestamp: new Date().toISOString(),
    type, // 'INFO', 'WARN', 'BAN', 'UNBAN'
    ip,
    message
  });
  if (securityLog.length > 50) {
    securityLog.pop();
  }
}

// Helper to extract IP taking reverse proxy into account
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Return first IP in the list
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress;
}

// Check if IP is currently banned
function isBanned(ip) {
  if (isWhitelisted(ip)) {
    return false;
  }
  if (bans.has(ip)) {
    const bannedUntil = bans.get(ip);
    if (Date.now() < bannedUntil) {
      return true;
    }
    // Ban expired
    bans.delete(ip);
    logEvent('INFO', ip, 'Temporäre Sperre automatisch abgelaufen.');
  }
  return false;
}

// Record a failed attempt
function recordFailedAttempt(ip, username) {
  if (isWhitelisted(ip)) {
    return;
  }
  const now = Date.now();
  let attempts = failedAttempts.get(ip);

  // If no entry or window expired, reset attempts count
  if (!attempts || (now - attempts.lastAttemptAt > WINDOW_MS)) {
    attempts = { count: 0, lastAttemptAt: now };
  }

  attempts.count += 1;
  attempts.lastAttemptAt = now;
  failedAttempts.set(ip, attempts);

  logEvent('WARN', ip, `Fehlgeschlagener Anmeldeversuch für Benutzer: "${username}" (${attempts.count}/${MAX_ATTEMPTS})`);

  // Check if threshold reached
  if (attempts.count >= MAX_ATTEMPTS) {
    const bannedUntil = now + BAN_DURATION_MS;
    bans.set(ip, bannedUntil);
    failedAttempts.delete(ip); // Reset attempts after ban is applied
    logEvent('BAN', ip, `IP-Adresse gesperrt für 15 Minuten aufgrund von ${MAX_ATTEMPTS} fehlgeschlagenen Anmeldeversuchen.`);
  }
}

// Manually unban an IP
function unbanIp(ip) {
  const ipTrimmed = ip.trim();
  let found = false;

  if (bans.has(ipTrimmed)) {
    bans.delete(ipTrimmed);
    found = true;
  }
  if (failedAttempts.has(ipTrimmed)) {
    failedAttempts.delete(ipTrimmed);
    found = true;
  }

  if (found) {
    logEvent('UNBAN', ipTrimmed, 'IP-Adresse manuell durch Administrator entsperrt.');
    return true;
  }
  return false;
}

// Get current stats for admin overview
function getSecurityStats() {
  const activeBans = [];
  const now = Date.now();

  bans.forEach((bannedUntil, ip) => {
    if (now < bannedUntil) {
      activeBans.push({
        ip,
        bannedUntil: new Date(bannedUntil).toISOString(),
        timeLeftSeconds: Math.max(0, Math.round((bannedUntil - now) / 1000))
      });
    } else {
      bans.delete(ip);
    }
  });

  return {
    activeBans,
    securityLog
  };
}

// Express Middleware to check for banned IPs
function securityLimiter(req, res, next) {
  const ip = getClientIp(req);
  if (isBanned(ip)) {
    const bannedUntil = bans.get(ip);
    const timeLeftMinutes = Math.ceil((bannedUntil - Date.now()) / 1000 / 60);
    return res.status(429).json({
      error: `Diese IP-Adresse wurde vorübergehend gesperrt. Bitte versuchen Sie es in ${timeLeftMinutes} Minuten erneut.`
    });
  }
  next();
}

function logAccess(req, res, durationMs) {
  const ip = getClientIp(req);
  const username = req.session && req.session.user ? req.session.user.username : 'unbekannt';
  
  accessLog.unshift({
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: ip,
    username: username,
    statusCode: res.statusCode,
    durationMs: durationMs
  });
  
  // Limit to last 100 entries
  if (accessLog.length > 100) {
    accessLog.pop();
  }
}

function getAccessLog() {
  return accessLog;
}

module.exports = {
  securityLimiter,
  recordFailedAttempt,
  unbanIp,
  getSecurityStats,
  getClientIp,
  getWhitelist,
  isWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
  addAdminLoginIp,
  logAccess,
  getAccessLog
};
