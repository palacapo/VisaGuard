// VisaGuard – Renderer Process
// Handles person data management, expiration checking, and UI rendering.
// Runs in a sandboxed context; communicates with main via window.visaGuardAPI

'use strict';

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'visaguardPersons';
const LAST_CHECK_KEY = 'visaguardLastCheckDate';

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/** @returns {Person[]} */
function getPersons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** @param {Person[]} persons */
function savePersons(persons) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persons));
}

function getLastCheckDate() {
  return localStorage.getItem(LAST_CHECK_KEY) || '';
}

function setLastCheckDate(dateStr) {
  localStorage.setItem(LAST_CHECK_KEY, dateStr);
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/** Returns today as YYYY-MM-DD */
function todayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculates the number of whole days between today and expirationDate.
 * Positive = days remaining, negative = days past expiration.
 * @param {string} expirationDate  ISO date string (YYYY-MM-DD)
 * @returns {number}
 */
function calcDaysLeft(expirationDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expirationDate);
  expiry.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((expiry - today) / msPerDay);
}

/**
 * Format a date string to a human-readable form.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Returns status class based on days left.
 * @param {number} days
 * @returns {'safe'|'warning'|'expired'}
 */
function getStatus(days) {
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'safe';
}

/**
 * Returns a human-readable label for days remaining.
 * @param {number} days
 * @returns {string}
 */
