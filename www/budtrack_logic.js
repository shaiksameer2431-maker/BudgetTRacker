/* ============================================================
   BUDTRACK v6.0 — BUSINESS LOGIC & STATE MANAGEMENT
   Industrial-grade rewrite with onboarding + monthly report
   ============================================================ */

var STORAGE_KEY = 'budtrack_v6_state';
var _reportMonthOffset = 0;


/* ============================================================
   1. STATE — Single source of truth
   ============================================================ */
var state = {
  // User profile
  userName:         '',
  currency:         '₹',

  // Budget data
  entries:          [],   // { id, amount, tag, note, time, date (YYYY-MM-DD), budgetKey }
  budget:           0,
  budgetEndDate:    null,
  budgets: [
    { key: 'Personal', name: 'Personal', amount: 0 },
    { key: 'Trip',     name: 'Trip',     amount: 0 },
    { key: 'Work',     name: 'Work',     amount: 0 }
  ],
  activeBudgetKey:  'Personal',

  // Recurring
  recurring: [
    { id: 1, name: 'Rent',    amount: 8000, day: 1,  icon: '🏠', active: true  },
    { id: 2, name: 'Netflix', amount: 199,  day: 10, icon: '🎬', active: true  },
    { id: 3, name: 'Gym',     amount: 500,  day: 5,  icon: '🏋️', active: false }
  ],
  recurringApplied: {},

  // Settings
  settings: {
    dailyReminder:  true,
    budgetAlert:    true,
    periodSummary:  true,
    currency:       '₹',
    theme:          'dark',
    language:       'English'
  },

  // App state
  kpVal:        '',
  selTag:       'Food',
  onboarded:    false,
  sparkChart:   null,
  monthlyChart: null,
  donutChart:   null,
  reportDismissedMonth: null
};


/* ============================================================
   2. CONSTANTS
   ============================================================ */
var TAG_COLORS = {
  Food:          '#00e676',
  Transport:     '#40c4ff',
  Coffee:        '#ffb74d',
  Shopping:      '#bb86fc',
  Bills:         '#ff5252',
  Health:        '#40ffb5',
  Entertainment: '#ff6e40',
  Other:         '#78909c'
};

var TAG_ICONS = {
  Food:          '🍔',
  Transport:     '🚗',
  Coffee:        '☕',
  Shopping:      '🛍️',
  Bills:         '📄',
  Health:        '💊',
  Entertainment: '🎬',
  Other:         '📦'
};

// Chart.js category color palette
var CAT_PALETTE = [
  '#00e676','#40c4ff','#ffb74d','#bb86fc',
  '#ff5252','#40ffb5','#ff6e40','#78909c'
];



/* ============================================================
   3. DEVICE STORAGE PERSISTENCE (Capacitor Preferences / localStorage)
   ============================================================ */
function saveState() {
  var payload = {
    userName:             state.userName,
    currency:             state.currency,
    entries:              state.entries,
    budget:               state.budget,
    budgetEndDate:        state.budgetEndDate,
    budgets:              state.budgets,
    activeBudgetKey:      state.activeBudgetKey,
    recurring:            state.recurring,
    recurringApplied:     state.recurringApplied,
    settings:             state.settings,
    onboarded:            state.onboarded,
    reportDismissedMonth: state.reportDismissedMonth,
    _lastAlertPct:        state._lastAlertPct
  };

  // Primary: Capacitor Preferences (device storage)
  if (typeof BudStorage !== 'undefined') {
    BudStorage.set(STORAGE_KEY, payload).catch(function (e) {
      console.warn('BudTrack: BudStorage.set failed, falling back to localStorage', e);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
    });
  } else {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) {
      console.warn('BudTrack: save failed', e);
    }
  }
}

function _applyStoredState(s) {
  if (!s) return;
  if (s.userName)             state.userName             = s.userName;
  if (s.currency)             state.currency             = s.currency;
  if (s.entries)              state.entries              = s.entries;
  if (s.budget != null)       state.budget               = s.budget;
  if (s.budgetEndDate)        state.budgetEndDate        = s.budgetEndDate;
  if (s.budgets)              state.budgets              = s.budgets;
  if (s.activeBudgetKey)      state.activeBudgetKey      = s.activeBudgetKey;
  if (s.recurring)            state.recurring            = s.recurring;
  if (s.recurringApplied)     state.recurringApplied     = s.recurringApplied;
  if (s.settings)             state.settings             = Object.assign(state.settings, s.settings);
  if (s.onboarded != null)    state.onboarded            = s.onboarded;
  if (s.reportDismissedMonth) state.reportDismissedMonth = s.reportDismissedMonth;
  if (s._lastAlertPct != null) state._lastAlertPct       = s._lastAlertPct;
}

/**
 * Returns a Promise that resolves when state is loaded.
 * Uses BudStorage (Capacitor Preferences) with localStorage fallback.
 */
function loadStateAsync() {
  if (typeof BudStorage !== 'undefined') {
    return BudStorage.get(STORAGE_KEY).then(function (s) {
      _applyStoredState(s);
    }).catch(function (e) {
      console.warn('BudTrack: BudStorage.get failed, trying localStorage', e);
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        _applyStoredState(raw ? JSON.parse(raw) : null);
      } catch (_) {}
    });
  }
  // Pure web fallback
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    _applyStoredState(raw ? JSON.parse(raw) : null);
  } catch (e) { console.warn('BudTrack: load failed', e); }
  return Promise.resolve();
}


/* ============================================================
   4. ONBOARDING
   ============================================================ */
function checkFirstLaunch() {
  if (!state.onboarded) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var ob = document.getElementById('screen-onboard');
    if (ob) ob.classList.add('active');
  } else {
    goTo('screen-home');
    checkMonthEndAlert();
    // Ensure keypad starts collapsed and FAB is visible
    toggleKeypad(false);
  }
}

function onPeriodChange(sel) {
  var row = document.getElementById('ob-custom-date-row');
  if (!row) return;
  if (sel.value === 'custom') {
    row.classList.remove('hidden');
    // default to today
    var today = toISODateStr(new Date());
    var inp = document.getElementById('ob-custom-date');
    if (inp && !inp.value) inp.value = today;
  } else {
    row.classList.add('hidden');
  }
}

function obNext(step) {
  if (step === 1) {
    var name = document.getElementById('ob-name').value.trim();
    if (!name) { shakeObInput('ob-name'); return; }
    showObStep(2);

  } else if (step === 2) {
    var amt = parseFloat(document.getElementById('ob-budget').value);
    if (!amt || amt <= 0) { shakeObInput('ob-budget'); return; }
    var cur = document.getElementById('ob-currency').value;
    // Preview ready text
    var name2 = document.getElementById('ob-name').value.trim();
    var ready  = document.getElementById('ob-ready-text');
    var budStr = cur + amt.toLocaleString();
    if (ready) ready.textContent = 'Hey ' + name2 + '! Budget of ' + budStr + '/month is ready.';
    showObStep(3);
  }
}

function obBack(step) {
  showObStep(step - 1);
}

function showObStep(n) {
  [1,2,3].forEach(function(i) {
    var el = document.getElementById('ob-step-' + i);
    if (el) {
      if (i === n) { el.classList.remove('hidden'); }
      else         { el.classList.add('hidden'); }
    }
  });
  if (typeof animateObStep === 'function') animateObStep(n);
}

function shakeObInput(id) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.animate) {
    el.animate([
      { transform: 'translateX(0)'   },
      { transform: 'translateX(-10px)'},
      { transform: 'translateX(10px)'},
      { transform: 'translateX(-6px)'},
      { transform: 'translateX(6px)' },
      { transform: 'translateX(0)'   }
    ], { duration: 320, easing: 'ease-out' });
  }
  el.focus();
}

