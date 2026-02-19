// VisaGuard – Renderer Process
// All store operations use async IPC via window.visaGuardAPI (electron-store in main)

(function () {

  // ============================================================================
  // STORE HELPERS
  // ============================================================================

  async function storeGet(key) {
    return window.visaGuardAPI.storeGet(key);
  }

  async function storeSet(key, value) {
    return window.visaGuardAPI.storeSet(key, value);
  }

  async function getPersons() {
    const data = await storeGet('persons');
    return Array.isArray(data) ? data : [];
  }

  async function savePersons(persons) {
    await storeSet('persons', persons);
  }

  async function getLastCheckDate() {
    const v = await storeGet('lastCheckDate');
    return v || '';
  }

  async function setLastCheckDate(d) {
    await storeSet('lastCheckDate', d);
  }

  // ============================================================================
  // DATE HELPERS
  // ============================================================================

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function daysLeft(expDate) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var exp = new Date(expDate); exp.setHours(0, 0, 0, 0);
    return Math.ceil((exp - today) / 86400000);
  }

  function fmtDate(d) {
    var dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function statusOf(days) {
    if (days < 0) return 'expired';
    if (days <= 30) return 'warning';
    return 'safe';
  }

  function daysLabel(days) {
    if (days < 0) return 'Expired ' + Math.abs(days) + 'd ago';
    if (days === 0) return 'Expires today!';
    return days + ' day' + (days !== 1 ? 's' : '') + ' left';
  }

  function esc(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  function notify(title, body) {
    try { window.visaGuardAPI.sendNotification({ title: title, body: body }); } catch (e) { }
  }

  // ============================================================================
  // EXPIRATION CHECK
  // ============================================================================

  async function checkExpirations(force) {
    var today = todayStr();
    if (!force) {
      var last = await getLastCheckDate();
      if (last === today) return;
    }

    var persons = await getPersons();
    var changed = false;

    for (var i = 0; i < persons.length; i++) {
      var p = persons[i];
      if (!p.expirationDate) continue;

      var days = daysLeft(p.expirationDate);
      var name = esc(p.firstName) + ' ' + esc(p.lastName);
      var doc = p.documentType || 'Document';

      if (days <= 30 && days > 7 && !p.notified30) {
        notify('Visa Expiration Warning',
          name + '\'s ' + doc + ' expires in ' + days + ' days (' + fmtDate(p.expirationDate) + ').');
        p.notified30 = true; changed = true;
      }
      if (days <= 7 && days > 0 && !p.notified7) {
        notify('Visa Expiring Soon',
          'URGENT: ' + name + '\'s ' + doc + ' expires in ' + days + ' day' + (days !== 1 ? 's' : '') + '.');
        p.notified7 = true; changed = true;
      }
      if (days <= 0 && !p.notifiedExpired) {
        notify('Visa Expired',
          name + '\'s ' + doc + ' has expired (' + fmtDate(p.expirationDate) + ').');
        p.notifiedExpired = true; changed = true;
      }
    }

    if (changed) await savePersons(persons);
    await setLastCheckDate(today);
  }

  // ============================================================================
  // STATS
  // ============================================================================

  function updateStats(persons) {
    var safe = 0, warn = 0, exp = 0;
    for (var i = 0; i < persons.length; i++) {
      if (!persons[i].expirationDate) continue;
      var s = statusOf(daysLeft(persons[i].expirationDate));
      if (s === 'safe') safe++; else if (s === 'warning') warn++; else exp++;
    }
    var elSafe = document.getElementById('statSafe');
    var elWarn = document.getElementById('statWarn');
    var elExp = document.getElementById('statExpired');
    if (elSafe) elSafe.textContent = safe;
    if (elWarn) elWarn.textContent = warn;
    if (elExp) elExp.textContent = exp;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  async function renderPersons() {
    var container = document.getElementById('personList');
    if (!container) return;

    var persons = await getPersons();
    updateStats(persons);

    if (persons.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDEE1\uFE0F</div>' +
        '<p>No persons tracked yet.</p><small>Fill in the form on the left to add someone.</small></div>';
      return;
    }

    var html = '<div class="person-list">';
    for (var i = 0; i < persons.length; i++) {
      var p = persons[i];
      var days = daysLeft(p.expirationDate);
      var status = statusOf(days);
      var label = daysLabel(days);
      var init = ((p.firstName || '?')[0] + (p.lastName || '?')[0]).toUpperCase();

      html += '<div class="person-card status-' + status + '">' +
        '<div class="person-avatar">' + esc(init) + '</div>' +
        '<div class="person-info">' +
        '<div class="person-name">' + esc(p.firstName) + ' ' + esc(p.lastName) + '</div>' +
        '<div class="person-meta">' +
        '<span class="meta-tag">\uD83D\uDCC4 ' + esc(p.documentType) + '</span>' +
        '<span class="meta-tag">\uD83C\uDF0D ' + esc(p.country) + '</span>' +
        (p.phoneNumber ? '<span class="meta-tag">\uD83D\uDCDE ' + esc(p.phoneNumber) + '</span>' : '') +
        '</div>' +
        '</div>' +
        '<div class="person-expiry">' +
        '<div class="expiry-date">Expires ' + fmtDate(p.expirationDate) + '</div>' +
        '<span class="days-badge ' + status + '">' + label + '</span>' +
        '</div>' +
        '<button class="btn btn-danger delete-btn" data-id="' + esc(p.id) + '" type="button">&#x1F5D1;</button>' +
        '</div>';
    }
    html += '</div>';

    container.innerHTML = html;

    var btns = container.querySelectorAll('.delete-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', (function (id) {
        return function () { deletePerson(id); };
      })(btns[j].dataset.id));
    }
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async function addPerson(data) {
    var persons = await getPersons();
    persons.push({
      id: String(Date.now()),
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      documentType: data.documentType,
      country: data.country,
      expirationDate: data.expirationDate,
      notified30: false,
      notified7: false,
      notifiedExpired: false
    });
    await savePersons(persons);
    await renderPersons();
    await checkExpirations(true);
  }

  async function deletePerson(id) {
    var persons = await getPersons();
    persons = persons.filter(function (p) { return p.id !== id; });
    await savePersons(persons);
    await renderPersons();
    showToast('Person removed.', 'success');
  }

  // ============================================================================
  // TOAST
  // ============================================================================

  function showToast(msg, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'success');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s ease';
      setTimeout(function () { t.remove(); }, 300);
    }, 3000);
  }

  // ============================================================================
  // INIT
  // ============================================================================

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('personForm');
    var btnTestNotify = document.getElementById('btnTestNotify');
    var btnCheckNow = document.getElementById('btnCheckNow');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstName = (document.getElementById('firstName').value || '').trim();
      var lastName = (document.getElementById('lastName').value || '').trim();
      var phoneNumber = (document.getElementById('phoneNumber').value || '').trim();
      var documentType = document.getElementById('documentType').value;
      var country = (document.getElementById('country').value || '').trim();
      var expirationDate = document.getElementById('expirationDate').value;

      if (!firstName || !lastName || !documentType || !country || !expirationDate) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      addPerson({
        firstName: firstName, lastName: lastName, phoneNumber: phoneNumber,
        documentType: documentType, country: country, expirationDate: expirationDate
      })
        .then(function () {
          form.reset();
          showToast(firstName + ' ' + lastName + ' added successfully.', 'success');
        });
    });

    if (btnTestNotify) {
      btnTestNotify.addEventListener('click', function () {
        notify('VisaGuard', 'Notification system is working correctly!');
        showToast('Test notification sent.', 'success');
      });
    }

    if (btnCheckNow) {
      btnCheckNow.addEventListener('click', function () {
        checkExpirations(true).then(function () {
          showToast('Expiration check complete.', 'success');
        });
      });
    }

    // Initial load
    renderPersons().then(function () {
      checkExpirations(false);
    });

    // IPC listeners from main process
    if (window.visaGuardAPI && window.visaGuardAPI.on) {
      window.visaGuardAPI.on('check-expirations-now', function () {
        checkExpirations(true).then(function () { showToast('Check complete.', 'success'); });
      });
      window.visaGuardAPI.on('check-expirations-startup', function () {
        checkExpirations(false);
      });
      window.visaGuardAPI.on('check-expirations-scheduled', function () {
        checkExpirations(false);
      });
    }
  });

})(); // end IIFE
