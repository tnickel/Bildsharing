// --- STATE MANAGEMENT ---
let currentUser = null;
let selectedFiles = [];
let activeDownloadXhr = null;
let allSessions = [];

// --- DOM ELEMENTS ---
const sections = {
  login: document.getElementById('login-section'),
  dashboard: document.getElementById('dashboard-section'),
  admin: document.getElementById('admin-section')
};

// Nav Elements
const userDisplayName = document.getElementById('user-display-name');
const adminBadge = document.getElementById('admin-badge');
const toggleAdminBtn = document.getElementById('toggle-admin-btn');
const closeAdminBtn = document.getElementById('close-admin-btn');
const logoutBtn = document.getElementById('logout-btn');

// Login Form Elements
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('username');
const loginPasswordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');

// Upload Elements
const uploadForm = document.getElementById('upload-form');
const uploadTitleInput = document.getElementById('upload-title');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const selectedFilesContainer = document.getElementById('selected-files-container');
const selectedFilesList = document.getElementById('selected-files-list');
const fileCountSpan = document.getElementById('file-count');
const uploadSubmitBtn = document.getElementById('upload-submit-btn');
const uploadCancelBtn = document.getElementById('upload-cancel-btn');
const uploadProgressWrapper = document.getElementById('upload-progress-wrapper');
const uploadProgressBar = document.getElementById('upload-progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressText = document.getElementById('progress-text');
const uploadError = document.getElementById('upload-error');
const uploadSuccess = document.getElementById('upload-success');

// Sessions Elements
const refreshSessionsBtn = document.getElementById('refresh-sessions-btn');
const downloadAllBtn = document.getElementById('download-all-btn');
const sessionsLoading = document.getElementById('sessions-loading');
const sessionsEmpty = document.getElementById('sessions-empty');
const sessionsAccordion = document.getElementById('sessions-accordion');

// Admin Elements
const createUserForm = document.getElementById('create-user-form');
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const newRoleSelect = document.getElementById('new-role');
const createUserError = document.getElementById('create-user-error');
const createUserSuccess = document.getElementById('create-user-success');
const userListTbody = document.getElementById('user-list-tbody');
const activeBansTbody = document.getElementById('active-bans-tbody');
const securityLogList = document.getElementById('security-log-list');
const whitelistTbody = document.getElementById('whitelist-tbody');
const whitelistIpInput = document.getElementById('whitelist-ip-input');
const addWhitelistBtn = document.getElementById('add-whitelist-btn');
const accessLogList = document.getElementById('access-log-list');

// Lightbox Elements
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
const lightboxNextBtn = document.getElementById('lightbox-next-btn');
const lightboxDeleteBtn = document.getElementById('lightbox-delete-btn');

// Download Toast Elements
const downloadToast = document.getElementById('download-toast');
const downloadToastTitle = document.getElementById('download-toast-title');
const downloadToastBar = document.getElementById('download-toast-bar');
const downloadToastPercent = document.getElementById('download-toast-percent');
const downloadToastText = document.getElementById('download-toast-text');
const downloadToastCancelBtn = document.getElementById('download-toast-cancel-btn');
const downloadToastBtnAbort = document.getElementById('download-toast-btn-abort');

// Lightbox State
let lightboxImagesList = [];
let lightboxCurrentIndex = -1;

// Object URLs for pre-upload previews
let objectUrls = [];

// --- HELPER FUNCTIONS ---
function showSection(sectionKey) {
  Object.keys(sections).forEach(key => {
    if (key === sectionKey) {
      sections[key].classList.remove('hidden');
    } else {
      sections[key].classList.add('hidden');
    }
  });
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Download file with progress tracking
function downloadFileWithProgress(url, method, body, filename, toastTitle, totalSize = 0) {
  // If there's an active download, abort it first
  if (activeDownloadXhr) {
    try { activeDownloadXhr.abort(); } catch (err) {}
    activeDownloadXhr = null;
  }

  // Reset toast UI
  downloadToastTitle.textContent = toastTitle;
  downloadToastBar.style.width = '100%';
  downloadToastPercent.textContent = '...';
  downloadToastText.textContent = 'Bereite ZIP-Datei vor...';
  downloadToastBar.classList.add('indeterminate');
  
  // Show toast
  downloadToast.classList.remove('hidden');
  downloadToast.classList.remove('fade-out');

  const xhr = new XMLHttpRequest();
  activeDownloadXhr = xhr;
  xhr.open(method, url, true);
  xhr.responseType = 'blob';

  if (method.toUpperCase() === 'POST') {
    xhr.setRequestHeader('Content-Type', 'application/json');
  }

  // Monitor download progress
  xhr.addEventListener('progress', (e) => {
    let total = e.lengthComputable && e.total > 0 ? e.total : totalSize;
    if (total > 0) {
      downloadToastBar.classList.remove('indeterminate');
      const percent = Math.min(Math.round((e.loaded / total) * 100), 99);
      downloadToastBar.style.width = percent + '%';
      downloadToastPercent.textContent = percent + '%';
      downloadToastText.textContent = `Lade herunter: ${formatBytes(e.loaded)} von ${formatBytes(total)}`;
    } else {
      downloadToastBar.classList.add('indeterminate');
      downloadToastPercent.textContent = '...';
      downloadToastText.textContent = `Lade herunter... (${formatBytes(e.loaded)})`;
    }
  });

  // Load completion
  xhr.addEventListener('load', () => {
    activeDownloadXhr = null;
    if (xhr.status >= 200 && xhr.status < 300) {
      const blob = xhr.response;
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      // Show success
      downloadToastBar.classList.remove('indeterminate');
      downloadToastBar.style.width = '100%';
      downloadToastPercent.textContent = '100%';
      downloadToastText.textContent = 'Heruntergeladen!';
      
      setTimeout(() => {
        downloadToast.classList.add('fade-out');
        setTimeout(() => {
          downloadToast.classList.add('hidden');
        }, 300);
      }, 2000);
    } else {
      downloadToastBar.classList.remove('indeterminate');
      handleDownloadError(xhr);
    }
  });

  // Handle errors
  xhr.addEventListener('error', () => {
    activeDownloadXhr = null;
    showToastError('Netzwerkfehler beim Download.');
  });

  xhr.addEventListener('abort', () => {
    activeDownloadXhr = null;
    showToastError('Download abgebrochen.');
  });

  xhr.send(body ? JSON.stringify(body) : null);
}

function handleDownloadError(xhr) {
  try {
    const reader = new FileReader();
    reader.onload = function() {
      try {
        const errorData = JSON.parse(reader.result);
        showToastError(errorData.error || 'Fehler beim Download.');
      } catch (e) {
        showToastError('Download fehlgeschlagen.');
      }
    };
    reader.readAsText(xhr.response);
  } catch (err) {
    showToastError('Fehler beim Download.');
  }
}

function showToastError(msg) {
  downloadToastBar.classList.remove('indeterminate');
  downloadToastBar.style.width = '0%';
  downloadToastPercent.textContent = 'Fehler';
  downloadToastText.textContent = msg;
  setTimeout(() => {
    downloadToast.classList.add('fade-out');
    setTimeout(() => {
      downloadToast.classList.add('hidden');
    }, 300);
  }, 4000);
}

// --- INITIALIZE APPLICATION ---
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    
    if (data.authenticated) {
      currentUser = data.user;
      setupDashboardView();
    } else {
      currentUser = null;
      showSection('login');
    }
  } catch (err) {
    console.error('Error checking auth state:', err);
    showSection('login');
  }
}