function completeOnboarding() {
  var name    = document.getElementById('ob-name').value.trim();
  var amt     = parseFloat(document.getElementById('ob-budget').value) || 0;
  var cur     = document.getElementById('ob-currency').value;
  var period  = document.getElementById('ob-period-start').value;

  state.userName = name || 'Friend';
  state.currency = cur;
  state.settings.currency = cur;

  state.budget = amt;
  state.budgets = state.budgets.map(function(b) {
    return b.key === 'Personal' ? Object.assign({}, b, { amount: amt }) : b;
  });

  // Resolve budget end date
  var now = new Date();
  var end;
  if (period === 'custom') {
    var customVal = document.getElementById('ob-custom-date') && document.getElementById('ob-custom-date').value;
    end = customVal ? new Date(customVal + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    var endDay = parseInt(period) || 1;
    end = new Date(now.getFullYear(), now.getMonth() + 1, endDay);
  }
  state.budgetEndDate = end.toISOString().split('T')[0];

  state.onboarded = true;

  var finalize = function() {
    saveState();
    if (typeof animateOnboardComplete === 'function') {
      animateOnboardComplete(function() { goTo('screen-home'); toggleKeypad(false); });
    } else {
      goTo('screen-home');
      toggleKeypad(false);
    }
  };

  // Request notifications (and implicitly, native storage via Capacitor)
  if (typeof BudNotify !== 'undefined') {
    BudNotify.requestPermission().then(function(granted) {
      if (granted) {
        state.settings.dailyReminder = true;
        state.settings.budgetAlert = true;
        state.settings.periodSummary = true;
        BudNotify.scheduleDailyReminder(state.userName);
        BudNotify.scheduleMonthEndReminder();
        showToast('Notifications & Monthly Report enabled');
      }
      finalize();
    }).catch(function() {
      finalize();
    });
  } else {
    finalize();
  }
}


/* ============================================================
   5. NAVIGATION
   ============================================================ */
function goTo(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });

  var target = document.getElementById(id);
  if (target) target.classList.add('active');

  // Update all nav-items
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.classList.remove('active');
    if (item.dataset.screen === id) item.classList.add('active');
  });

  // Screen-specific renders
  if (id === 'screen-budget')    renderBudgetScreen();
  if (id === 'screen-insights')  renderInsights();
  if (id === 'screen-recurring') renderRecurring();
  if (id === 'screen-report')    renderReport();
  if (id === 'screen-home')      { updateHomeHeader(); updatePill(); updateRunningSum(); updateAI(); renderEntries(); }
  if (id === 'screen-settings')  updateSettingsUI();

  closeModal();

  if (typeof animateScreenIn === 'function') animateScreenIn(id);
}


/* ============================================================
   6. KEYPAD
   ============================================================ */
function kpPress(v) {
  if (v === '.' && state.kpVal.includes('.')) return;
  if (v === '.' && state.kpVal === '')        state.kpVal = '0';
  if (state.kpVal === '0' && v !== '.')       state.kpVal = '';
  if (state.kpVal.replace('.','').length >= 9) return;
  state.kpVal += v;
  updateDisplay();
}

function kpDel() {
  state.kpVal = state.kpVal.slice(0, -1);
  updateDisplay();
}

function updateDisplay() {
  var d = document.getElementById('kpDisplay');
  if (!d) return;
  d.textContent = state.kpVal || '0';
  d.className   = 'keypad-display' + (state.kpVal ? ' has-val' : '');

  // Show currency hint
  var hint = document.getElementById('kpDisplayHint');
  if (hint) hint.textContent = state.kpVal ? state.currency : '';
}

function kpConfirm() {
  var val = parseFloat(state.kpVal);
  if (!val || val <= 0) {
    showToast('Enter a valid amount first');
    if (typeof shakeElement === 'function') shakeElement('kpDisplay');
    return;
  }

  var note  = (document.getElementById('kpNote').value.trim()) || (TAG_ICONS[state.selTag] + ' ' + state.selTag);
  var now   = new Date();
  var isoDate = toISODateStr(now);    // YYYY-MM-DD — critical for monthly reports
  var dispDate = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short' });

  state.entries.push({
    id:        Date.now(),
    amount:    val,
    tag:       state.selTag,
    note:      note,
    time:      now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
    date:      isoDate,
    dispDate:  dispDate,
    budgetKey: state.activeBudgetKey
  });

  state.kpVal = '';
  document.getElementById('kpNote').value = '';
  updateDisplay();

  renderEntries();
  updatePill();
  updateRunningSum();
  updateAI();
  maybePulseBar();
  saveState();
  if (typeof checkAndFireBudgetAlert === 'function') checkAndFireBudgetAlert();
  showToast('✓ Expense saved');
  if (typeof animateEntryAdd === 'function') animateEntryAdd();
}


/* ============================================================
   7. TAG SELECTION
   ============================================================ */
function selTag(el, tag) {
  document.querySelectorAll('.kp-tag').forEach(function(t) { t.classList.remove('sel'); });
  el.classList.add('sel');
  state.selTag = tag;

  // Auto-fill note placeholder with selected tag
  var note = document.getElementById('kpNote');
  if (note && !note.value) note.placeholder = 'Note for ' + tag + ' (optional)';
}


/* ============================================================
   8. BUDGET TAB SWITCHING
   ============================================================ */
