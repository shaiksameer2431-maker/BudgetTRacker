/* ============================================================
   BUDTRACK NATIVE BRIDGE — Capacitor Plugins
   Handles: Device Storage, Local Notifications, Dialogs
   Falls back gracefully to localStorage / Web APIs when
   running in a plain browser (non-Capacitor context).
   ============================================================ */

/* ============================================================
   1. ENVIRONMENT DETECTION
   ============================================================ */
var IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

/* ============================================================
   2. DEVICE STORAGE  (Capacitor Preferences > localStorage)
   ============================================================ */
var BudStorage = (function () {

  var _Preferences = IS_NATIVE
    ? window.Capacitor.Plugins.Preferences
    : null;

  return {
    /**
     * Save a JSON-serialisable value.
     * @param {string} key
     * @param {*} value  — will be JSON.stringify'd
     * @returns {Promise<void>}
     */
    set: function (key, value) {
      var json = JSON.stringify(value);
      if (_Preferences) {
        return _Preferences.set({ key: key, value: json });
      }
      try { localStorage.setItem(key, json); } catch (e) {}
      return Promise.resolve();
    },

    /**
     * Load a value and parse JSON.
     * @param {string} key
     * @returns {Promise<*>}  resolves with parsed value or null
     */
    get: function (key) {
      if (_Preferences) {
        return _Preferences.get({ key: key }).then(function (res) {
          try { return res.value ? JSON.parse(res.value) : null; } catch (e) { return null; }
        });
      }
      try {
        var raw = localStorage.getItem(key);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return Promise.resolve(null);
      }
    },

    /**
     * Remove a key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    remove: function (key) {
      if (_Preferences) {
        return _Preferences.remove({ key: key });
      }
      try { localStorage.removeItem(key); } catch (e) {}
      return Promise.resolve();
    }
  };
})();


/* ============================================================
   3. LOCAL NOTIFICATIONS  (Capacitor LocalNotifications)
   ============================================================ */
var BudNotify = (function () {

  var _LN = IS_NATIVE
    ? window.Capacitor.Plugins.LocalNotifications
    : null;

  var _enabled = false;   // set to true after permission is granted

  /* -- Permission request -- */
  function requestPermission() {
    if (!_LN) {
      // Web fallback: use Notification API
      if ('Notification' in window) {
        return Notification.requestPermission().then(function (r) {
          _enabled = (r === 'granted');
          return _enabled;
        });
      }
      return Promise.resolve(false);
    }

    return _LN.requestPermissions().then(function (res) {
      _enabled = (res.display === 'granted');
      return _enabled;
    }).catch(function () {
      _enabled = false;
      return false;
    });
  }

  /* -- Check existing permission without prompting -- */
  function checkPermission() {
    if (!_LN) {
      _enabled = ('Notification' in window && Notification.permission === 'granted');
      return Promise.resolve(_enabled);
    }
    return _LN.checkPermissions().then(function (res) {
      _enabled = (res.display === 'granted');
      return _enabled;
    });
  }

  /* -- Cancel all pending notifications (before re-scheduling) -- */
  function cancelAll() {
    if (!_LN) return Promise.resolve();
    return _LN.getPending().then(function (res) {
      if (res.notifications && res.notifications.length) {
        return _LN.cancel({ notifications: res.notifications });
      }
    }).catch(function () {});
  }

  /**
   * Schedule the daily 9 pm reminder.
   * Fires every day at 21:00 local time.
   */
  function scheduleDailyReminder(userName) {
    if (!_enabled || !_LN) return Promise.resolve();

    var now = new Date();
    var fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0, 0);
    if (fire <= now) fire.setDate(fire.getDate() + 1); // push to tomorrow if 9pm already passed

    return _LN.schedule({
      notifications: [{
        id:         1001,
        title:      '💰 BudTrack Reminder',
        body:       'Hey ' + (userName || 'there') + '! Did you log all expenses today?',
        schedule:   { at: fire, repeats: true, every: 'day' },
        sound:      null,
        actionTypeId: '',
        extra:      null
      }]
    }).catch(function (e) { console.warn('[BudNotify] dailyReminder failed', e); });
  }

  /**
   * Fire an immediate budget-alert notification.
   * @param {number} pct — percentage of budget used
   * @param {string} currency
   * @param {number} remaining
   */
  function fireBudgetAlert(pct, currency, remaining) {
    if (!_enabled) return;

    var roundedPct = Math.round(pct);
    var title = roundedPct >= 100 ? '🚨 Budget Exceeded!' : '⚠️ Budget Alert';
    var body  = roundedPct >= 100
      ? 'You\'ve exceeded your monthly budget!'
      : 'You\'ve used ' + roundedPct + '% of your budget. ' + currency + Math.abs(Math.round(remaining)) + ' left.';

    if (_LN) {
      _LN.schedule({
        notifications: [{
          id:    2001 + Math.floor(Date.now() / 60000) % 100, // semi-unique each minute
          title: title,
          body:  body,
          schedule: { at: new Date(Date.now() + 500) },   // fire almost immediately
          sound: null,
          extra: null
        }]
      }).catch(function (e) { console.warn('[BudNotify] budgetAlert failed', e); });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body, icon: '' });
    }
  }

  /**
   * Schedule end-of-month summary reminder on the 25th at 8 pm.
   */
  function scheduleMonthEndReminder() {
    if (!_enabled || !_LN) return Promise.resolve();

    var now  = new Date();
    var fire = new Date(now.getFullYear(), now.getMonth(), 25, 20, 0, 0, 0);
    if (fire <= now) fire = new Date(now.getFullYear(), now.getMonth() + 1, 25, 20, 0, 0, 0);

    return _LN.schedule({
      notifications: [{
        id:    3001,
        title: '📊 Month-End Report Ready',
        body:  'Your ' + new Date().toLocaleString('en', { month: 'long' }) + ' financial summary is ready to review!',
        schedule: { at: fire },
        sound:    null,
        extra:    null
      }]
    }).catch(function (e) { console.warn('[BudNotify] monthEnd failed', e); });
  }

  /* Public API */
  return {
    requestPermission:      requestPermission,
    checkPermission:        checkPermission,
    cancelAll:              cancelAll,
    scheduleDailyReminder:  scheduleDailyReminder,
    fireBudgetAlert:        fireBudgetAlert,
    scheduleMonthEndReminder: scheduleMonthEndReminder,
    isEnabled: function ()  { return _enabled; }
  };
})();