function setupDashboardView() {
  userDisplayName.textContent = currentUser.username;
  
  if (currentUser.role === 'admin') {
    adminBadge.classList.remove('hidden');
    toggleAdminBtn.classList.remove('hidden');
  } else {
    adminBadge.classList.add('hidden');
    toggleAdminBtn.classList.add('hidden');
  }

  showSection('dashboard');
  loadSessions();
  updateUploadPulses();
}

// --- AUTHENTICATION FLOWS ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');

  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login fehlgeschlagen.');
    }

    currentUser = data.user;
    loginForm.reset();
    setupDashboardView();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    showSection('login');
  } catch (err) {
    console.error('Logout error:', err);
  }
});

// Demo login handler
const demoLoginBtn = document.getElementById('demo-login-btn');
if (demoLoginBtn) {
  demoLoginBtn.addEventListener('click', () => {
    loginUsernameInput.value = 'demo';
    loginPasswordInput.value = 'demo123';
    loginForm.dispatchEvent(new Event('submit'));
  });
}

// --- ADMIN MANAGEMENT ---
toggleAdminBtn.addEventListener('click', () => {
  showSection('admin');
  loadUsers();
  loadStorageStats();
  loadSecurityStats();
});

closeAdminBtn.addEventListener('click', () => {
  setupDashboardView();
});

createUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createUserError.classList.add('hidden');
  createUserSuccess.classList.add('hidden');

  const username = newUsernameInput.value.trim();
  const password = newPasswordInput.value;
  const role = newRoleSelect.value;

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Fehler beim Erstellen des Benutzers.');
    }

    createUserSuccess.classList.remove('hidden');
    createUserForm.reset();
    loadUsers();
    loadStorageStats();
  } catch (err) {
    createUserError.textContent = err.message;
    createUserError.classList.remove('hidden');
  }
});

async function loadUsers() {
  userListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Lade Benutzer...</td></tr>';
  
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Benutzerliste konnte nicht geladen werden.');
    const users = await res.json();

    if (users.length === 0) {
      userListTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Keine Benutzer registriert.</td></tr>';
      return;
    }

    userListTbody.innerHTML = '';
    users.forEach(user => {
      const tr = document.createElement('tr');
      
      const createdDate = new Date(user.createdAt).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const isSelf = user.username.toLowerCase() === currentUser.username.toLowerCase();
      const isMainAdmin = user.username.toLowerCase() === 'admin';

      tr.innerHTML = `
        <td><strong>${escapeHtml(user.username)}</strong></td>
        <td><span class="badge ${user.role === 'admin' ? 'badge-admin' : 'badge-secondary'}">${user.role}</span></td>
        <td>
          <span class="password-text masked" data-password="${escapeHtml(user.plainPassword)}">••••••••</span>
          <button class="toggle-password-btn" title="Passwort anzeigen/verbergen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm change-password-btn" data-username="${escapeHtml(user.username)}" title="Passwort ändern" style="margin-left: 6px; padding: 2px 6px; font-size: 0.75rem; vertical-align: middle;">
            Ändern
          </button>
        </td>
        <td>${createdDate}</td>
        <td>
          <button class="btn btn-danger btn-sm delete-user-btn" 
                  data-username="${user.username}"
                  ${isSelf || isMainAdmin ? 'disabled' : ''} 
                  title="${isSelf ? 'Sie können sich nicht selbst löschen' : isMainAdmin ? 'Der Haupt-Admin-Account kann nicht gelöscht werden' : 'Benutzer löschen'}">
            Löschen
          </button>
        </td>
      `;

      userListTbody.appendChild(tr);
    });

    // Add event listeners to delete buttons
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const usernameToDelete = e.target.getAttribute('data-username');
        if (confirm(`Möchten Sie den Benutzer "${usernameToDelete}" wirklich löschen?`)) {
          try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(usernameToDelete)}`, {
              method: 'DELETE'
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Fehler beim Löschen.');
            }
            loadUsers();
            loadStorageStats();
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // Add event listeners to change password buttons
    userListTbody.querySelectorAll('.change-password-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const username = e.target.getAttribute('data-username');
        const newPassword = prompt(`Neues Passwort für "${username}" eingeben:`);
        if (newPassword === null) return; // User cancelled
        
        const trimmedPassword = newPassword.trim();
        if (!trimmedPassword) {
          alert('Das Passwort darf nicht leer sein.');
          return;
        }
        
        try {
          const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: trimmedPassword })
          });
          
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Fehler beim Ändern des Passworts.');
          }
          
          alert(`Passwort für "${username}" erfolgreich geändert.`);
          loadUsers();
          loadStorageStats(); // Password change might affect sharing group
        } catch (err) {
          alert(err.message);
        }
      });
    });

    // Add event listeners to toggle password buttons
    userListTbody.querySelectorAll('.toggle-password-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const td = e.target.closest('td');
        const textSpan = td.querySelector('.password-text');
        const plainPass = textSpan.getAttribute('data-password');
        
        if (textSpan.classList.contains('masked')) {
          textSpan.textContent = plainPass;
          textSpan.classList.remove('masked');
        } else {
          textSpan.textContent = '••••••••';
          textSpan.classList.add('masked');
        }
      });
    });

  } catch (err) {
    userListTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--accent-red);">${err.message}</td></tr>`;
  }
}

async function loadStorageStats() {
  const tbody = document.getElementById('storage-stats-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Lade Speicherstatistik...</td></tr>';
  
  try {
    const res = await fetch('/api/admin/storage-stats');
    if (!res.ok) throw new Error('Speicherstatistik konnte nicht geladen werden.');
    const stats = await res.json();
    
    if (stats.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Keine Sharing-Gruppen vorhanden.</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    stats.forEach(group => {
      const tr = document.createElement('tr');
      const membersList = group.usernames.map(name => escapeHtml(name)).join(', ');
      const sizeStr = formatBytes(group.totalSize);
      
      tr.innerHTML = `
        <td><strong>${membersList}</strong></td>
        <td>
          <span class="password-text masked" data-password="${escapeHtml(group.plainPassword)}">••••••••</span>
          <button class="toggle-password-btn" title="Passwort anzeigen/verbergen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>
        <td>${group.sessionCount}</td>
        <td>${group.fileCount}</td>
        <td><strong style="color: var(--accent-green);">${sizeStr}</strong></td>
      `;
      tbody.appendChild(tr);
    });
    
    // Add listeners for password toggling in storage stats
    tbody.querySelectorAll('.toggle-password-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const td = e.target.closest('td');
        const textSpan = td.querySelector('.password-text');
        const plainPass = textSpan.getAttribute('data-password');
        
        if (textSpan.classList.contains('masked')) {
          textSpan.textContent = plainPass;
          textSpan.classList.remove('masked');
        } else {
          textSpan.textContent = '••••••••';
          textSpan.classList.add('masked');
        }
      });
    });
    
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--accent-red);">${escapeHtml(err.message)}</td></tr>`;
  }
}