function switchBudget(el, key) {
  document.querySelectorAll('.budget-tab').forEach(function(t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
  state.activeBudgetKey = key;

  var bud = state.budgets.find(function(b) { return b.key === key; });
  if (bud) state.budget = bud.amount;

  renderEntries();
  updatePill();
  updateRunningSum();
  updateAI();
}

function getActiveBudgetEntries() {
  return state.entries.filter(function(e) { return e.budgetKey === state.activeBudgetKey; });
}

function getTodayEntries() {
  var today = toISODateStr(new Date());
  return getActiveBudgetEntries().filter(function(e) { return e.date === today; });
}

function toISODateStr(d) {
  // Returns YYYY-MM-DD in local time (avoids UTC offset bugs)
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function getMonthEntries() {
  // All entries from the active budget that fall within the current calendar month
  var now   = new Date();
  var yr    = now.getFullYear();
  var mo    = now.getMonth(); // 0-indexed
  return getActiveBudgetEntries().filter(function(e) {
    if (!e.date) return false;
    var d = new Date(e.date + 'T00:00:00');
    return d.getFullYear() === yr && d.getMonth() === mo;
  });
}


/* ============================================================
   9. PILL & BUDGET CALCULATIONS
   ============================================================ */
function updatePill() {
  var ents   = getActiveBudgetEntries();
  var spent  = ents.reduce(function(s, e) { return s + e.amount; }, 0);
  var left   = Math.max(0, state.budget - spent);
  var pct    = state.budget > 0 ? Math.min(100, (spent / state.budget) * 100) : 0;
  var dLeft  = getDaysLeft();
  var perDay = dLeft > 0 ? (left / dLeft) : left;

  // Pill
  var pillEl = document.getElementById('pillAmount');
  if (pillEl) {
    pillEl.textContent = fmt(perDay);
    pillEl.className   = 'pill-amount' + (perDay <= 0 ? ' danger' : (pct >= 75 ? ' warn' : ''));
  }

  // Health badge
  updateHealthBadge(pct);

  // Budget screen
  setSafe('bcLeft',    fmt(left));
  setSafe('bcSpent',   fmt(spent));
  setSafe('bcLabel',   'spent of ' + state.currency + fmtInt(state.budget));
  setSafe('bcDaysLeft', dLeft.toString());
  setSafe('bcPerDay',  fmt(dLeft > 0 ? left/dLeft : left));
  setSafe('bcRingPct', Math.round(pct) + '%');

  var bar = document.getElementById('bcBar');
  if (bar) {
    bar.style.width = pct.toFixed(0) + '%';
    bar.className   = 'bc-bar-fill' + (pct >= 100 ? ' over' : pct >= 75 ? ' warn' : '');
  }

  // SVG ring
  var ring = document.getElementById('bcRingFill');
  if (ring) {
    var circ = 2 * Math.PI * 15.9;
    var fill = (Math.min(pct, 100) / 100) * circ;
    ring.style.strokeDasharray = fill.toFixed(1) + ' ' + circ.toFixed(1);
    ring.className = 'bc-ring-fill' + (pct >= 100 ? ' over' : pct >= 75 ? ' warn' : '');
    var ringPct = document.getElementById('bcRingPct');
    if (ringPct) {
      ringPct.style.color = pct >= 100 ? 'var(--red)' : pct >= 75 ? 'var(--amber)' : 'var(--green)';
    }
  }
}

function updateHealthBadge(pct) {
  var badge = document.getElementById('healthBadge');
  if (!badge) return;
  var grade, cls;
  if      (pct < 50)  { grade = 'A'; cls = 'A'; }
  else if (pct < 70)  { grade = 'B'; cls = 'B'; }
  else if (pct < 85)  { grade = 'C'; cls = 'C'; }
  else if (pct < 95)  { grade = 'D'; cls = 'D'; }
  else                { grade = 'F'; cls = 'F'; }
  badge.textContent = grade;
  badge.className   = 'health-badge ' + cls;
}

function getDaysLeft() {
  if (!state.budgetEndDate) {
    // Default: end of current month
    var now = new Date();
    var end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    var diff = Math.ceil((end - now) / 86400000);
    return Math.max(1, diff);
  }
  var endD = new Date(state.budgetEndDate + 'T00:00:00');
  var nowD = new Date(); nowD.setHours(0,0,0,0); endD.setHours(0,0,0,0);
  return Math.max(0, Math.ceil((endD - nowD) / 86400000));
}


/* ============================================================
   10. RUNNING SUM
   ============================================================ */
function updateRunningSum() {
  var today  = getTodayEntries();
  var total  = today.reduce(function(s, e) { return s + e.amount; }, 0);
  var monEnt = getMonthEntries();
  var monTot = monEnt.reduce(function(s, e) { return s + e.amount; }, 0);
  var monPct = state.budget > 0 ? Math.round((monTot / state.budget) * 100) : 0;

  setSafe('rsAmount', fmt(total));
  setSafe('rsSub',    today.length + ' entr' + (today.length === 1 ? 'y' : 'ies') + ' today');
  setSafe('rsMonthPct', monPct + '% of monthly budget used');
}


/* ============================================================
   11. AI INSIGHT GENERATOR
   ============================================================ */
function updateAI() {
  var el = document.getElementById('aiText');
  if (!el) return;

  var ents = getActiveBudgetEntries();
  if (!ents.length) {
    el.innerHTML = 'Add your first expense to get personalised spending insights.';
    return;
  }

  var total = ents.reduce(function(s, e) { return s + e.amount; }, 0);
  var cats  = {};
  ents.forEach(function(e) { cats[e.tag] = (cats[e.tag] || 0) + e.amount; });
  var top  = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; })[0];
  var left = Math.max(0, state.budget - total);
  var pct  = state.budget > 0 ? (total / state.budget) * 100 : 0;
  var msgs = [];

  if (top) {
    msgs.push(TAG_ICONS[top[0]] + ' <span class="ai-highlight">' + top[0] + '</span> is your top spend (' + state.currency + fmtInt(top[1]) + ', ' + Math.round((top[1]/total)*100) + '% of total).');
  }

  var dLeft = getDaysLeft();
  if (pct >= 100) {
    msgs.push('🚨 <span class="ai-highlight">Budget exceeded!</span> You are over by ' + state.currency + fmtInt(total - state.budget) + '.');
  } else if (pct >= 75) {
    msgs.push('⚠️ <span class="ai-highlight">' + Math.round(pct) + '%</span> of budget used. Slow down — ' + dLeft + ' days left.');
  } else {
    msgs.push('✅ On track — <span class="ai-highlight">' + state.currency + fmtInt(left) + '</span> remaining for ' + dLeft + ' more day' + (dLeft !== 1 ? 's' : '') + '.');
  }

  if (ents.length >= 3) {
    msgs.push('📊 Avg spend: <span class="ai-highlight">' + state.currency + fmtInt(total / ents.length) + '</span> per entry.');
  }

  el.innerHTML = msgs.join(' ');

  // Update AI time label
  var now = new Date();
  var timeEl = document.getElementById('aiTime');
  if (timeEl) timeEl.textContent = 'Updated ' + now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}


/* ============================================================
   12. ENTRY RENDERING
   ============================================================ */
function renderEntries() {
  var el = document.getElementById('entriesArea');
  if (!el) return;

  var ents = getActiveBudgetEntries();
  // Sort newest first by date then time
  ents = ents.slice().sort(function(a, b) {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });

  if (!ents.length) {
    el.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">🎉</div>' +
      '<div class="empty-title">No expenses yet</div>' +
      '<div class="empty-sub">Use the keypad below to log your first expense</div>' +
      '</div>';
    return;
  }

  // Group by date
  var groups = {};
  var order  = [];
  ents.forEach(function(e) {
    var key = e.date || 'today';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(e);
  });

  var today = toISODateStr(new Date());
  var html  = '';

  order.forEach(function(dateKey) {
    var group    = groups[dateKey];
    var dayTotal = group.reduce(function(s, e) { return s + e.amount; }, 0);
    var label    = dateKey === today ? 'Today'
                 : dateKey === getPrevDayStr() ? 'Yesterday'
                 : formatDateLabel(dateKey);

    html += '<div class="day-header">' + label + '</div>';
    group.forEach(function(e) {
      var icon = TAG_ICONS[e.tag] || '📦';
      html += '<div class="entry-row" id="erow-' + e.id + '">' +
        '<div class="entry-icon">' + icon + '</div>' +
        '<div class="entry-info">' +
          '<div class="entry-label">' + escHtml(e.note) + '</div>' +
          '<div class="entry-meta">' +
            '<span class="entry-cat-dot" style="background:' + (TAG_COLORS[e.tag]||'#888') + '"></span>' +
            e.tag + ' · ' + e.time +
          '</div>' +
        '</div>' +
        '<div class="entry-amount">' + state.currency + e.amount.toFixed(2) + '</div>' +
        '<div class="entry-actions">' +
          '<div class="ea-btn edit" onclick="editEntry(' + e.id + ')" title="Edit">✎</div>' +
          '<div class="ea-btn del"  onclick="deleteEntry(' + e.id + ')" title="Delete">✕</div>' +
        '</div>' +
      '</div>';
    });

    html += '<div class="day-total-row">Day total: <strong>' + state.currency + dayTotal.toFixed(2) + '</strong></div>';
  });

  el.innerHTML = html;
}

function getPrevDayStr() {
  var d = new Date(); d.setDate(d.getDate() - 1); return toISODateStr(d);
}

function formatDateLabel(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ============================================================
   13. ENTRY CRUD
   ============================================================ */
function deleteEntry(id) {
  showConfirmModal(
    '🗑️ Delete expense',
    'This cannot be undone.',
    'Delete',
    'modal-btn danger',
    function() { _removeEntry(id); }
  );
}

function _removeEntry(id) {
  var row = document.getElementById('erow-' + id);
  if (row && typeof animateEntryDelete === 'function') {
    animateEntryDelete(row, function() { _purgeEntry(id); });
  } else {
    _purgeEntry(id);
  }
}

function _purgeEntry(id) {
  state.entries = state.entries.filter(function(e) { return e.id !== id; });
  renderEntries();
  updatePill();
  updateRunningSum();
  updateAI();
  saveState();
}

function editEntry(id) {
  var e = state.entries.find(function(x) { return x.id === id; });
  if (!e) return;

  var tagOpts = Object.keys(TAG_COLORS).map(function(t) {
    return '<option value="' + t + '"' + (t === e.tag ? ' selected' : '') + '>' + TAG_ICONS[t] + ' ' + t + '</option>';
  }).join('');

  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Edit expense</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Amount</span>' +
      '<input class="modal-input" id="editAmt" type="number" step="0.01" min="0.01" value="' + e.amount + '"/>' +
    '</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Note</span>' +
      '<input class="modal-input" id="editNote" value="' + escHtml(e.note) + '"/>' +
    '</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Category</span>' +
      '<select class="modal-input" id="editTag">' + tagOpts + '</select>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="modal-btn confirm" onclick="saveEdit(' + id + ')">Save</button>' +
    '</div>'
  );
}

function saveEdit(id) {
  var amt  = parseFloat(document.getElementById('editAmt').value);
  var note = document.getElementById('editNote').value.trim();
  var tag  = document.getElementById('editTag').value;
  if (!amt || amt <= 0) { closeModal(); return; }
  state.entries = state.entries.map(function(e) {
    return e.id === id ? Object.assign({}, e, { amount: amt, note: note || e.note, tag: tag }) : e;
  });
  closeModal();
  renderEntries();
  updatePill();
  updateRunningSum();
  updateAI();
  saveState();
  showToast('✓ Entry updated');
}


/* ============================================================
   14. BUDGET SCREEN RENDER
   ============================================================ */
function renderBudgetScreen() {
  updatePill();
  var ents      = getActiveBudgetEntries();
  var total     = ents.reduce(function(s, e) { return s + e.amount; }, 0);
  var avg       = ents.length ? total / ents.length : 0;
  var uniqueDays = new Set(ents.map(function(e) { return e.date || toISODateStr(new Date()); })).size;

  setSafe('stTotal', ents.length.toString());
  setSafe('stAvg',   fmt(avg));
  setSafe('stDays',  uniqueDays.toString());

  var el = document.getElementById('budgetEntriesArea');
  if (!el) return;

  if (!ents.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div>' +
      '<div class="empty-title">No entries yet</div>' +
      '<div class="empty-sub">Start logging to track your progress</div></div>';
    return;
  }

  var sorted = ents.slice().sort(function(a, b) { return (b.date > a.date) ? 1 : -1; });
  var html = '<div class="day-header" style="padding:0 0 6px">All entries — ' + ents.length + ' total</div>';
  sorted.forEach(function(e) {
    var icon = TAG_ICONS[e.tag] || '📦';
    html += '<div class="entry-row">' +
      '<div class="entry-icon">' + icon + '</div>' +
      '<div class="entry-info">' +
        '<div class="entry-label">' + escHtml(e.note) + '</div>' +
        '<div class="entry-meta"><span class="entry-cat-dot" style="background:' + (TAG_COLORS[e.tag]||'#888') + '"></span>' + e.tag + ' · ' + formatDateLabel(e.date) + '</div>' +
      '</div>' +
      '<div class="entry-amount">' + state.currency + e.amount.toFixed(2) + '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}


/* ============================================================
   15. INSIGHTS SCREEN
   ============================================================ */
function renderInsights() {
  var ctx = document.getElementById('sparkChart');
  if (!ctx) return;

  var now   = new Date();
  var days  = [];
  var vals  = [];

  for (var i = 6; i >= 0; i--) {
    var d = new Date(now); d.setDate(d.getDate() - i);
    var iso = toISODateStr(d);
    var lbl = d.toLocaleDateString('en-IN', { weekday: 'short' });
    days.push(lbl);
    var dayTotal = getActiveBudgetEntries()
      .filter(function(e) { return e.date === iso; })
      .reduce(function(s, e) { return s + e.amount; }, 0);
    vals.push(parseFloat(dayTotal.toFixed(2)));
  }

  if (state.sparkChart) state.sparkChart.destroy();
  state.sparkChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        data: vals,
        backgroundColor: vals.map(function(v, i) {
          return i === 6 ? 'rgba(0,230,118,0.9)' : 'rgba(0,230,118,0.2)';
        }),
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: function(c) { return state.currency + c.raw; } },
          backgroundColor: 'rgba(13,21,36,0.95)',
          titleColor: '#e8f0fe',
          bodyColor: '#00e676'
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#4a5f7a', font: { size: 10 } } },
        y: { display: false }
      }
    }
  });

  // Insight cards
  var ents   = getActiveBudgetEntries();
  var total  = ents.reduce(function(s, e) { return s + e.amount; }, 0);
  var cats   = {};
  ents.forEach(function(e) { cats[e.tag] = (cats[e.tag] || 0) + e.amount; });
  var topCat  = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; })[0];
  var dLeft   = getDaysLeft();
  var todayAmt = getTodayEntries().reduce(function(s, e) { return s + e.amount; }, 0);
  var left    = Math.max(0, state.budget - total);
  var daysAt  = todayAmt > 0 ? Math.floor(left / todayAmt) : dLeft;

  var insights = [
    {
      icon: '🔥', bg: 'rgba(0,230,118,0.08)',
      title: 'Top spending category',
      body: topCat ? topCat[0] + ' — ' + state.currency + fmtInt(topCat[1]) + ' (' + Math.round((topCat[1]/Math.max(total,1))*100) + '% of spend)' : 'No entries yet'
    },
    {
      icon: '📆', bg: 'rgba(187,134,252,0.08)',
      title: 'Budget health forecast',
      body: 'Spent ' + state.currency + fmtInt(total) + ' of ' + state.currency + fmtInt(state.budget) +
            '. At this pace, budget covers <strong>' + daysAt + ' more day' + (daysAt !== 1 ? 's' : '') + '</strong>.'
    },
    {
      icon: '📈', bg: 'rgba(64,196,255,0.08)',
      title: 'Spending pace',
      body: 'You have made <strong>' + ents.length + ' transactions</strong> this period. ' +
            'Average: ' + state.currency + fmtInt(total / Math.max(ents.length, 1)) + ' per entry.'
    },
    {
      icon: '💡', bg: 'rgba(255,183,77,0.08)',
      title: 'Smart suggestion',
      body: total > state.budget * 0.7
        ? 'Over 70% budget used. Consider skipping non-essential purchases this week.'
        : 'Great pacing! You are within healthy spending limits. ' + state.currency + fmtInt(left) + ' remaining.'
    }
  ];

  var listEl = document.getElementById('insightList');
  if (!listEl) return;
  listEl.innerHTML = insights.map(function(ins) {
    return '<div class="insight-item">' +
      '<div class="insight-header">' +
        '<div class="insight-icon" style="background:' + ins.bg + '">' + ins.icon + '</div>' +
        '<div class="insight-title">' + ins.title + '</div>' +
      '</div>' +
      '<div class="insight-body">' + ins.body + '</div>' +
    '</div>';
  }).join('');
}

