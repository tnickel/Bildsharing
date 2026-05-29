# Projekt-Dokumentation: ZenShare Bildsharing-Plattform

Diese Dokumentation beschreibt die Architektur, die Sicherheitsvorkehrungen (einschließlich der Fail-to-Ban-Middleware) und die Serverkonfiguration der ZenShare-Bildsharing-Plattform.

---

## 1. Systemübersicht & Architektur

ZenShare ist eine schlanke, performante Webanwendung zur Verwaltung und Freigabe von Bildergalerien für Meditations-Kurse und andere Events.

### Tech-Stack:
* **Backend**: Node.js mit [Express](https://expressjs.com/) für API-Endpunkte und Routing.
* **Persistenz**: Dateibasierte JSON-Datenbank (`data/db.json`), gekapselt in `db.js`. Die Datenbank initialisiert und seedet sich beim ersten Start automatisch (legt einen Standard-Admin und eine Demo-Galerie an).
* **Uploads**: [Multer](https://github.com/expressjs/multer) zur temporären Speicherung hochgeladener Bilddateien. Zip-Archive werden mit [adm-zip](https://github.com/cthackers/adm-zip) serverseitig entpackt.
* **Sessions**: In-Memory Express-Sessions für die Benutzeranmeldung und Rollenprüfung.
* **Frontend**: Responsive Single-Page-Application (SPA) in Vanilla HTML5, CSS3 und reinem JavaScript (ohne Frameworks).

---

## 2. Sicherheitsvorkehrungen

Die Anwendung implementiert mehrere ineinandergreifende Sicherheitsbarrieren zum Schutz vor unbefugtem Zugriff und Denial-of-Service-Angriffen (DoS).

### Authentifizierung & Session-Handling
* **Passwort-Hashing**: Passwörter werden mittels HMAC-SHA256 und einem statischen Serversalz (`SERVER_SALT`) gehasht in der JSON-Datenbank gespeichert.
* **Session-Schutz**: Sitzungscookies (`connect.sid`) sind als `httpOnly` und `sameSite: 'lax'` konfiguriert, um Cross-Site-Scripting (XSS) und Session-Hijacking zu erschweren.
* **Rollenbasiertes Rechtesystem (RBAC)**:
  * `requireAuth`: Stellt sicher, dass der Client angemeldet ist.
  * `requireAdmin`: Stellt sicher, dass der angemeldete Benutzer die Rolle `admin` besitzt. Schützt alle administrativen Endpunkte wie Benutzerverwaltung und Whitelists.

### Whitelisting-System
Zum Schutz des Administrators vor versehentlichem Selbstausschluss verfügt das System über ein zweistufiges Whitelist-Konzept:
1. **Statische Whitelist**: Loopback-IP-Adressen (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) sowie die eigene IP-Adresse des Servers (`84.46.247.222`) sind dauerhaft freigeschaltet.
2. **Dynamische Whitelist (Rolling Queue)**: Das System speichert die IP-Adressen der letzten drei erfolgreichen Admin-Logins. Diese IPs werden temporär gewhitelistet. Wechselt der Administrator den Standort/Provider, rückt die neue IP nach, und die älteste fällt aus der Liste.
* *Hinweis*: IP-Adressen auf der Whitelist sind vom Fail-to-Ban-Mechanismus und den API-Sperren ausgenommen.

---

## 3. Fail-to-Ban & IP-Limiter Middleware

Das Fail-to-Ban-System schützt die Anwendung vor Brute-Force-Angriffen auf das Login-Formular. Es ist in [security.js](file:///d:/AntiGravitySoftware/GitWorkspace/Bildsharing/security.js) implementiert.

### Funktionsweise
1. **Erfassung von Fehlversuchen**: Bei jedem fehlgeschlagenen Anmeldeversuch ruft der Server `security.recordFailedAttempt(ip, username)` auf.
2. **Grenzwert (Threshold)**: 
   * Maximal **5 Fehlversuche** (`MAX_ATTEMPTS`) innerhalb eines Zeitfensters von **15 Minuten** (`WINDOW_MS`).
3. **Temporäre Sperrung (Ban)**:
   * Sobald das Limit erreicht ist, wird die IP-Adresse für **15 Minuten** (`BAN_DURATION_MS`) gesperrt.
   * Der Zähler für Fehlversuche dieser IP wird nach Verhängung des Bans zurückgesetzt.
4. **Middleware-Blockierung**:
   * Die Express-Middleware `securityLimiter` prüft bei jedem Login-Request, ob die Client-IP gesperrt ist.
   * Gesperrte IPs erhalten sofort die HTTP-Antwort `429 Too Many Requests` mit einer verständlichen Fehlermeldung (inkl. Restzeit in Minuten).

### Administration über das Admin-Panel
Administratoren können im Admin-Bereich die Sicherheitsstatistiken einsehen und steuern:
* **Aktive Sperren**: Auflistung aller aktuell gesperrten IPs samt Ablaufzeit. IPs können mit einem Klick sofort manuell entsperrt werden.
* **Whitelist**: Manuelle Eintragung und Löschung von IP-Adressen in die Whitelist.
* **Sicherheits-Protokoll (`securityLog`)**: Die letzten 50 systemrelevanten Ereignisse (z. B. fehlgeschlagene Logins, verhängte Sperren, Entsperrungen) werden rollierend im RAM gehalten.
* **Zugriffs-Protokoll (`accessLog`)**: Aufzeichnung der letzten 100 HTTP-Anfragen (Methode, Pfad, IP, Benutzer, Statuscode, Antwortzeit) zur Live-Analyse.

---

## 4. Server- & Nginx-Konfiguration

Die Anwendung läuft auf einem Contabo-Server unter Ubuntu Linux und wird über einen Reverse-Proxy bereitgestellt.

### PM2 Prozess-Manager
* Die Anwendung wird mit [PM2](https://pm2.keymetrics.io/) verwaltet, um automatische Neustarts bei Abstürzen oder Server-Reboots sicherzustellen.
* **Sicherheits-Einschränkung**: Der PM2-Prozess läuft unter dem unprivilegierten System-Benutzer `landingapp` mit Home-Verzeichnis unter `/home/landingapp`.
* **Prozess-Name**: `meditation-app`
* **Port**: Der Server lauscht lokal auf Port `3005`.

### Nginx Reverse-Proxy
Nginx fängt Anfragen auf Port 80 und 443 ab und leitet sie an den Node-Server weiter. Die Konfiguration befindet sich in [meditation.tnickel-ki.conf](file:///d:/AntiGravitySoftware/GitWorkspace/Bildsharing/meditation.tnickel-ki.conf).

Key-Features der Nginx-Konfiguration:
1. **HTTPS-Erzwingung**: Alle Anfragen auf Port 80 (HTTP) werden mit Statuscode 301 permanent auf HTTPS umgeleitet.
2. **SSL-Zertifikate**: Verschlüsselung über Let's Encrypt Wildcard-Zertifikate für `meditation.tnickel-ki.de`.
3. **Upload-Limit (`client_max_body_size 500m;`)**: Standardmäßig begrenzt Nginx Requests auf 1MB. Um Bulk-Bilderuploads und Zip-Uploads zu ermöglichen, ist dieses Limit auf **500 Megabyte** angehoben.
4. **Static Bypass für `/uploads/`**:
   * Die Direktive `location ^~ /uploads/` sorgt dafür, dass hochgeladene Dateien direkt über den Node-Prozess und nicht direkt von Nginx ausgeliefert werden. Dies schützt vor unberechtigtem Direktzugriff und sichert die Einhaltung der Anwendungskontrollen.

---

## 5. Deployment-Prozess

Das Deployment wird automatisiert über ein PowerShell-Skript [deploy.ps1](file:///d:/AntiGravitySoftware/GitWorkspace/Bildsharing/deploy.ps1) (bzw. Shell-Skript [deploy.sh](file:///d:/AntiGravitySoftware/GitWorkspace/Bildsharing/deploy.sh)) durchgeführt.

### Ablauf des Deployments:
1. **Verbindungsaufbau**: SSH-Verbindung zum Server `root@84.46.247.222` mittels SSH-Key (`contabo_key`).
2. **System-User Prüfung**: Prüft, ob der System-User `landingapp` existiert, und legt ihn andernfalls an.
3. **Code-Transfer**: Übertragung aller Backend-Dateien (`server.js`, `security.js`, `db.js`, `package.json`) sowie des gesamten Frontend-Verzeichnisses `public/` via SCP in das Zielverzeichnis `/var/www/meditation`.
4. **Berechtigung & Dependencies**: Setzen des Besitzers auf `landingapp` und Ausführen von `npm install --production`.
5. **App-Start via PM2**: Neustart (bzw. Erststart) des Prozesses `meditation-app` unter dem Benutzer `landingapp` mit der Umgebungsvariable `PORT=3005`.
6. **Nginx-Konfiguration**: Kopieren der Nginx-Konfigurationsdatei nach `/etc/nginx/sites-available/`, Aktivierung per Symlink in `/etc/nginx/sites-enabled/` (falls noch nicht vorhanden).
7. **Nginx Reload**: Syntaxprüfung (`nginx -t`) und anschließendes Neuladen (`systemctl reload nginx`).