// --- UPLOAD HANDLING & DRAG AND DROP ---

// Trigger file dialog
dropzone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  handleFilesSelection(e.target.files);
});

// Drag and drop event listeners
['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  }, false);
});

dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFilesSelection(files);
});

function handleFilesSelection(filesList) {
  // Reset previous alerts
  uploadSuccess.classList.add('hidden');
  uploadError.classList.add('hidden');

  // Convert FileList to Array and merge
  const filesArray = Array.from(filesList);
  
  if (filesArray.length === 0) return;

  // Add files to selection
  selectedFiles = [...selectedFiles, ...filesArray];
  updateSelectedFilesUI();
}

function updateSelectedFilesUI() {
  // Revoke old object URLs to release memory
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls = [];

  selectedFilesList.innerHTML = '';
  
  if (selectedFiles.length === 0) {
    selectedFilesContainer.classList.add('hidden');
    uploadSubmitBtn.disabled = true;
    if (uploadCancelBtn) uploadCancelBtn.classList.add('hidden');
    updateUploadPulses();
    return;
  }

  selectedFilesContainer.classList.remove('hidden');
  uploadSubmitBtn.disabled = false;
  if (uploadCancelBtn) uploadCancelBtn.classList.remove('hidden');
  fileCountSpan.textContent = selectedFiles.length;
  updateUploadPulses();

  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name);
    
    if (isImage) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      li.innerHTML = `
        <img src="${url}" class="file-preview-thumbnail" alt="${escapeHtml(file.name)}">
        <button type="button" class="remove-file-overlay" data-index="${index}" title="Entfernen">&times;</button>
      `;
    } else {
      // ZIP or other format
      li.innerHTML = `
        <div class="file-preview-zip">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>
          <span class="file-preview-zip-text" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        </div>
        <button type="button" class="remove-file-overlay" data-index="${index}" title="Entfernen">&times;</button>
      `;
    }
    selectedFilesList.appendChild(li);
  });

  // Remove file handlers
  document.querySelectorAll('.remove-file-overlay').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'));
      selectedFiles.splice(idx, 1);
      updateSelectedFilesUI();
    });
  });
}

// Reset/Cancel selection
if (uploadCancelBtn) {
  uploadCancelBtn.addEventListener('click', () => {
    selectedFiles = [];
    fileInput.value = '';
    updateSelectedFilesUI();
    uploadForm.reset();
  });
}

function updateUploadPulses() {
  const isTitleEmpty = uploadTitleInput.value.trim() === '';
  const hasFiles = selectedFiles.length > 0;

  // Reset all highlights
  uploadTitleInput.classList.remove('pulse-input-highlight');
  if (dropzone) dropzone.classList.remove('pulse-dropzone-highlight');
  uploadSubmitBtn.classList.remove('pulse-button-highlight');

  if (isTitleEmpty) {
    // Step 1: Tell user to input their name
    uploadTitleInput.classList.add('pulse-input-highlight');
  } else if (!hasFiles) {
    // Step 2: Name is entered, tell user to select files
    if (dropzone) dropzone.classList.add('pulse-dropzone-highlight');
  } else {
    // Step 3: Both done, tell user to publish
    uploadSubmitBtn.classList.add('pulse-button-highlight');
  }
}

uploadTitleInput.addEventListener('input', updateUploadPulses);

// Upload Submission via AJAX (to track upload progress)
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (selectedFiles.length === 0) return;

  uploadError.classList.add('hidden');
  uploadSuccess.classList.add('hidden');
  uploadSubmitBtn.disabled = true;

  // Pre-check upload limits for demo user
  if (currentUser && currentUser.username.toLowerCase() === 'demo') {
    try {
      const checkRes = await fetch('/api/demo/upload-count');
      if (!checkRes.ok) throw new Error('Fehler beim Abrufen des Upload-Status.');
      const checkData = await checkRes.json();
      
      const alreadyUploaded = checkData.count;
      const incomingCount = selectedFiles.length;
      
      if (alreadyUploaded + incomingCount > 10) {
        uploadError.textContent = `Limit im Demomodus überschritten. Sie können maximal 10 Bilder pro Stunde hochladen (bereits hochgeladen: ${alreadyUploaded}, ausgewählt: ${incomingCount}).`;
        uploadError.classList.remove('hidden');
        uploadSubmitBtn.disabled = false;
        return;
      }
    } catch (err) {
      console.error('Error pre-checking demo limits:', err);
    }
  }

  uploadProgressWrapper.classList.remove('hidden');
  
  const formData = new FormData();
  formData.append('title', uploadTitleInput.value.trim());
  
  selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/sessions/upload', true);

  // Upload Progress
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percentComplete = Math.round((e.loaded / e.total) * 100);
      uploadProgressBar.style.width = percentComplete + '%';
      progressPercent.textContent = percentComplete + '%';
      
      if (percentComplete < 100) {
        progressText.textContent = 'Dateien werden hochgeladen...';
      } else {
        progressText.textContent = 'Verarbeite Dateien auf dem Server (dies kann bei ZIP-Dateien einen Moment dauern)...';
      }
    }
  });

  // Response handling
  xhr.addEventListener('load', () => {
    uploadProgressWrapper.classList.add('hidden');
    uploadProgressBar.style.width = '0%';
    progressPercent.textContent = '0%';

    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const response = JSON.parse(xhr.responseText);
        uploadSuccess.classList.remove('hidden');
        uploadForm.reset();
        selectedFiles = [];
        updateSelectedFilesUI();
        loadSessions();
      } catch (err) {
        uploadError.textContent = 'Fehler beim Verarbeiten der Serverantwort: ' + err.message;
        uploadError.classList.remove('hidden');
        uploadSubmitBtn.disabled = false;
      }
    } else {
      let errorMsg = 'Fehler beim Upload.';
      if (xhr.status === 413) {
        errorMsg = 'Die hochgeladenen Dateien sind zu groß (Maximal 2 GB).';
      } else if (xhr.status === 429) {
        errorMsg = 'Limit überschritten. Sie können maximal 10 Bilder pro Stunde hochladen.';
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          errorMsg = response.error || errorMsg;
        } catch (e) {
          if (xhr.status === 502) {
            errorMsg = 'Bad Gateway: Der Server ist vorübergehend nicht erreichbar.';
          } else if (xhr.status === 504) {
            errorMsg = 'Gateway Timeout: Die Serveranfrage hat zu lange gedauert.';
          } else {
            errorMsg = `Serverfehler (${xhr.status}).`;
          }
        }
      }
      uploadError.textContent = errorMsg;
      uploadError.classList.remove('hidden');
      uploadSubmitBtn.disabled = false;
    }
  });

  xhr.addEventListener('error', () => {
    uploadProgressWrapper.classList.add('hidden');
    let errorMsg = 'Netzwerkfehler während des Uploads.';
    if (xhr.status === 429 || (currentUser && currentUser.username.toLowerCase() === 'demo')) {
      errorMsg = 'Limit im Demomodus überschritten. Sie können maximal 10 Bilder pro Stunde hochladen.';
    }
    uploadError.textContent = errorMsg;
    uploadError.classList.remove('hidden');
    uploadSubmitBtn.disabled = false;
  });

  xhr.send(formData);
});