function openAIPrompt() {
  var total  = getActiveBudgetEntries().reduce(function(s, e) { return s + e.amount; }, 0);
  var cats   = {};
  getActiveBudgetEntries().forEach(function(e) { cats[e.tag] = (cats[e.tag] || 0) + e.amount; });
  var catStr = Object.entries(cats).map(function(c) { return c[0] + ': ' + state.currency + fmtInt(c[1]); }).join(', ');
  var msg = encodeURIComponent('Give me a detailed spending analysis and saving tips for this month. Budget: ' + state.currency + state.budget + '. Spent: ' + state.currency + fmtInt(total) + '. Category breakdown: ' + catStr);
  window.open('https://gemini.google.com/app?q=' + msg, '_blank');
}


/* ============================================================
   16. RECURRING
   ============================================================ */
function renderRecurring() {
  var el = document.getElementById('recurringList');
  if (!el) return;

  if (!state.recurring.length) {
    el.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">🔄</div>' +
      '<div class="empty-title">No recurring expenses</div>' +
      '<div class="empty-sub">Add subscriptions, rent, or bills here.</div>' +
    '</div>';
    return;
  }

  el.innerHTML = state.recurring.map(function(r) {
    return '<div class="recurring-card">' +
      '<div class="rc-icon">' + r.icon + '</div>' +
      '<div class="rc-info">' +
        '<div class="rc-name">' + escHtml(r.name) + '</div>' +
        '<div class="rc-date">Day ' + r.day + ' each month · ' + (r.active ? 'Active' : 'Paused') + '</div>' +
      '</div>' +
      '<div class="rc-amount">' + state.currency + r.amount.toLocaleString('en-IN') + '</div>' +
      '<div class="sr-toggle' + (r.active ? ' on' : '') + '" onclick="toggleRecurring(' + r.id + ')"></div>' +
      '<div class="rc-delete" onclick="deleteRecurringEntry(' + r.id + ')">✕</div>' +
    '</div>';
  }).join('');
}

function toggleRecurring(id) {
  state.recurring = state.recurring.map(function(r) {
    return r.id === id ? Object.assign({}, r, { active: !r.active }) : r;
  });
  renderRecurring();
  saveState();
}

function deleteRecurringEntry(id) {
  showConfirmModal('🗑️ Remove recurring', 'This will remove the recurring expense.', 'Remove', 'modal-btn danger', function() {
    state.recurring = state.recurring.filter(function(r) { return r.id !== id; });
    renderRecurring();
    saveState();
  });
}