function getDaysLabel(days) {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today!';
  return `${days} day${days !== 1 ? 's' : ''} left`;
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

/**
 * Send a system notification via the main process.
 * @param {string} title
 * @param {string} body
 */
function sendNotification(title, body) {
  if (window.visaGuardAPI?.sendNotification) {
    window.visaGuardAPI.sendNotification({ title, body });
  }
}

/**
 * WhatsApp notification stub – structured for future Twilio integration.
 * Replace the body of this function with actual Twilio API calls when ready.
 * @param {Person} person
 * @param {string} message
 */
function sendWhatsAppNotification(person, message) {
  // TODO: Integrate Twilio WhatsApp API
  // Example Twilio call (requires server-side or main-process proxy):
  //
  // const accountSid = 'YOUR_TWILIO_ACCOUNT_SID';
  // const authToken  = 'YOUR_TWILIO_AUTH_TOKEN';
  // const from = 'whatsapp:+14155238886'; // Twilio sandbox number
  // const to   = `whatsapp:${person.phoneNumber}`;
  //
  // fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
  //   method: 'POST',
  //   headers: { Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`) },
  //   body: new URLSearchParams({ From: from, To: to, Body: message }),
  // });

  console.log(`[WhatsApp stub] Would send to ${person.phoneNumber}: ${message}`);
}

// ============================================================================
// EXPIRATION CHECK LOGIC
// ============================================================================

/**
 * Check all persons for expiration and send notifications as needed.
 * Uses per-person boolean flags to prevent duplicate notifications.
 * @param {boolean} [force=false]  If true, skip the "once per day" guard.
 */
function checkExpirations(force = false) {
  const today = todayString();

  // Once-per-day guard (skip if already checked today, unless forced)
  if (!force && getLastCheckDate() === today) return;

  const persons = getPersons();
  let changed = false;

  persons.forEach((person) => {
    if (!person.expirationDate) return;

    const days = calcDaysLeft(person.expirationDate);
    const fullName = `${person.firstName} ${person.lastName}`;
    const docType = person.documentType || 'Document';

    // ── 30-day warning ──────────────────────────────────────────────────────
    if (days <= 30 && days > 7 && !person.notified30) {
      sendNotification(
        'Visa Expiration Warning',
        `${fullName}'s ${docType} expires in ${days} days (${formatDate(person.expirationDate)}).`
      );
      sendWhatsAppNotification(
        person,
        `⚠️ VisaGuard: ${fullName}'s ${docType} expires in ${days} days on ${formatDate(person.expirationDate)}.`
      );
      person.notified30 = true;
      changed = true;
    }

    // ── 7-day warning ───────────────────────────────────────────────────────
    if (days <= 7 && days > 0 && !person.notified7) {
      sendNotification(
        'Visa Expiring Soon',
        `URGENT: ${fullName}'s ${docType} expires in ${days} day${days !== 1 ? 's' : ''} (${formatDate(person.expirationDate)}).`
      );
      sendWhatsAppNotification(
        person,
        `🚨 VisaGuard URGENT: ${fullName}'s ${docType} expires in ${days} days on ${formatDate(person.expirationDate)}. Please renew immediately!`
      );
      person.notified7 = true;
      changed = true;
    }

    // ── Expired ─────────────────────────────────────────────────────────────
    if (days <= 0 && !person.notifiedExpired) {
      sendNotification(
        'Visa Expired',
        `${fullName}'s ${docType} has expired (${formatDate(person.expirationDate)}).`
      );
      sendWhatsAppNotification(
        person,
        `❌ VisaGuard: ${fullName}'s ${docType} has EXPIRED on ${formatDate(person.expirationDate)}. Immediate action required!`
      );
      person.notifiedExpired = true;
      changed = true;
    }
  });

  if (changed) savePersons(persons);
  setLastCheckDate(today);
}

// ============================================================================
// STATS BAR
// ============================================================================

function updateStats(persons) {
  let safe = 0, warn = 0, expired = 0;

  persons.forEach((p) => {
    if (!p.expirationDate) return;
    const days = calcDaysLeft(p.expirationDate);
    const status = getStatus(days);
    if (status === 'safe') safe++;
    else if (status === 'warning') warn++;
    else expired++;
  });

  const el = (id) => document.getElementById(id);
  if (el('statSafe')) el('statSafe').textContent = safe;
  if (el('statWarn')) el('statWarn').textContent = warn;
  if (el('statExpired')) el('statExpired').textContent = expired;
}

// ============================================================================
// RENDER PERSON LIST
// ============================================================================

function renderPersons() {
  const container = document.getElementById('personList');
  if (!container) return;

  const persons = getPersons();
  updateStats(persons);

  if (persons.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <p>No persons tracked yet.</p>
        <small>Fill in the form on the left to add someone.</small>
      </div>`;
    return;
  }

  const list = document.createElement('div');
  list.className = 'person-list';

  persons.forEach((person) => {
    const days = calcDaysLeft(person.expirationDate);
    const status = getStatus(days);
    const label = getDaysLabel(days);
    const initials = `${(person.firstName || '?')[0]}${(person.lastName || '?')[0]}`.toUpperCase();

    const card = document.createElement('div');
    card.className = `person-card status-${status}`;
    card.innerHTML = `
      <div class="person-avatar">${initials}</div>
      <div class="person-info">
        <div class="person-name">${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)}</div>
        <div class="person-meta">
          <span class="meta-tag">📄 ${escapeHtml(person.documentType)}</span>
          <span class="meta-tag">🌍 ${escapeHtml(person.country)}</span>
          ${person.phoneNumber ? `<span class="meta-tag">📞 ${escapeHtml(person.phoneNumber)}</span>` : ''}
        </div>
      </div>
      <div class="person-expiry">
        <div class="expiry-date">Expires ${formatDate(person.expirationDate)}</div>
        <span class="days-badge ${status}">${label}</span>
      </div>
      <button class="btn btn-danger" data-id="${person.id}" type="button" aria-label="Delete">🗑</button>
    `;

    list.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(list);

  // Attach delete handlers
  container.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => deletePerson(btn.dataset.id));
  });
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * @typedef {Object} Person
 * @property {string}  id
 * @property {string}  firstName
 * @property {string}  lastName
 * @property {string}  phoneNumber
 * @property {string}  documentType
 * @property {string}  country
 * @property {string}  expirationDate
 * @property {boolean} notified30
 * @property {boolean} notified7
 * @property {boolean} notifiedExpired
 * @property {string}  lastCheckedDate
 */

function addPerson(data) {
  const persons = getPersons();
  /** @type {Person} */
  const person = {
    id: String(Date.now()),
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    phoneNumber: data.phoneNumber.trim(),
    documentType: data.documentType,
    country: data.country.trim(),
    expirationDate: data.expirationDate,
    notified30: false,
    notified7: false,
    notifiedExpired: false,
    lastCheckedDate: '',
  };
  persons.push(person);
  savePersons(persons);
  renderPersons();
  // Immediately check this new person (force = true)
  checkExpirations(true);
}

function deletePerson(id) {
  const persons = getPersons().filter((p) => p.id !== id);
  savePersons(persons);
  renderPersons();
  showToast('Person removed.', 'success');
}

// ============================================================================
// TOAST NOTIFICATIONS (in-app)
// ============================================================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================================
// SECURITY HELPER
// ============================================================================

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// FORM HANDLING
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('personForm');
  const btnTestNotify = document.getElementById('btnTestNotify');
  const btnCheckNow = document.getElementById('btnCheckNow');

  // ── Form submit ──────────────────────────────────────────────────────────
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const documentType = document.getElementById('documentType').value;
    const country = document.getElementById('country').value.trim();
    const expirationDate = document.getElementById('expirationDate').value;

    if (!firstName || !lastName || !documentType || !country || !expirationDate) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    addPerson({ firstName, lastName, phoneNumber, documentType, country, expirationDate });
    form.reset();
    showToast(`${firstName} ${lastName} added successfully.`, 'success');
  });

  // ── Test notification ────────────────────────────────────────────────────
  btnTestNotify.addEventListener('click', () => {
    sendNotification('VisaGuard', '✅ Notification system is working correctly!');
    showToast('Test notification sent.', 'success');
  });

  // ── Manual check now ─────────────────────────────────────────────────────
  btnCheckNow.addEventListener('click', () => {
    checkExpirations(true); // force = true → bypass once-per-day guard
    showToast('Expiration check complete.', 'success');
  });

  // ── Initial render ───────────────────────────────────────────────────────
  renderPersons();
  checkExpirations(false);
});

// ============================================================================
// IPC LISTENERS (from main process via preload contextBridge)
// ============================================================================

if (window.visaGuardAPI) {
  // Tray → "Check Expirations Now"
  window.visaGuardAPI.on('check-expirations-now', () => {
    checkExpirations(true);
    showToast('Expiration check complete.', 'success');
  });

  // App startup check
  window.visaGuardAPI.on('check-expirations-startup', () => {
    checkExpirations(false);
  });

  // Daily scheduled check (every 24 hours from main process)
  window.visaGuardAPI.on('check-expirations-scheduled', () => {
    checkExpirations(false);
  });
}