// --- SESSIONS AND GALLERY ACTIONS ---

refreshSessionsBtn.addEventListener('click', loadSessions);

if (downloadAllBtn) {
  downloadAllBtn.addEventListener('click', () => {
    let totalSize = 0;
    allSessions.forEach(session => {
      if (session.files && Array.isArray(session.files)) {
        session.files.forEach(f => {
          totalSize += (f.size || 0);
        });
      }
    });

    downloadFileWithProgress(
      '/api/sessions/download-all',
      'GET',
      null,
      'alle-bildergalerien.zip',
      'Alle Bildergalerien',
      totalSize
    );
  });
}

function updateDownloadAllButtonState() {
  if (!downloadAllBtn) return;
  const cards = sessionsAccordion.querySelectorAll('.session-card');
  if (cards.length === 0) {
    downloadAllBtn.classList.add('hidden');
  } else {
    downloadAllBtn.classList.remove('hidden');
  }
}

async function loadSessions() {
  sessionsLoading.classList.remove('hidden');
  sessionsAccordion.classList.add('hidden');
  sessionsEmpty.classList.add('hidden');
  if (downloadAllBtn) {
    downloadAllBtn.classList.add('hidden');
  }

  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) throw new Error('Sessions konnten nicht geladen werden.');
    const sessions = await res.json();
    allSessions = sessions;

    sessionsLoading.classList.add('hidden');

    if (sessions.length === 0) {
      sessionsEmpty.classList.remove('hidden');
      return;
    }

    sessionsAccordion.innerHTML = '';
    sessions.forEach(session => {
      const card = createSessionCard(session);
      sessionsAccordion.appendChild(card);
    });

    sessionsAccordion.classList.remove('hidden');
    updateDownloadAllButtonState();

  } catch (err) {
    sessionsLoading.classList.add('hidden');
    sessionsAccordion.innerHTML = `<div class="alert alert-danger" style="margin-top:0;">${err.message}</div>`;
    sessionsAccordion.classList.remove('hidden');
    if (downloadAllBtn) {
      downloadAllBtn.classList.add('hidden');
    }
  }
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card';
  card.setAttribute('data-id', session.id);

  const formattedDate = new Date(session.createdAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const fileCount = session.files.length;
  const isOwner = session.uploadedBy.toLowerCase() === currentUser.username.toLowerCase();
  const isAdmin = currentUser.role === 'admin';
  const showDelete = isOwner || isAdmin;

  const totalSize = session.files.reduce((acc, f) => acc + (f.size || 0), 0);
  const formattedSize = formatBytes(totalSize);

  // Track selection for this specific session card
  card.selectedFilenames = new Set();

  card.innerHTML = `
    <div class="session-header" title="Klicken zum Auf- oder Zuklappen">
      <div class="session-info-block">
        <div class="session-title-container">
          <svg class="session-folder-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span class="session-title">${escapeHtml(session.title)}</span>
          ${showDelete ? `
            <button class="edit-session-title-btn" title="Galerie umbenennen">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 13px; height: 13px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
          ` : ''}
        </div>
        <div class="session-meta">
          <div class="session-meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>von ${escapeHtml(session.uploadedBy)}</span>
          </div>
          <div class="session-meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
            <span>${formattedDate}</span>
          </div>
          <div class="session-meta-item file-count-meta">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <span>${fileCount} ${fileCount === 1 ? 'Bild' : 'Bilder'} (${formattedSize})</span>
          </div>
        </div>
      </div>
      
      <div class="session-actions">
        <!-- Normal full ZIP download button -->
        <button class="btn btn-secondary btn-sm download-zip-btn" title="Komplette Session als ZIP herunterladen">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          <span class="btn-text">ZIP</span>
        </button>

        <!-- Dynamic selected files ZIP download button -->
        <button class="btn btn-secondary btn-sm download-selected-btn hidden" title="Ausgewählte Bilder als ZIP herunterladen">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          <span class="btn-text">Auswahl ZIP (0)</span>
        </button>
        
        ${showDelete ? `
          <button class="btn btn-danger btn-sm delete-session-btn" title="Session unwiderruflich löschen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>
        ` : ''}
        
        <div class="session-toggle-btn" title="Klicken zum Auf- oder Zuklappen">
          <span class="toggle-text toggle-text-show">Details anzeigen</span>
          <span class="toggle-text toggle-text-hide">Details ausblenden</span>
          <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
    </div>
    <div class="session-body">
      <div class="session-gallery">
        <!-- Rendered images will go here -->
      </div>
    </div>
  `;

  // Toggle Accordion functionality
  const header = card.querySelector('.session-header');
  header.addEventListener('click', (e) => {
    // If click originates from actions or edit input, ignore collapse toggle
    if (e.target.closest('.session-actions button') || e.target.closest('.edit-session-title-btn') || e.target.closest('.session-title-edit-wrapper')) {
      return;
    }
    
    const isExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded');
    
    // Dynamically load images when expanded for the first time
    if (!isExpanded && card.querySelector('.session-gallery').children.length === 0) {
      renderGalleryImages(card, session);
    }
  });

  // Action: Edit Title inline
  if (showDelete) {
    const editBtn = card.querySelector('.edit-session-title-btn');
    const titleSpan = card.querySelector('.session-title');

    if (editBtn && titleSpan) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (card.classList.contains('editing-title')) return;
        card.classList.add('editing-title');

        const originalTitle = titleSpan.textContent;

        const editWrapper = document.createElement('div');
        editWrapper.className = 'session-title-edit-wrapper';
        editWrapper.innerHTML = `
          <input type="text" class="session-title-edit-input" value="${escapeHtml(originalTitle)}">
          <button class="btn btn-primary btn-sm save-title-btn" title="Speichern">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm cancel-title-btn" title="Abbrechen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
          </button>
        `;

        titleSpan.style.display = 'none';
        editBtn.style.display = 'none';
        titleSpan.parentNode.insertBefore(editWrapper, titleSpan.nextSibling);

        const input = editWrapper.querySelector('.session-title-edit-input');
        input.focus();
        input.select();

        // Prevent events inside edit wrapper from expanding accordion
        editWrapper.addEventListener('click', (ev) => ev.stopPropagation());

        const save = async () => {
          const newTitle = input.value.trim();
          if (!newTitle) {
            alert('Name der Galerie darf nicht leer sein.');
            return;
          }
          if (newTitle === originalTitle) {
            cleanup();
            return;
          }
          try {
            const res = await fetch(`/api/sessions/${session.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: newTitle })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fehler beim Umbenennen.');

            titleSpan.textContent = data.session.title;
            cleanup();
          } catch (err) {
            alert(err.message);
          }
        };

        const cleanup = () => {
          card.classList.remove('editing-title');
          editWrapper.remove();
          titleSpan.style.display = '';
          editBtn.style.display = '';
        };

        editWrapper.querySelector('.save-title-btn').addEventListener('click', save);
        editWrapper.querySelector('.cancel-title-btn').addEventListener('click', cleanup);

        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            save();
          } else if (ev.key === 'Escape') {
            cleanup();
          }
        });
      });
    }
  }

  // Action: Download ZIP
  card.querySelector('.download-zip-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const safeTitle = (session.title || 'bilder')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .trim();
    const filename = `${safeTitle || 'images'}.zip`;
    const totalSize = session.files.reduce((acc, f) => acc + (f.size || 0), 0);
    downloadFileWithProgress(`/api/sessions/${session.id}/download`, 'GET', null, filename, 'Session ZIP herunterladen', totalSize);
  });

  // Action: Download Selected ZIP
  const downloadSelectedBtn = card.querySelector('.download-selected-btn');
  downloadSelectedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const filenamesArray = Array.from(card.selectedFilenames);
    if (filenamesArray.length === 0) return;

    const safeTitle = `${(session.title || 'bilder')}-auswahl`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .trim();
    const filename = `${safeTitle || 'selection'}.zip`;

    const totalSize = session.files
      .filter(f => filenamesArray.includes(f.filename))
      .reduce((acc, f) => acc + (f.size || 0), 0);

    downloadFileWithProgress(
      `/api/sessions/${session.id}/download-selected`, 
      'POST', 
      { filenames: filenamesArray }, 
      filename, 
      'Auswahl ZIP herunterladen',
      totalSize
    );
  });

  // Action: Delete Session (Double safety confirmation)
  if (showDelete) {
    card.querySelector('.delete-session-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const firstConfirm = confirm('Möchten Sie diese Session und alle darin enthaltenen Bilder wirklich unwiderruflich löschen?');
      if (firstConfirm) {
        const secondConfirm = confirm('WARNUNG: Alle Bilder dieser Galerie gehen unwiderruflich verloren. Möchten Sie wirklich fortfahren?');
        if (secondConfirm) {
          try {
            const res = await fetch(`/api/sessions/${session.id}`, {
              method: 'DELETE'
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Fehler beim Löschen.');
            }
            card.remove();
            // Check if accordion is now empty
            if (sessionsAccordion.children.length === 0) {
              sessionsEmpty.classList.remove('hidden');
            }
            updateDownloadAllButtonState();
          } catch (err) {
            alert(err.message);
          }
        }
      }
    });
  }

  return card;
}

function renderGalleryImages(cardElement, session) {
  const gallery = cardElement.querySelector('.session-gallery');
  gallery.innerHTML = '';

  const downloadZipBtn = cardElement.querySelector('.download-zip-btn');
  const downloadSelectedBtn = cardElement.querySelector('.download-selected-btn');

  const isOwner = session.uploadedBy.toLowerCase() === currentUser.username.toLowerCase();
  const isAdmin = currentUser.role === 'admin';
  const showDelete = isOwner || isAdmin;

  // Load all images paths in an array for lightbox reference
  const sessionImages = session.files.map(f => ({
    url: `/uploads/${session.id}/${encodeURIComponent(f.filename)}`,
    title: f.filename,
    sessionId: session.id,
    filename: f.filename,
    showDelete: showDelete
  }));

  session.files.forEach((file, index) => {
    const imgUrl = `/uploads/${session.id}/${encodeURIComponent(file.filename)}`;
    
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'img-thumb-container';
    thumbContainer.title = `${escapeHtml(file.filename)} (${formatBytes(file.size)})`;

    thumbContainer.innerHTML = `
      <div class="thumb-checkbox-container">
        <input type="checkbox" class="thumb-checkbox" data-filename="${escapeHtml(file.filename)}">
      </div>
      <img src="${imgUrl}" class="img-thumb" alt="${escapeHtml(file.filename)}" loading="lazy">
      <div class="thumb-overlay">
        <a href="${imgUrl}" download="${escapeHtml(file.filename)}" class="thumb-download-btn" title="Bild herunterladen">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        </a>
        ${showDelete ? `
          <button class="thumb-delete-btn" title="Bild löschen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>
        ` : ''}
      </div>
    `;

    // Handle Selection Checkbox
    const checkbox = thumbContainer.querySelector('.thumb-checkbox');
    const checkboxContainer = thumbContainer.querySelector('.thumb-checkbox-container');
    
    checkbox.addEventListener('change', (e) => {
      const filename = e.target.getAttribute('data-filename');
      if (e.target.checked) {
        cardElement.selectedFilenames.add(filename);
        thumbContainer.classList.add('selected');
        checkboxContainer.classList.add('has-checked');
      } else {
        cardElement.selectedFilenames.delete(filename);
        thumbContainer.classList.remove('selected');
        checkboxContainer.classList.remove('has-checked');
      }

      // Update Header buttons state
      const count = cardElement.selectedFilenames.size;
      if (count > 0) {
        downloadZipBtn.classList.add('hidden');
        downloadSelectedBtn.classList.remove('hidden');
        downloadSelectedBtn.querySelector('.btn-text').textContent = `Auswahl ZIP (${count})`;
      } else {
        downloadZipBtn.classList.remove('hidden');
        downloadSelectedBtn.classList.add('hidden');
      }
    });

    // Click on checkbox container toggles checkbox state
    checkboxContainer.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.click();
      }
      e.stopPropagation();
    });

    // Handle Delete single image on thumbnail hover btn
    if (showDelete) {
      const deleteBtn = thumbContainer.querySelector('.thumb-delete-btn');
      deleteBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (confirm(`Möchten Sie das Bild "${file.filename}" wirklich löschen?`)) {
          try {
            const res = await fetch(`/api/sessions/${session.id}/files/${encodeURIComponent(file.filename)}`, {
              method: 'DELETE'
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Fehler beim Löschen des Bildes.');
            }

            // Remove from local data model
            const fileIdx = session.files.findIndex(f => f.filename === file.filename);
            if (fileIdx !== -1) {
              session.files.splice(fileIdx, 1);
            }

            // Remove selection state if selected
            cardElement.selectedFilenames.delete(file.filename);

            // Re-render gallery images (updates offsets, indexes, elements)
            renderGalleryImages(cardElement, session);

            // Update counts in header
            const metaItem = cardElement.querySelector('.session-meta-item.file-count-meta span');
            if (metaItem) {
              const newTotalSize = session.files.reduce((acc, f) => acc + (f.size || 0), 0);
              const newFileCount = session.files.length;
              metaItem.textContent = `${newFileCount} ${newFileCount === 1 ? 'Bild' : 'Bilder'} (${formatBytes(newTotalSize)})`;
            }
          } catch (err) {
            alert(err.message);
          }
        }
      });
    }

    // Click on image container to open premium fullscreen lightbox
    thumbContainer.addEventListener('click', (e) => {
      // If clicking checkbox/downloads overlay, do not open lightbox
      if (e.target.closest('.thumb-checkbox-container') || e.target.closest('.thumb-download-btn') || e.target.closest('.thumb-delete-btn')) {
        return;
      }
      openLightbox(sessionImages, index);
    });

    gallery.appendChild(thumbContainer);
  });
}

// --- LIGHTBOX INTERACTIVE IMPLEMENTATION ---
function openLightbox(imagesList, startIndex) {
  lightboxImagesList = imagesList;
  lightboxCurrentIndex = startIndex;
  
  lightboxModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Disable background scrolling
  
  loadLightboxImage();
}

function closeLightbox() {
  lightboxModal.classList.add('hidden');
  document.body.style.overflow = ''; // Re-enable scroll
  
  lightboxImg.src = '';
  lightboxImg.classList.remove('zoomed');
}

function loadLightboxImage() {
  if (lightboxCurrentIndex < 0 || lightboxCurrentIndex >= lightboxImagesList.length) return;
  
  const imgData = lightboxImagesList[lightboxCurrentIndex];
  
  // Fade effect
  lightboxImg.style.opacity = '0';
  lightboxImg.classList.remove('zoomed');
  
  setTimeout(() => {
    lightboxImg.src = imgData.url;
    lightboxCaption.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImagesList.length} - ${imgData.title}`;
    
    // Toggle delete button visibility based on auth
    if (imgData.showDelete) {
      lightboxDeleteBtn.classList.remove('hidden');
    } else {
      lightboxDeleteBtn.classList.add('hidden');
    }
    
    lightboxImg.style.opacity = '1';
  }, 150);
}

function showNextImage() {
  if (lightboxImagesList.length <= 1) return;
  lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxImagesList.length;
  loadLightboxImage();
}

function showPrevImage() {
  if (lightboxImagesList.length <= 1) return;
  lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxImagesList.length) % lightboxImagesList.length;
  loadLightboxImage();
}

// Close on close button click
lightboxCloseBtn.addEventListener('click', closeLightbox);

// Cancel active download
if (downloadToastCancelBtn) {
  downloadToastCancelBtn.addEventListener('click', () => {
    if (activeDownloadXhr) {
      activeDownloadXhr.abort();
    }
  });
}

if (downloadToastBtnAbort) {
  downloadToastBtnAbort.addEventListener('click', () => {
    if (activeDownloadXhr) {
      activeDownloadXhr.abort();
    }
  });
}

// Action: Delete single image from within the Lightbox
if (lightboxDeleteBtn) {
  lightboxDeleteBtn.addEventListener('click', async () => {
    if (lightboxCurrentIndex < 0 || lightboxCurrentIndex >= lightboxImagesList.length) return;
    const imgData = lightboxImagesList[lightboxCurrentIndex];
    
    if (confirm(`Möchten Sie das Bild "${imgData.filename}" wirklich unwiderruflich löschen?`)) {
      try {
        const res = await fetch(`/api/sessions/${imgData.sessionId}/files/${encodeURIComponent(imgData.filename)}`, {
          method: 'DELETE'
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Fehler beim Löschen des Bildes.');
        }
        
        // Remove from global allSessions and update local DOM card
        const session = allSessions.find(s => s.id === imgData.sessionId);
        if (session) {
          const fileIdx = session.files.findIndex(f => f.filename === imgData.filename);
          if (fileIdx !== -1) {
            session.files.splice(fileIdx, 1);
          }
          
          const cardElement = document.querySelector(`.session-card[data-id="${imgData.sessionId}"]`);
          if (cardElement) {
            // Remove selection state if selected
            cardElement.selectedFilenames.delete(imgData.filename);
            
            // Re-render gallery card in dashboard
            renderGalleryImages(cardElement, session);
            
            // Update counts in header
            const metaItem = cardElement.querySelector('.session-meta-item.file-count-meta span');
            if (metaItem) {
              const newTotalSize = session.files.reduce((acc, f) => acc + (f.size || 0), 0);
              const newFileCount = session.files.length;
              metaItem.textContent = `${newFileCount} ${newFileCount === 1 ? 'Bild' : 'Bilder'} (${formatBytes(newTotalSize)})`;
            }
          }
        }
        
        // Update lightbox state in-place
        lightboxImagesList.splice(lightboxCurrentIndex, 1);
        if (lightboxImagesList.length === 0) {
          closeLightbox();
        } else {
          lightboxCurrentIndex = Math.min(lightboxCurrentIndex, lightboxImagesList.length - 1);
          loadLightboxImage();
        }
      } catch (err) {
        alert(err.message);
      }
    }
  });
}

// Close on click outside the image
lightboxModal.addEventListener('click', (e) => {
  if (e.target === lightboxModal || e.target.classList.contains('lightbox-content-wrapper')) {
    closeLightbox();
  }
});

// Click image to zoom in/out
lightboxImg.addEventListener('click', (e) => {
  e.stopPropagation();
  lightboxImg.classList.toggle('zoomed');
});

// Next / Prev Button events
lightboxNextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showNextImage();
});

lightboxPrevBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showPrevImage();
});

// Keyboard Navigation
window.addEventListener('keydown', (e) => {
  if (lightboxModal.classList.contains('hidden')) return;
  
  if (e.key === 'Escape') {
    closeLightbox();
  } else if (e.key === 'ArrowRight') {
    showNextImage();
  } else if (e.key === 'ArrowLeft') {
    showPrevImage();
  }
});

// --- UTILITIES ---
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadSecurityStats() {
  if (!activeBansTbody || !securityLogList) return;
  
  activeBansTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Lade Sicherheitsdaten...</td></tr>';
  securityLogList.innerHTML = '<div style="text-align: center; color: var(--text-muted);">Lade Protokoll...</div>';
  
  try {
    const res = await fetch('/api/admin/security/stats');
    if (!res.ok) throw new Error('Sicherheitsdaten konnten nicht geladen werden.');
    const data = await res.json();
    
    // Render active bans
    if (data.activeBans.length === 0) {
      activeBansTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 12px;">Keine aktiven IP-Sperren.</td></tr>';
    } else {
      activeBansTbody.innerHTML = '';
      data.activeBans.forEach(ban => {
        const tr = document.createElement('tr');
        
        const bannedUntilDate = new Date(ban.bannedUntil).toLocaleDateString('de-DE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        const minutes = Math.floor(ban.timeLeftSeconds / 60);
        const seconds = ban.timeLeftSeconds % 60;
        const timeLeftStr = minutes > 0 ? `${minutes} Min. ${seconds} Sek.` : `${seconds} Sek.`;
        
        tr.innerHTML = `
          <td><strong>${escapeHtml(ban.ip)}</strong></td>
          <td>${bannedUntilDate}</td>
          <td><span style="color: var(--accent-purple); font-weight: 500;">${timeLeftStr}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm unban-ip-btn" data-ip="${escapeHtml(ban.ip)}">Entsperren</button>
          </td>
        `;
        activeBansTbody.appendChild(tr);
      });
      
      // Add click handlers for unban buttons
      activeBansTbody.querySelectorAll('.unban-ip-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const ip = e.target.getAttribute('data-ip');
          if (confirm(`Möchten Sie die IP-Adresse "${ip}" wirklich entsperren?`)) {
            await unbanIp(ip);
          }
        });
      });
    }
    
    // Render security log
    if (data.securityLog.length === 0) {
      securityLogList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 12px;">Keine Protokolleinträge vorhanden.</div>';
    } else {
      securityLogList.innerHTML = '';
      data.securityLog.forEach(log => {
        const logEl = document.createElement('div');
        logEl.className = 'security-log-item';
        
        const logDate = new Date(log.timestamp).toLocaleDateString('de-DE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        let typeClass = 'log-type-info';
        if (log.type === 'WARN') typeClass = 'log-type-warn';
        else if (log.type === 'BAN') typeClass = 'log-type-ban';
        else if (log.type === 'UNBAN') typeClass = 'log-type-unban';
        
        logEl.innerHTML = `
          <span class="log-time">[${logDate}]</span>
          <span class="log-type ${typeClass}">${log.type}</span>
          <span class="log-ip">${escapeHtml(log.ip)}</span> - 
          <span class="log-message">${escapeHtml(log.message)}</span>
        `;
        securityLogList.appendChild(logEl);
      });
    }
    
    // Also load the IP whitelist
    loadWhitelist();
    // Also load the server access log
    loadAccessLog();
    
  } catch (err) {
    activeBansTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--accent-red);">${escapeHtml(err.message)}</td></tr>`;
    securityLogList.innerHTML = `<div style="color: var(--accent-red); padding: 12px;">${escapeHtml(err.message)}</div>`;
  }
}