/* ============================================================
   17. MONTHLY REPORT
   ============================================================ */
function checkMonthEndAlert() {
  var now = new Date();
  var day = now.getDate();
  var monthKey = now.getFullYear() + '-' + (now.getMonth() + 1);
  var el  = document.getElementById('reportBadge');
  if (el && day >= 25 && state.reportDismissedMonth !== monthKey) {
    el.style.display = 'flex';
  }
}

function dismissReportBadge() {
  var now = new Date();
  state.reportDismissedMonth = now.getFullYear() + '-' + (now.getMonth() + 1);
  var el = document.getElementById('reportBadge');
  if (el) el.style.display = 'none';
  saveState();
}

function renderReport() {
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var d = new Date();
  d.setDate(1); // avoid month-overflow issues
  d.setMonth(d.getMonth() + _reportMonthOffset);
  var monthStr = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  setSafe('reportTitle', monthStr + ' Report');
  setSafe('reportMonthLabel', monthStr);
  updateMonthNavLabel();

  var ents    = getReportMonthEntries();
  var total   = ents.reduce(function(s, e) { return s + e.amount; }, 0);
  var budget  = state.budget;
  var saved   = budget - total;
  var pct     = budget > 0 ? (total / budget) * 100 : 0;

  // Grade & verdict
  var grade, title, sub, gradeCls;
  if (pct <= 50)       { grade = 'A'; gradeCls = ''; title = 'Excellent budgeting!';  sub = 'Exceptional savings — you used only ' + Math.round(pct) + '% of your budget.'; }
  else if (pct <= 70)  { grade = 'B'; gradeCls = ''; title = 'Good job!';             sub = 'You spent ' + Math.round(pct) + '% of your budget. A few wins this month.'; }
  else if (pct <= 85)  { grade = 'C'; gradeCls = 'C'; title = 'Watch your spending'; sub = Math.round(pct) + '% budget used. Room for improvement next month.'; }
  else if (pct <= 100) { grade = 'D'; gradeCls = 'D'; title = 'Over-spending warning';sub = 'You used ' + Math.round(pct) + '% of budget. Try to cut back on top categories.'; }
  else                 { grade = 'F'; gradeCls = 'F'; title = 'Budget exceeded!';     sub = 'You overspent by ' + state.currency + fmtInt(Math.abs(saved)) + '. Plan ahead next month.'; }

  setSafe('verdictGrade', grade);
  var vg = document.getElementById('verdictGrade');
  if (vg) vg.className = 'verdict-grade ' + gradeCls;
  setSafe('verdictTitle', title);
  setSafe('verdictSub', sub);

  // Stat row
  setSafe('rptSpent',  state.currency + fmtInt(total));
  setSafe('rptBudget', state.currency + fmtInt(budget));
  setSafe('rptSaved',  (saved >= 0 ? '+' : '') + state.currency + fmtInt(Math.abs(saved)));
  setSafe('rptSavedLbl', saved >= 0 ? 'Saved' : 'Overspent');
  var savedEl = document.getElementById('rptSaved');
  if (savedEl) savedEl.style.color = saved >= 0 ? 'var(--green)' : 'var(--red)';

  // Call renderMonthlyBarChart with correct date
  var chartDate = new Date();
  chartDate.setMonth(chartDate.getMonth() + _reportMonthOffset);
  renderMonthlyBarChart(ents, chartDate);

  // Donut chart
  renderDonutChart(ents, total);

  // Top 5 expenses
  renderTop5(ents);

  // Recurring summary
  renderReportRecurring();

  // AI tips
  renderAITips(ents, total, budget, pct);

  // Update verdict banner border color
  var banner = document.getElementById('verdictBanner');
  if (banner) {
    var col = pct > 100 ? 'var(--red)' : pct > 85 ? 'var(--amber)' : 'var(--border-green)';
    banner.style.borderColor = col;
    banner.style.boxShadow   = '0 0 20px ' + (pct > 100 ? 'rgba(255,82,82,0.2)' : pct > 85 ? 'rgba(255,183,77,0.2)' : 'rgba(0,230,118,0.2)');
  }
}

function renderMonthlyBarChart(ents, now) {
  var ctx = document.getElementById('monthlyBarChart');
  if (!ctx) return;

  var d = new Date();
  d.setMonth(d.getMonth() + _reportMonthOffset);
  var daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  var labels = [];
  var vals   = [];

  for (var dy = 1; dy <= daysInMonth; dy++) {
    labels.push(dy % 5 === 1 || dy === daysInMonth ? String(dy) : '');
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(dy).padStart(2,'0');
    var daySum  = ents.filter(function(e) { return e.date === dateStr; })
                      .reduce(function(s, e) { return s + e.amount; }, 0);
    vals.push(parseFloat(daySum.toFixed(2)));
  }

  if (state.monthlyChart) state.monthlyChart.destroy();
  state.monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: vals,
        backgroundColor: 'rgba(0,230,118,0.7)',
        hoverBackgroundColor: '#00e676',
        borderRadius: 3,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(c) { return 'Day ' + (c[0].dataIndex + 1); },
            label: function(c) { return state.currency + c.raw; }
          },
          backgroundColor: 'rgba(13,21,36,0.95)',
          bodyColor: '#00e676'
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#4a5f7a', font: { size: 9 } } },
        y: { display: false }
      }
    }
  });
}

function renderDonutChart(ents, total) {
  var ctx = document.getElementById('donutChart');
  if (!ctx) return;

  var cats   = {};
  ents.forEach(function(e) { cats[e.tag] = (cats[e.tag] || 0) + e.amount; });
  var catList = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; });

  setSafe('donutTotal', state.currency + fmtInt(total));

  if (!catList.length) {
    ctx.parentElement.style.display = 'none';
    return;
  }

  if (state.donutChart) state.donutChart.destroy();
  state.donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catList.map(function(c) { return c[0]; }),
      datasets: [{
        data: catList.map(function(c) { return parseFloat(c[1].toFixed(2)); }),
        backgroundColor: catList.map(function(c, i) {
          return TAG_COLORS[c[0]] || CAT_PALETTE[i % CAT_PALETTE.length];
        }),
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(c) {
              var pct = total > 0 ? Math.round((c.raw / total) * 100) : 0;
              return state.currency + c.raw.toFixed(0) + ' (' + pct + '%)';
            }
          },
          backgroundColor: 'rgba(13,21,36,0.95)',
          bodyColor: '#e8f0fe'
        }
      }
    }
  });

  // Legend
  var legend = document.getElementById('catLegend');
  if (legend) {
    legend.innerHTML = catList.map(function(c) {
      var col  = TAG_COLORS[c[0]] || '#888';
      var pct  = total > 0 ? Math.round((c[1]/total)*100) : 0;
      var icon = TAG_ICONS[c[0]] || '📦';
      return '<div class="cat-legend-item">' +
        '<span class="cat-legend-dot" style="background:' + col + '"></span>' +
        icon + ' ' + c[0] + ' · ' + pct + '%' +
      '</div>';
    }).join('');
  }
}

function renderTop5(ents) {
  var sorted = ents.slice().sort(function(a, b) { return b.amount - a.amount; }).slice(0, 5);
  var el = document.getElementById('top5List');
  if (!el) return;

  if (!sorted.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:12px 0">No entries this month.</div>';
    return;
  }

  var ranks = ['gold', 'silver', 'bronze', '', ''];
  el.innerHTML = sorted.map(function(e, i) {
    var icon = TAG_ICONS[e.tag] || '📦';
    return '<div class="top5-row">' +
      '<div class="top5-rank ' + (ranks[i]||'') + '">' + (i+1) + '</div>' +
      '<div class="top5-info">' +
        '<div class="top5-note">' + icon + ' ' + escHtml(e.note) + '</div>' +
        '<div class="top5-tag">' + e.tag + ' · ' + formatDateLabel(e.date) + '</div>' +
      '</div>' +
      '<div class="top5-amount">' + state.currency + e.amount.toFixed(2) + '</div>' +
    '</div>';
  }).join('');
}