/* ============================================================
   4. DIALOG HELPER  (Capacitor Dialog > window.alert/confirm)
   ============================================================ */
var BudDialog = (function () {

  var _D = IS_NATIVE ? window.Capacitor.Plugins.Dialog : null;

  return {
    /**
     * Show a native alert dialog.
     */
    alert: function (title, message) {
      if (_D) return _D.alert({ title: title, message: message });
      window.alert(title + '\n' + message);
      return Promise.resolve();
    },

    /**
     * Show a native confirm dialog.
     * @returns {Promise<boolean>}
     */
    confirm: function (title, message, okText, cancelText) {
      if (_D) {
        return _D.confirm({
          title:       title,
          message:     message,
          okButtonTitle:     okText     || 'OK',
          cancelButtonTitle: cancelText || 'Cancel'
        }).then(function (res) { return res.value; });
      }
      return Promise.resolve(window.confirm(title + '\n' + message));
    }
  };
})();


/* ============================================================
   5. NOTIFICATION ORCHESTRATOR
   Called from budtrack_logic.js after state changes
   ============================================================ */

/**
 * Called once on app startup — checks permissions and
 * re-schedules daily reminder if the setting is on.
 */
function initNotifications() {
  BudNotify.checkPermission().then(function () {
    if (state.settings.dailyReminder && BudNotify.isEnabled()) {
      BudNotify.scheduleDailyReminder(state.userName);
    }
    if (state.settings.periodSummary && BudNotify.isEnabled()) {
      BudNotify.scheduleMonthEndReminder();
    }
  });
}

/**
 * Called whenever a new expense is added.
 * Checks if budget threshold crossed and fires alert.
 */
function checkAndFireBudgetAlert() {
  if (!state.settings.budgetAlert) return;
  var ents  = getActiveBudgetEntries();
  var total = ents.reduce(function (s, e) { return s + e.amount; }, 0);
  var pct   = state.budget > 0 ? (total / state.budget) * 100 : 0;

  // Fire at 75%, 90%, 100%
  var lastPct = state._lastAlertPct || 0;
  var thresholds = [75, 90, 100];
  thresholds.forEach(function (t) {
    if (pct >= t && lastPct < t) {
      BudNotify.fireBudgetAlert(pct, state.currency, state.budget - total);
      state._lastAlertPct = t;
    }
  });
}

/**
 * Called from toggleSetting() when notifications are toggled.
 */
function handleNotificationToggle(key, isOn) {
  if (!isOn) {
    // Turning off — cancel relevant notifications
    if (key === 'dailyReminder') {
      if (BudNotify.isEnabled() && IS_NATIVE) {
        window.Capacitor && window.Capacitor.Plugins.LocalNotifications &&
          window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
      }
    }
    if (key === 'periodSummary') {
      if (BudNotify.isEnabled() && IS_NATIVE) {
        window.Capacitor && window.Capacitor.Plugins.LocalNotifications &&
          window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: 3001 }] });
      }
    }
    return;
  }

  // Turning on — request permission then schedule
  BudNotify.requestPermission().then(function (granted) {
    if (!granted) {
      showToast('Enable notifications in device settings');
      return;
    }
    if (key === 'dailyReminder') {
      BudNotify.scheduleDailyReminder(state.userName);
      showToast('Daily reminder set for 9:00 PM ✓');
    }
    if (key === 'periodSummary') {
      BudNotify.scheduleMonthEndReminder();
      showToast('Month-end summary scheduled ✓');
    }
    if (key === 'budgetAlert') {
      showToast('Budget alerts enabled ✓');
    }
  });
}