async function unbanIp(ip) {
  try {
    const res = await fetch('/api/admin/security/unban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler beim Entsperren der IP.');
    
    loadSecurityStats();
  } catch (err) {
    alert(err.message);
  }
}

async function loadWhitelist() {
  if (!whitelistTbody) return;
  
  whitelistTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Lade Whitelist...</td></tr>';
  
  try {
    const res = await fetch('/api/admin/security/whitelist');
    if (!res.ok) throw new Error('Whitelist-Daten konnten nicht geladen werden.');
    const whitelist = await res.json();
    
    if (whitelist.length === 0) {
      whitelistTbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 12px;">Keine IP-Adressen auf der Whitelist.</td></tr>';
    } else {
      whitelistTbody.innerHTML = '';
      whitelist.forEach(ip => {
        const tr = document.createElement('tr');
        
        // Loopback/localhost IPs cannot be removed
        const isLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
        const statusStr = isLocalhost ? '<span style="color: var(--accent-green); font-weight: 500;">Geschützt (System)</span>' : '<span style="color: var(--text-secondary);">Aktiv</span>';
        
        tr.innerHTML = `
          <td><strong>${escapeHtml(ip)}</strong></td>
          <td>${statusStr}</td>
          <td>
            <button class="btn btn-secondary btn-sm remove-whitelist-btn" data-ip="${escapeHtml(ip)}" ${isLocalhost ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>Entfernen</button>
          </td>
        `;
        whitelistTbody.appendChild(tr);
      });
      
      // Add event listeners to remove buttons
      whitelistTbody.querySelectorAll('.remove-whitelist-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const ip = e.target.getAttribute('data-ip');
          if (confirm(`Möchten Sie die IP-Adresse "${ip}" wirklich aus der Whitelist entfernen?`)) {
            await removeIpFromWhitelist(ip);
          }
        });
      });
    }
  } catch (err) {
    whitelistTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--accent-red);">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadAccessLog() {
  if (!accessLogList) return;
  
  accessLogList.innerHTML = '<div style="text-align: center; color: var(--text-muted);">Lade Zugriffsprotokoll...</div>';
  
  try {
    const res = await fetch('/api/admin/security/access-log');
    if (!res.ok) throw new Error('Zugriffsprotokoll konnte nicht geladen werden.');
    const logs = await res.json();
    
    if (logs.length === 0) {
      accessLogList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 12px;">Keine Zugriffe protokolliert.</div>';
    } else {
      accessLogList.innerHTML = '';
      logs.forEach(log => {
        const logEl = document.createElement('div');
        logEl.className = 'security-log-item';
        
        const logDate = new Date(log.timestamp).toLocaleDateString('de-DE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        // Highlight status codes
        let statusClass = 'log-type-info'; // default green/neutral
        if (log.statusCode >= 500) statusClass = 'log-type-ban'; // red
        else if (log.statusCode >= 400) statusClass = 'log-type-warn'; // orange/yellow
        
        logEl.innerHTML = `
          <span class="log-time">[${logDate}]</span>
          <span class="log-type ${statusClass}" style="min-width: 40px; display: inline-block; text-align: center;">${log.statusCode}</span>
          <span style="color: var(--accent-purple); font-weight: 500;">${escapeHtml(log.method)}</span> 
          <span style="color: var(--text-primary); font-family: monospace;">${escapeHtml(log.url)}</span> - 
          <span class="log-ip">${escapeHtml(log.ip)}</span> 
          <span style="color: var(--text-muted);">(${escapeHtml(log.username)})</span> 
          <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">${log.durationMs}ms</span>
        `;
        accessLogList.appendChild(logEl);
      });
    }
  } catch (err) {
    accessLogList.innerHTML = `<div style="color: var(--accent-red); padding: 12px;">${escapeHtml(err.message)}</div>`;
  }
}