function renderReportRecurring() {
  var el = document.getElementById('reportRecurring');
  if (!el) return;

  var active = state.recurring.filter(function(r) { return r.active; });
  if (!active.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:8px 0">No active recurring expenses.</div>';
    return;
  }

  var monthTotal = active.reduce(function(s, r) { return s + r.amount; }, 0);
  el.innerHTML = active.map(function(r) {
    return '<div class="report-recurring-row">' +
      '<span>' + r.icon + ' ' + escHtml(r.name) + '</span>' +
      '<span style="color:var(--red);font-weight:700">' + state.currency + r.amount.toLocaleString('en-IN') + '</span>' +
    '</div>';
  }).join('') +
  '<div class="report-recurring-row" style="border-top:1px solid var(--border-light);margin-top:4px">' +
    '<span style="font-weight:700;color:var(--text-primary)">Total recurring</span>' +
    '<span style="font-weight:700;color:var(--red)">' + state.currency + fmtInt(monthTotal) + '</span>' +
  '</div>';
}

function renderAITips(ents, total, budget, pct) {
  var el = document.getElementById('aiTipsList');
  if (!el) return;

  var tips = [];

  if (!ents.length) {
    tips.push({ icon:'📝', text:'No expenses recorded this month. Start tracking to get personalised tips.' });
  } else {
    var cats = {};
    ents.forEach(function(e) { cats[e.tag] = (cats[e.tag] || 0) + e.amount; });
    var sorted = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; });
    var top = sorted[0];

    if (top) {
      var topPct = Math.round((top[1]/total)*100);
      if (topPct > 40) {
        tips.push({ icon:'⚡', text: TAG_ICONS[top[0]] + ' ' + top[0] + ' takes ' + topPct + '% of your total spend. Try setting a sub-budget for this category next month.' });
      }
    }

    if (pct > 85) {
      tips.push({ icon:'🚨', text:'You used over 85% of your budget this month. Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.' });
    } else if (pct > 60) {
      tips.push({ icon:'📊', text:'Budget on track at ' + Math.round(pct) + '%. Keep monitoring the Insights tab to stay on course.' });
    } else {
      tips.push({ icon:'🏆', text:'Outstanding! You saved ' + state.currency + fmtInt(budget - total) + ' this month. Consider moving savings to a recurring goal.' });
    }

    var numDays = new Set(ents.map(function(e) { return e.date; })).size;
    var avgPerDay = numDays > 0 ? total / numDays : 0;
    tips.push({ icon:'📅', text:'You spent on ' + numDays + ' distinct days, averaging ' + state.currency + fmtInt(avgPerDay) + '/day.' });

    if (sorted.length >= 2) {
      tips.push({ icon:'✂️', text:'Reducing ' + sorted[0][0] + ' by 20% and ' + sorted[1][0] + ' by 10% would save you ' + state.currency + fmtInt((sorted[0][1]*0.2)+(sorted[1][1]*0.1)) + ' next month.' });
    }
  }

  el.innerHTML = tips.map(function(t) {
    return '<div class="ai-tip-item"><span class="ai-tip-icon">' + t.icon + '</span><span>' + t.text + '</span></div>';
  }).join('');
}


/* ============================================================
   18. HOME HEADER
   ============================================================ */
function updateHomeHeader() {
  var hour = new Date().getHours();
  var greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  setSafe('homeGreeting', greet);
  setSafe('homeUsername', (state.userName || 'Friend') + '! 👋');
}


/* ============================================================
   19. SETTINGS UI
   ============================================================ */
function updateSettingsUI() {
  setSafe('profileName',     state.userName || 'User');
  setSafe('profileSub',      'BudTrack member · v6.0');
  setSafe('settingsCurrency', state.currency + ' ' + getCurrencyName(state.currency));
  setSafe('settingsBudget',   state.currency + fmtInt(state.budget));

  var now = new Date();
  setSafe('reportMonthLabel', now.toLocaleDateString('en-IN', { month:'long', year:'numeric' }));

  // Toggle states
  var toggleMap = { dailyReminder: 'toggle-dailyReminder', budgetAlert: 'toggle-budgetAlert', periodSummary: 'toggle-periodSummary' };
  Object.keys(toggleMap).forEach(function(key) {
    var el = document.getElementById(toggleMap[key]);
    if (el) el.classList.toggle('on', !!state.settings[key]);
  });

  // Theme badge
  var badge = document.getElementById('themeCurrentBadge');
  if (badge) badge.textContent = getThemeName(state.settings.theme || 'dark');
}

function getCurrencyName(cur) {
  var names = { '₹':'INR', '$':'USD', '€':'EUR', '£':'GBP', '¥':'JPY' };
  return names[cur] || '';
}


/* ============================================================
   20. MODALS
   ============================================================ */
function showModal(html) {
  var mc = document.getElementById('modalContainer');
  if (!mc) return;
  mc.innerHTML =
    '<div class="modal-overlay" onclick="closeModal()">' +
      '<div class="modal-sheet" onclick="event.stopPropagation()">' + html + '</div>' +
    '</div>';
  if (typeof animateModalIn === 'function') animateModalIn();
}

function closeModal() {
  var mc = document.getElementById('modalContainer');
  if (!mc || !mc.innerHTML) return;
  if (typeof animateModalOut === 'function') {
    animateModalOut(function() { mc.innerHTML = ''; });
  } else {
    mc.innerHTML = '';
  }
}

function showConfirmModal(title, body, confirmText, confirmCls, onConfirm) {
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">' + title + '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">' + body + '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="' + confirmCls + '" id="confirmActionBtn">' + confirmText + '</button>' +
    '</div>'
  );
  setTimeout(function() {
    var btn = document.getElementById('confirmActionBtn');
    if (btn) btn.onclick = function() { closeModal(); if (onConfirm) onConfirm(); };
  }, 50);
}

function showToast(msg) {
  var shell = document.getElementById('appShell');
  if (!shell) return;
  var old = shell.querySelector('.budtrack-toast');
  if (old) old.remove();
  var toast = document.createElement('div');
  toast.className   = 'budtrack-toast';
  toast.textContent = msg;
  shell.appendChild(toast);
  requestAnimationFrame(function() {
    toast.classList.add('show');
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 1800);
  });
}


/* ============================================================
   21. BUDGET MODALS
   ============================================================ */
function showAddFundsModal() {
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Add funds to budget</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Amount</span>' +
      '<input class="modal-input" id="fundAmt" type="number" min="1" placeholder="0"/>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Current: ' + state.currency + fmtInt(state.budget) + '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="modal-btn confirm" onclick="addFunds()">Add</button>' +
    '</div>'
  );
}

function addFunds() {
  var amt = parseFloat(document.getElementById('fundAmt').value);
  if (!amt || amt <= 0) { closeModal(); return; }
  state.budget += amt;
  state.budgets = state.budgets.map(function(b) {
    return b.key === state.activeBudgetKey ? Object.assign({}, b, { amount: state.budget }) : b;
  });
  closeModal();
  updatePill();
  renderBudgetScreen();
  saveState();
  showToast(state.currency + fmtInt(amt) + ' added ✓');
}

function showEditBudgetModal() {
  var defEnd = new Date(); defEnd.setDate(defEnd.getDate() + 30);
  var defEndStr = defEnd.toISOString().split('T')[0];
  var curEnd    = state.budgetEndDate || defEndStr;

  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Change budget</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Amount</span>' +
      '<input class="modal-input" id="newBudget" type="number" min="1" value="' + state.budget + '"/>' +
    '</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">End date</span>' +
      '<input class="modal-input" id="newBudgetEnd" type="date" value="' + curEnd + '"/>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="modal-btn confirm" onclick="applyBudget()">Apply</button>' +
    '</div>'
  );
}

function applyBudget() {
  var v   = parseFloat(document.getElementById('newBudget').value);
  var end = document.getElementById('newBudgetEnd').value;
  if (v > 0) {
    state.budget = v;
    state.budgets = state.budgets.map(function(b) {
      return b.key === state.activeBudgetKey ? Object.assign({}, b, { amount: v }) : b;
    });
  }
  if (end) state.budgetEndDate = end;
  closeModal();
  updatePill();
  renderBudgetScreen();
  saveState();
  showToast('Budget updated ✓');
}

function showBudgetSetModal() {
  showEditBudgetModal();
}