async function addIpToWhitelist(ip) {
  try {
    const res = await fetch('/api/admin/security/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler beim Hinzufügen zur Whitelist.');
    
    whitelistIpInput.value = '';
    await loadSecurityStats(); // Also updates whitelist
  } catch (err) {
    alert(err.message);
  }
}

async function removeIpFromWhitelist(ip) {
  try {
    const res = await fetch('/api/admin/security/whitelist/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler beim Entfernen aus der Whitelist.');
    
    await loadSecurityStats(); // Also updates whitelist
  } catch (err) {
    alert(err.message);
  }
}

function initWhitelist() {
  if (!addWhitelistBtn || !whitelistIpInput) return;
  
  addWhitelistBtn.addEventListener('click', () => {
    const ip = whitelistIpInput.value.trim();
    if (!ip) {
      alert('Bitte eine gültige IP-Adresse eingeben.');
      return;
    }
    addIpToWhitelist(ip);
  });
  
  whitelistIpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const ip = whitelistIpInput.value.trim();
      if (ip) {
        addIpToWhitelist(ip);
      }
    }
  });
}

// --- BACKGROUND ANIMATION: FALLING LEAVES ---
function initFallingLeaves() {
  const containers = document.querySelectorAll('.leaves-container');
  const colors = ['rgba(16, 185, 129, 0.08)', 'rgba(245, 158, 11, 0.06)', 'rgba(4, 120, 87, 0.05)'];

  containers.forEach(container => {
    const leafCount = 8; // keeps it subtle, organic and high-performance
    for (let i = 0; i < leafCount; i++) {
      createLeaf(container, colors);
    }
  });
}