function showCurrencyModal() {
  var opts = [
    { val:'₹', label:'₹ INR — Indian Rupee' },
    { val:'$', label:'$ USD — US Dollar' },
    { val:'€', label:'€ EUR — Euro' },
    { val:'£', label:'£ GBP — British Pound' },
    { val:'¥', label:'¥ JPY — Japanese Yen' }
  ];
  var btns = opts.map(function(o) {
    var active = o.val === state.currency ? ' confirm' : '';
    return '<button class="modal-btn' + active + '" style="margin-bottom:6px" onclick="setCurrency(\'' + o.val + '\')">' + o.label + '</button>';
  }).join('');
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Select currency</div>' +
    '<div style="display:flex;flex-direction:column;gap:4px">' + btns + '</div>' +
    '<div class="modal-actions"><button class="modal-btn" onclick="closeModal()">Cancel</button></div>'
  );
}

function setCurrency(cur) {
  state.currency = cur;
  state.settings.currency = cur;
  closeModal();
  saveState();
  updateSettingsUI();
  updatePill();
  updateRunningSum();
  updateAI();
  showToast('Currency set to ' + cur + ' ✓');
}

function showEditProfileModal() {
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Edit profile</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Name</span>' +
      '<input class="modal-input" id="editName" value="' + escHtml(state.userName) + '" placeholder="Your name"/>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="modal-btn confirm" onclick="saveProfile()">Save</button>' +
    '</div>'
  );
}

function saveProfile() {
  var name = document.getElementById('editName').value.trim();
  if (name) { state.userName = name; saveState(); }
  closeModal();
  updateSettingsUI();
  updateHomeHeader();
  showToast('Profile updated ✓');
}


/* ============================================================
   22. ADD BUDGET
   ============================================================ */
function showAddBudgetModal() {
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">New budget</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Name</span>' +
      '<input class="modal-input" id="newBName" placeholder="e.g. Business"/>' +
    '</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Amount</span>' +
      '<input class="modal-input" id="newBAmt" type="number" min="1" placeholder="0"/>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="modal-btn confirm" onclick="addBudget()">Create</button>' +
    '</div>'
  );
}

function addBudget() {
  var name = document.getElementById('newBName').value.trim();
  var amt  = parseFloat(document.getElementById('newBAmt').value) || 0;
  if (!name) { closeModal(); return; }

  var key = name.replace(/\s+/g,'_') + '_' + Date.now();
  state.budgets.push({ key: key, name: name, amount: amt });

  // Add tab to both Home and Budget screen tab bars
  var tabContainers = document.querySelectorAll('.budget-tabs');
  tabContainers.forEach(function(tabs) {
    var d = document.createElement('div');
    d.className   = 'budget-tab';
    d.textContent = name;
    d.dataset.key = key;
    d.onclick = (function(k, el) { return function() { switchBudget(el, k); }; })(key, d);
    var newTabBtn = tabs.querySelector('.new-tab');
    if (newTabBtn) tabs.insertBefore(d, newTabBtn);
    else tabs.appendChild(d);
  });

  closeModal();
  saveState();
  showToast('Budget "' + name + '" created ✓');
}


/* ============================================================
   23. RECURRING MODALS
   ============================================================ */
function showAddRecurringModal() {
  var icons = ['🏠','🎬','🏋️','💊','🍔','☕','📱','💡','🎵','🚗','📚','✈️'];
  var iconBtns = icons.map(function(ic) {
    return '<button class="icon-pick-btn" onclick="pickRecurIcon(this,\'' + ic + '\')">' + ic + '</button>';
  }).join('');
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Add recurring expense</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Name</span>' +
      '<input class="modal-input" id="rName" placeholder="e.g. Spotify"/>' +
    '</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Amount</span>' +
      '<input class="modal-input" id="rAmt" type="number" min="1" placeholder="0"/>' +
    '</div>' +
    '<div class="modal-input-row">' +
      '<span class="modal-input-label">Day</span>' +
      '<input class="modal-input" id="rDay" type="number" min="1" max="31" value="1" placeholder="1–31"/>' +
    '</div>' +
    '<div class="modal-icon-label">Pick icon</div>' +
    '<div class="icon-picker-grid" id="iconPickerGrid">' + iconBtns + '</div>' +
    '<input type="hidden" id="rIcon" value="💰"/>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="modal-btn confirm" onclick="addRecurring()">Add</button>' +
    '</div>'
  );
  // Highlight first icon by default
  setTimeout(function() {
    var first = document.querySelector('.icon-pick-btn');
    if (first) first.classList.add('active');
  }, 50);
}