function createLeaf(container, colors) {
  const leaf = document.createElement('div');
  leaf.className = 'falling-leaf';
  
  const size = Math.random() * 20 + 15; // 15px to 35px
  const left = Math.random() * 100; // 0% to 100%
  const duration = Math.random() * 15 + 20; // slow fall duration 20s to 35s
  const delay = -Math.random() * duration; // negative delay so it starts already falling
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  leaf.style.width = `${size}px`;
  leaf.style.height = `${size}px`;
  leaf.style.left = `${left}%`;
  leaf.style.animationDelay = `${delay}s, -${Math.random() * 4}s`;
  leaf.style.animationDuration = `${duration}s, ${Math.random() * 4 + 3}s`;
  
  leaf.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" style="width: 100%; height: 100%; color: ${color}; transform: rotate(${Math.random() * 360}deg)">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 2 5.5a7 7 0 0 1-7 7h-3" fill="currentColor"/>
    </svg>
  `;
  
  container.appendChild(leaf);
  
  // Reposition left on loop
  leaf.addEventListener('animationiteration', (e) => {
    if (e.animationName === 'leafFall') {
      leaf.style.left = `${Math.random() * 100}%`;
    }
  });
}

// --- LOGIN PASSWORD TOGGLE & CAPS LOCK WARNING ---
function initLoginPasswordHelpers() {
  const toggleLoginPasswordBtn = document.getElementById('toggle-login-password-btn');
  const capsLockWarning = document.getElementById('capslock-warning');

  if (toggleLoginPasswordBtn && loginPasswordInput) {
    toggleLoginPasswordBtn.addEventListener('click', () => {
      const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      loginPasswordInput.setAttribute('type', type);
      
      // Update eye icon state color
      if (type === 'text') {
        toggleLoginPasswordBtn.style.color = 'var(--accent-green)';
      } else {
        toggleLoginPasswordBtn.style.color = 'var(--text-muted)';
      }
    });
  }

  if (loginPasswordInput && capsLockWarning) {
    const checkCapsLock = (e) => {
      if (e.getModifierState && e.getModifierState('CapsLock')) {
        capsLockWarning.classList.remove('hidden');
      } else {
        capsLockWarning.classList.add('hidden');
      }
    };

    loginPasswordInput.addEventListener('keydown', checkCapsLock);
    loginPasswordInput.addEventListener('keyup', checkCapsLock);

    // Hide warning when input loses focus
    loginPasswordInput.addEventListener('blur', () => {
      capsLockWarning.classList.add('hidden');
    });
  }
}

const LEGAL_CONTENT = {
  impressum: `
    <h2>Impressum</h2>
    <p><strong>Angaben gemäß § 5 TMG:</strong></p>
    <p>Thomas Nickel<br>
    Wünnenberger Weg 15<br>
    33100 Paderborn</p>
    
    <p><strong>Kontakt:</strong><br>
    Telefon: +49 (0) 176 / 12345678<br>
    E-Mail: <a href="mailto:tnickel@gmx.de">tnickel@gmx.de</a></p>
    
    <p><strong>Redaktionell verantwortlich:</strong><br>
    Thomas Nickel<br>
    Wünnenberger Weg 15<br>
    33100 Paderborn</p>
    
    <h3 style="margin-top: 1.5rem;">Verbraucherstreitbeilegung/Universalschlichtungsstelle</h3>
    <p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
  `,
  datenschutz: `
    <h2>Datenschutzerklärung</h2>
    <h3>1. Datenschutz auf einen Blick</h3>
    <p>Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.</p>
    
    <h3>2. Datenerfassung auf unserer Website</h3>
    <p><strong>Wer ist verantwortlich für die Datenerfassung auf dieser Website?</strong></p>
    <p>Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Die Kontaktdaten können Sie dem Impressum dieser Website entnehmen.</p>
    
    <p><strong>Wie erfassen wir Ihre Daten?</strong></p>
    <p>Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen. Hierzu gehören z.B. Ihr gewählter Benutzername und hochgeladene Bilder. Zum anderen erfassen unsere IT-Systeme automatisch technische Daten beim Besuch der Website (z. B. IP-Adresse, Webbrowser-Typ, Betriebssystem und Uhrzeit). Diese Zugriffe werden aus Sicherheitsgründen (z. B. Fail-to-Ban-Sperrlisten) temporär verarbeitet.</p>
    
    <h3>3. Cookies</h3>
    <p>Unsere Website verwendet ausschließlich einen technisch notwendigen Session-Cookie (<code>connect.sid</code>), um Ihre Benutzeranmeldung aufrechtzuerhalten und Ihre Upload-Gruppe zuzuordnen.</p>
    <p>Da dieser Cookie für den Betrieb der Plattform zwingend erforderlich ist, ist hierfür keine vorherige Einwilligung notwendig (gemäß § 25 Abs. 2 TDDG und Art. 6 Abs. 1 lit. f DSGVO).</p>
    
    <h3>4. Speicherdauer</h3>
    <p>Personenbezogene Sicherheitsdaten (wie z.B. IP-Adressen bei Fehlversuchen) werden maximal für 15 Minuten im Arbeitsspeicher gehalten. Hochgeladene Bilddaten werden so lange gespeichert, bis die dazugehörige Galerie gelöscht wird.</p>
    
    <h3>5. Ihre Rechte</h3>
    <p>Sie haben das Recht auf unentgeltliche Auskunft über Herkunft, Empfänger und Zweck Ihrer gespeicherten personenbezogenen Daten sowie ein Recht auf Berichtigung, Sperrung oder Löschung dieser Daten. Wenden Sie sich hierzu an die im Impressum angegebene Adresse.</p>
  `
};

function initLegalModals() {
  const impressumLinks = document.querySelectorAll('.impressum-link');
  const datenschutzLinks = document.querySelectorAll('.datenschutz-link');
  const legalModal = document.getElementById('legal-modal');
  const legalModalContent = document.getElementById('legal-modal-content');
  const legalModalClose = document.getElementById('legal-modal-close');
  const legalModalBackdrop = document.getElementById('legal-modal-backdrop');

  if (!legalModal || !legalModalContent) return;

  const openLegal = (type) => {
    legalModalContent.innerHTML = LEGAL_CONTENT[type] || '';
    // Use a tiny timeout to avoid immediately triggering a close event from the opening click
    setTimeout(() => {
      legalModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }, 10);
  };

  const closeLegal = () => {
    legalModal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  impressumLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLegal('impressum');
    });
  });

  datenschutzLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openLegal('datenschutz');
    });
  });

  if (legalModalClose) {
    legalModalClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLegal();
    });
  }

  if (legalModalBackdrop) {
    legalModalBackdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === legalModalBackdrop) {
        closeLegal();
      }
    });
  }

  // Close on Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !legalModal.classList.contains('hidden')) {
      closeLegal();
    }
  });
}

// Start application
initFallingLeaves();
initLoginPasswordHelpers();
initLegalModals();
initWhitelist();
checkAuth();