function pickRecurIcon(btn, icon) {
  document.querySelectorAll('.icon-pick-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var inp = document.getElementById('rIcon');
  if (inp) inp.value = icon;
}

function addRecurring() {
  var name = document.getElementById('rName').value.trim();
  var amt  = parseFloat(document.getElementById('rAmt').value);
  var day  = parseInt(document.getElementById('rDay').value) || 1;
  var icon = (document.getElementById('rIcon') && document.getElementById('rIcon').value) || '💰';
  if (!name || !amt) { showToast('Enter name and amount'); return; }

  state.recurring.push({ id: Date.now(), name: name, amount: amt, day: day, icon: icon, active: true });
  closeModal();
  renderRecurring();
  saveState();
  showToast('Recurring added ✓');
}


/* ============================================================
   24. SETTINGS ACTIONS
   ============================================================ */
function exportCSV() {
  var rows = [['Date', 'Time', 'Budget', 'Category', 'Note', 'Amount (' + state.currency + ')']];
  state.entries.forEach(function(e) {
    rows.push([e.date || '', e.time || '', e.budgetKey, e.tag, e.note, e.amount.toFixed(2)]);
  });
  downloadCSV(rows, 'budtrack_all_' + toISODateStr(new Date()) + '.csv');
  showToast('CSV downloaded ✓');
}

function exportMonthlyReport() {
  var now  = new Date();
  var ents = getMonthEntries();
  var rows = [['Day', 'Date', 'Category', 'Note', 'Amount (' + state.currency + ')']];
  ents.forEach(function(e) {
    var d = new Date(e.date + 'T00:00:00');
    rows.push([d.getDate(), e.date, e.tag, e.note, e.amount.toFixed(2)]);
  });

  // Monthly summary at bottom
  var total = ents.reduce(function(s, e) { return s + e.amount; }, 0);
  rows.push([]);
  rows.push(['MONTHLY SUMMARY', '', '', '', '']);
  rows.push(['Budget', state.currency + state.budget]);
  rows.push(['Total Spent', state.currency + total.toFixed(2)]);
  rows.push(['Saved', state.currency + (state.budget - total).toFixed(2)]);
  rows.push(['Entries', ents.length]);

  var month = now.toLocaleDateString('en-IN', { month:'long', year:'numeric' }).replace(' ', '_');
  downloadCSV(rows, 'budtrack_report_' + month + '.csv');
  showToast('Report exported ✓');
}

function downloadCSV(rows, filename) {
  var csv  = rows.map(function(r) {
    return r.map(function(c) { return '"' + String(c||'').replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function showClearConfirm() {
  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">🗑️ Clear data</div>' +
    '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6">' +
      'Choose what to clear. This cannot be undone.' +
    '</div>' +
    '<div class="modal-actions" style="flex-direction:column;gap:8px">' +
      '<button class="modal-btn danger" id="clearEntriesBtn">Clear expenses only</button>' +
      '<button class="modal-btn danger" id="clearAllBtn" style="opacity:0.75">Full reset (entries + settings)</button>' +
      '<button class="modal-btn" onclick="closeModal()">Cancel</button>' +
    '</div>'
  );
  setTimeout(function() {
    var entriesBtn = document.getElementById('clearEntriesBtn');
    if (entriesBtn) entriesBtn.onclick = function() {
      state.entries = [];
      closeModal();
      renderEntries(); updatePill(); updateRunningSum(); updateAI(); saveState();
      showToast('Expenses cleared');
    };
    var allBtn = document.getElementById('clearAllBtn');
    if (allBtn) allBtn.onclick = function() {
      if (typeof BudStorage !== 'undefined') {
        BudStorage.remove(STORAGE_KEY).then(function() {
          closeModal();
          setTimeout(function() { location.reload(); }, 300);
        });
      } else {
        localStorage.removeItem(STORAGE_KEY);
        closeModal();
        setTimeout(function() { location.reload(); }, 300);
      }
    };
  }, 50);
}

function toggleSetting(key, el) {
  state.settings[key] = !state.settings[key];
  el.classList.toggle('on', state.settings[key]);
  saveState();
  
  if (typeof handleNotificationToggle === 'function') {
    handleNotificationToggle(key, state.settings[key]);
  }
}

function updateStatusTime() {
  var now = new Date();
  var h = String(now.getHours()).padStart(2,'0');
  var m = String(now.getMinutes()).padStart(2,'0');
  document.querySelectorAll('.status-time').forEach(function(el) { el.textContent = h + ':' + m; });
}

function maybePulseBar() { _maybePulseBar(); }

// Notification helper
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function checkBudgetAlert() {
  if (!state.settings.budgetAlert) return;
  var ents  = getActiveBudgetEntries();
  var total = ents.reduce(function(s,e){return s+e.amount;},0);
  var pct   = state.budget > 0 ? (total/state.budget)*100 : 0;
  if (pct >= 75 && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('BudTrack ⚠️', { body: 'You\'ve used ' + Math.round(pct) + '% of your budget!', icon: '' });
  }
}


/* ============================================================
   25. UTILITIES
   ============================================================ */
function fmt(n)    { return Number(n).toFixed(2); }
function fmtInt(n) { return Math.round(n).toLocaleString('en-IN'); }

function setSafe(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}




/* ============================================================
   27. THEME SYSTEM
   ============================================================ */

var THEMES = [
  {
    id:    'dark',
    name:  'Default Dark',
    emoji: '🌑',
    desc:  'Glassmorphism dark — the original'
  },
  {
    id:    'skeuomorphism',
    name:  'Skeuomorphism',
    emoji: '🪵',
    desc:  'Real-world materials & depth'
  },
  {
    id:    'neumorphism',
    name:  'Neumorphism',
    emoji: '⬜',
    desc:  'Soft extruded shadows'
  },
  {
    id:    'glassmorphism',
    name:  'Glassmorphism',
    emoji: '🔮',
    desc:  'Frosted glass over vivid gradients'
  },
  {
    id:    'dark-trend',
    name:  'Dark UI Trend',
    emoji: '⚡',
    desc:  'Pure black · Neon accents'
  },
  {
    id:    'aurora-glass',
    name:  'Aurora Glass',
    emoji: '🌌',
    desc:  'Northern lights frosty glass'
  },
  {
    id:    'nordic-clean',
    name:  'Nordic Clean',
    emoji: '❄️',
    desc:  'Minimalist light & clean'
  },
  {
    id:    'money-mood',
    name:  'Money Mood',
    emoji: '🤑',
    desc:  'Rich emerald and gold'
  }
];

function getThemeName(id) {
  var t = THEMES.find(function(x) { return x.id === id; });
  return t ? t.name : 'Default Dark';
}

function applyTheme(id) {
  var shell = document.getElementById('appShell');
  if (!shell) return;

  // Remove any existing theme attribute
  shell.removeAttribute('data-theme');

  if (id && id !== 'dark') {
    shell.setAttribute('data-theme', id);
  }

  // Persist
  state.settings.theme = id || 'dark';
  saveState();

  // Update settings UI badge
  var badge = document.getElementById('themeCurrentBadge');
  if (badge) badge.textContent = getThemeName(state.settings.theme);
}

function showThemeModal() {
  var current = state.settings.theme || 'dark';

  var cards = THEMES.map(function(t) {
    var isActive = current === t.id;
    return [
      '<div class="theme-card' + (isActive ? ' active' : '') + '"',
      '  data-theme-id="' + t.id + '"',
      '  onclick="pickTheme(\'' + t.id + '\')"',
      '  title="' + t.name + '">',
      '  <div class="theme-card-preview">',
      '    <div class="theme-preview-bar"></div>',
      '    <div class="theme-preview-mini"></div>',
      '    <div class="theme-preview-dot">' + t.emoji + '</div>',
      '  </div>',
      '  <div class="theme-card-footer">',
      '    <span class="theme-card-name">' + t.name + '</span>',
      '    <span class="theme-check">✓</span>',
      '  </div>',
      '</div>'
    ].join('');
  }).join('');

  showModal(
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">🎨 App Theme</div>' +
    '<div class="theme-section-title">Choose a design style</div>' +
    '<div class="theme-picker-grid">' + cards + '</div>' +
    '<div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-bottom:14px">' +
      'Themes change the entire look & feel. Your data is never affected.' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn" onclick="closeModal()">Done</button>' +
    '</div>'
  );
}

function pickTheme(id) {
  // Visual feedback inside the modal
  document.querySelectorAll('.theme-card').forEach(function(card) {
    card.classList.toggle('active', card.dataset.themeId === id);
  });

  // Apply with a short delay so the user sees the selection
  setTimeout(function() {
    applyTheme(id);
    showToast(getThemeName(id) + ' theme applied ✓');
  }, 220);
}


/* ============================================================
   26. INIT
   ============================================================ */
(function init() {
  loadStateAsync().then(function() {
    updateStatusTime();
    setInterval(updateStatusTime, 30000);

    // Restore saved theme
    applyTheme(state.settings.theme || 'dark');

    // Apply recurring expenses for current month if not yet done
    applyRecurringExpenses();

    // Check first launch
    checkFirstLaunch();

    // If already onboarded, render home content
    if (state.onboarded) {
      updateHomeHeader();
      renderEntries();
      updatePill();
      updateRunningSum();
      updateAI();
      renderRecurring();
      initReportMonthOffset();

      // Sync budget tabs
      var activeTab = document.querySelector('[data-key="' + state.activeBudgetKey + '"]');
      if (activeTab) switchBudget(activeTab, state.activeBudgetKey);

      // Initialize notifications
      if (typeof initNotifications === 'function') initNotifications();
    }
  });
})();


/* ============================================================
   28. RECURRING AUTO-DEDUCT
   ============================================================ */
function applyRecurringExpenses() {
  if (!state.onboarded) return;
  var now = new Date();
  var monthKey = now.getFullYear() + '-' + (now.getMonth() + 1);

  if (!state.recurringApplied) state.recurringApplied = {};

  state.recurring.forEach(function(r) {
    if (!r.active) return;
    if (state.recurringApplied[r.id] === monthKey) return;
    if (now.getDate() < r.day) return;

    var isoDate = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(r.day).padStart(2, '0');

    state.entries.push({
      id:        Date.now() + r.id,
      amount:    r.amount,
      tag:       'Bills',
      note:      r.icon + ' ' + r.name + ' (recurring)',
      time:      '00:00',
      date:      isoDate,
      dispDate:  isoDate,
      budgetKey: state.activeBudgetKey
    });

    state.recurringApplied[r.id] = monthKey;
  });

  saveState();
}


/* ============================================================
   29. REPORT MONTH NAVIGATOR
   ============================================================ */
// NOTE: _reportMonthOffset is declared at top of file (line ~45)

function initReportMonthOffset() {
  _reportMonthOffset = 0;
  updateMonthNavLabel();
}

function shiftReportMonth(dir) {
  var proposed = _reportMonthOffset + dir;
  if (proposed > 0) return;
  _reportMonthOffset = proposed;
  updateMonthNavLabel();
  renderReport();
}

function updateMonthNavLabel() {
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + _reportMonthOffset);
  var label = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  var el = document.getElementById('monthNavLabel');
  if (el) el.textContent = label;
  var next = document.getElementById('monthNavNext');
  if (next) next.style.opacity = _reportMonthOffset === 0 ? '0.3' : '1';
}

function getReportMonthEntries() {
  var d = new Date();
  d.setMonth(d.getMonth() + _reportMonthOffset);
  var yr = d.getFullYear();
  var mo = d.getMonth();
  return getActiveBudgetEntries().filter(function(e) {
    if (!e.date) return false;
    var ed = new Date(e.date + 'T00:00:00');
    return ed.getFullYear() === yr && ed.getMonth() === mo;
  });
}
