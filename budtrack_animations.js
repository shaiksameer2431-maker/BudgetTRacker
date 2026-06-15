/* ============================================================
   BUDTRACK v6.0 — ANIMATIONS, TRANSITIONS & MOTION
   Premium motion layer for the dark glassmorphism experience
   ============================================================ */


/* ============================================================
   1. CONFIGURATION
   ============================================================ */
var ANIM = {
  duration: { fast: 130, normal: 240, slow: 400, xslow: 600 },
  easing: {
    spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
    smooth:  'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    snappy:  'cubic-bezier(0.17, 0.84, 0.44, 1)',
    bounce:  'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    ease:    'cubic-bezier(0.4, 0, 0.2, 1)'
  }
};

// Screen order for direction-aware transitions
var SCREEN_ORDER = [
  'screen-onboard',
  'screen-home',
  'screen-budget',
  'screen-insights',
  'screen-recurring',
  'screen-report',
  'screen-settings'
];

var _lastScreen = 'screen-home';


/* ============================================================
   2. SCREEN TRANSITION ENGINE
   ============================================================ */
function animateScreenIn(targetId) {
  var fromIdx = SCREEN_ORDER.indexOf(_lastScreen);
  var toIdx   = SCREEN_ORDER.indexOf(targetId);
  _lastScreen = targetId;

  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  var isForward = toIdx > fromIdx;
  var target    = document.getElementById(targetId);
  if (!target) return;

  target.style.transition = 'none';
  target.style.transform  = 'translateX(' + (isForward ? '32px' : '-32px') + ')';
  target.style.opacity    = '0';

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      target.style.transition =
        'transform ' + ANIM.duration.normal + 'ms ' + ANIM.easing.snappy + ', ' +
        'opacity '   + ANIM.duration.normal + 'ms ' + ANIM.easing.ease;
      target.style.transform = 'translateX(0)';
      target.style.opacity   = '1';
    });
  });
}


/* ============================================================
   3. ONBOARDING ANIMATIONS
   ============================================================ */
function animateObStep(stepNum) {
  var step = document.getElementById('ob-step-' + stepNum);
  if (!step) return;

  step.style.transition = 'none';
  step.style.opacity    = '0';
  step.style.transform  = 'translateY(20px) scale(0.97)';

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      step.style.transition =
        'opacity '   + ANIM.duration.normal + 'ms ' + ANIM.easing.ease + ', ' +
        'transform ' + ANIM.duration.slow   + 'ms ' + ANIM.easing.spring;
      step.style.opacity   = '1';
      step.style.transform = 'translateY(0) scale(1)';
    });
  });
}

function animateOnboardComplete(callback) {
  var content = document.querySelector('.onboard-content');
  var orbs    = document.querySelectorAll('.onboard-orb');

  // Pulse the orbs out
  orbs.forEach(function(orb, i) {
    setTimeout(function() {
      orb.style.transition = 'transform ' + ANIM.duration.slow + 'ms ' + ANIM.easing.spring + ', opacity ' + ANIM.duration.slow + 'ms ease';
      orb.style.transform  = 'scale(2.5)';
      orb.style.opacity    = '0';
    }, i * 80);
  });

  // Fade out content
  if (content) {
    setTimeout(function() {
      content.style.transition = 'opacity ' + ANIM.duration.normal + 'ms ease, transform ' + ANIM.duration.normal + 'ms ' + ANIM.easing.smooth;
      content.style.opacity    = '0';
      content.style.transform  = 'scale(0.95)';
    }, 200);
  }

  setTimeout(function() {
    if (callback) callback();
    // Reset for future visits
    if (content) { content.style.opacity = '1'; content.style.transform = 'scale(1)'; }
    orbs.forEach(function(orb) { orb.style.opacity = '0.35'; orb.style.transform = 'scale(1)'; });
  }, 500);
}


/* ============================================================
   4. ENTRY ANIMATIONS
   ============================================================ */
function animateEntryAdd() {
  var area = document.getElementById('entriesArea');
  if (!area) return;

  var rows = area.querySelectorAll('.entry-row');
  if (!rows.length) return;

  // Animate the most recently rendered row (first in sorted list)
  var newRow = rows[0];
  newRow.style.transition = 'none';
  newRow.style.opacity    = '0';
  newRow.style.transform  = 'translateX(-16px) scale(0.96)';

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      newRow.style.transition =
        'opacity '   + ANIM.duration.normal + 'ms linear, ' +
        'transform ' + ANIM.duration.slow   + 'ms ' + ANIM.easing.spring;
      newRow.style.opacity   = '1';
      newRow.style.transform = 'translateX(0) scale(1)';
    });
  });

  animateRunningSumFlash();
  animatePillFlash();
}

function animateEntryDelete(rowEl, callback) {
  if (!rowEl) { if (callback) callback(); return; }

  rowEl.style.overflow     = 'hidden';
  rowEl.style.maxHeight    = rowEl.offsetHeight + 'px';
  rowEl.style.marginBottom = '5px';

  rowEl.style.transition =
    'opacity '       + ANIM.duration.fast   + 'ms linear, ' +
    'transform '     + ANIM.duration.normal + 'ms ' + ANIM.easing.smooth + ', ' +
    'max-height '    + ANIM.duration.normal + 'ms ' + ANIM.easing.smooth + ', ' +
    'margin-bottom ' + ANIM.duration.normal + 'ms ' + ANIM.easing.smooth + ', ' +
    'padding '       + ANIM.duration.normal + 'ms ' + ANIM.easing.smooth;

  requestAnimationFrame(function() {
    rowEl.style.opacity       = '0';
    rowEl.style.transform     = 'translateX(24px) scale(0.94)';
    rowEl.style.maxHeight     = '0';
    rowEl.style.marginBottom  = '0';
    rowEl.style.paddingTop    = '0';
    rowEl.style.paddingBottom = '0';
  });

  setTimeout(function() { if (callback) callback(); }, ANIM.duration.normal + 30);
}


/* ============================================================
   5. MODAL ANIMATIONS
   ============================================================ */
function animateModalIn() {
  var overlay = document.querySelector('.modal-overlay');
  var sheet   = document.querySelector('.modal-sheet');
  if (!overlay || !sheet) return;

  overlay.style.opacity    = '0';
  overlay.style.transition = 'none';
  sheet.style.transform    = 'translateY(110%)';
  sheet.style.transition   = 'none';

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      overlay.style.transition = 'opacity ' + ANIM.duration.normal + 'ms linear';
      overlay.style.opacity    = '1';
      sheet.style.transition   = 'transform ' + ANIM.duration.slow + 'ms ' + ANIM.easing.spring;
      sheet.style.transform    = 'translateY(0)';
    });
  });
}

function animateModalOut(callback) {
  var overlay = document.querySelector('.modal-overlay');
  var sheet   = document.querySelector('.modal-sheet');
  if (!overlay || !sheet) { if (callback) callback(); return; }

  overlay.style.transition = 'opacity ' + ANIM.duration.fast + 'ms linear';
  overlay.style.opacity    = '0';
  sheet.style.transition   = 'transform ' + ANIM.duration.normal + 'ms ' + ANIM.easing.smooth;
  sheet.style.transform    = 'translateY(60px)';

  setTimeout(function() { if (callback) callback(); }, ANIM.duration.normal);
}


/* ============================================================
   6. KEYPAD RIPPLE
   ============================================================ */
(function attachKeypadRipples() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.kp-btn');
    if (!btn) return;

    var ripple = document.createElement('span');
    var rect   = btn.getBoundingClientRect();
    var size   = Math.max(rect.width, rect.height);
    var x = e.clientX - rect.left - size / 2;
    var y = e.clientY - rect.top  - size / 2;

    ripple.style.cssText = [
      'position:absolute',
      'border-radius:50%',
      'pointer-events:none',
      'width:'  + size + 'px',
      'height:' + size + 'px',
      'top:'    + y + 'px',
      'left:'   + x + 'px',
      'background:rgba(0,230,118,0.15)',
      'transform:scale(0)',
      'transition:transform 420ms ' + ANIM.easing.smooth + ',opacity 420ms linear'
    ].join(';');

    btn.appendChild(ripple);
    requestAnimationFrame(function() {
      ripple.style.transform = 'scale(2.5)';
      ripple.style.opacity   = '0';
    });
    setTimeout(function() { ripple.remove(); }, 450);
  });
})();

// Display pop on keypress
function animateDisplayPop() {
  var d = document.getElementById('kpDisplay');
  if (!d) return;
  if (d.animate) {
    d.animate([
      { transform: 'scale(1.08)', color: 'var(--green)' },
      { transform: 'scale(1)',    color: '' }
    ], { duration: ANIM.duration.normal, easing: ANIM.easing.spring });
  }
}

// Patch kpPress for pop animation
(function patchKpPress() {
  if (typeof kpPress === 'function') {
    var orig = kpPress;
    window.kpPress = function(v) { orig(v); animateDisplayPop(); };
    return;
  }
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof kpPress === 'function') {
      var orig = kpPress;
      window.kpPress = function(v) { orig(v); animateDisplayPop(); };
    }
  });
})();


/* ============================================================
   7. RUNNING SUM FLASH
   ============================================================ */
function animateRunningSumFlash() {
  var el = document.getElementById('rsAmount');
  if (!el) return;

  if (el.animate) {
    el.animate([
      { transform: 'scale(1.18)', color: 'var(--green)' },
      { transform: 'scale(1)',    color: '' }
    ], { duration: ANIM.duration.slow, easing: ANIM.easing.spring });
  } else {
    el.style.color     = 'var(--green)';
    el.style.transform = 'scale(1.18)';
    setTimeout(function() {
      el.style.transition = 'transform ' + ANIM.duration.slow + 'ms ' + ANIM.easing.spring + ', color ' + ANIM.duration.slow + 'ms ease';
      el.style.transform  = 'scale(1)';
      el.style.color      = '';
    }, 60);
  }
}


/* ============================================================
   8. PILL FLASH
   ============================================================ */
function animatePillFlash() {
  var pill = document.querySelector('.top-pill');
  if (!pill) return;
  if (pill.animate) {
    pill.animate([
      { boxShadow: '0 0 0 4px rgba(0,230,118,0.5)' },
      { boxShadow: '0 0 24px rgba(0,230,118,0.2)'  }
    ], { duration: ANIM.duration.slow, easing: ANIM.easing.smooth });
  }
}


/* ============================================================
   9. PROGRESS BAR PULSE
   ============================================================ */
function _maybePulseBar() {
  var bar = document.getElementById('bcBar');
  if (!bar) return;
  var w = parseFloat(bar.style.width) || 0;
  if (w < 75) return;

  if (bar.animate) {
    bar.animate([
      { opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }
    ], { duration: 700, easing: 'ease' });
  }
}


/* ============================================================
   10. SHAKE / ERROR FEEDBACK
   ============================================================ */
function shakeElement(idOrEl) {
  var el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;

  var keyframes = [
    { transform: 'translateX(0)'    },
    { transform: 'translateX(-10px)'},
    { transform: 'translateX(10px)' },
    { transform: 'translateX(-7px)' },
    { transform: 'translateX(7px)'  },
    { transform: 'translateX(-3px)' },
    { transform: 'translateX(0)'    }
  ];

  if (el.animate) {
    el.animate(keyframes, { duration: 360, easing: 'ease-out' });
  } else {
    el.style.transition = 'none';
    el.style.transform  = 'translateX(-10px)';
    setTimeout(function() {
      el.style.transition = 'transform 260ms ease-out';
      el.style.transform  = 'translateX(0)';
    }, 80);
  }
}


/* ============================================================
   11. BOTTOM NAV BOUNCE
   ============================================================ */
document.addEventListener('click', function(e) {
  var navItem = e.target.closest('.nav-item');
  if (!navItem) return;
  var icon = navItem.querySelector('.nav-icon');
  if (!icon || !icon.animate) return;
  icon.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-6px) scale(1.1)' },
    { transform: 'translateY(0)' }
  ], { duration: 300, easing: ANIM.easing.spring });
});


/* ============================================================
   12. STAGGERED LIST ENTRANCE
   ============================================================ */
function staggerIn(parentSelector, childSelector, delayBase, duration) {
  delayBase = delayBase || 50;
  duration  = duration  || 260;

  var parent   = typeof parentSelector === 'string'
    ? document.querySelector(parentSelector)
    : parentSelector;
  if (!parent) return;

  var children = parent.querySelectorAll(childSelector);
  children.forEach(function(child, i) {
    child.style.opacity   = '0';
    child.style.transform = 'translateY(10px)';
    child.style.transition= 'none';

    setTimeout(function() {
      child.style.transition =
        'opacity '   + duration + 'ms linear, ' +
        'transform ' + duration + 'ms ' + ANIM.easing.snappy;
      child.style.opacity   = '1';
      child.style.transform = 'translateY(0)';
    }, i * delayBase + 50);
  });
}

// Hook: stagger insight cards + recurring cards after render
document.addEventListener('DOMContentLoaded', function() {
  if (typeof renderInsights === 'function') {
    var origI = renderInsights;
    window.renderInsights = function() {
      origI();
      setTimeout(function() { staggerIn('#insightList', '.insight-item', 65, 260); }, 30);
    };
  }

  if (typeof renderRecurring === 'function') {
    var origR = renderRecurring;
    window.renderRecurring = function() {
      origR();
      setTimeout(function() { staggerIn('#recurringList', '.recurring-card', 55, 240); }, 30);
    };
  }

  if (typeof renderReport === 'function') {
    var origRpt = renderReport;
    window.renderReport = function() {
      origRpt();
      setTimeout(function() {
        staggerIn('#screen-report', '.report-section, .verdict-banner, .report-stat-row', 80, 280);
      }, 60);
    };
  }
});


/* ============================================================
   13. ANIMATED COUNTER (smooth number rollup)
   ============================================================ */
function animateCounter(el, from, to, duration, prefix) {
  if (!el) return;
  prefix = prefix || '';
  duration = duration || ANIM.duration.slow;
  var start = performance.now();
  var diff  = to - from;

  function step(now) {
    var elapsed  = now - start;
    var progress = Math.min(elapsed / duration, 1);
    // Ease-out-cubic
    var eased = 1 - Math.pow(1 - progress, 3);
    var val   = from + diff * eased;
    el.textContent = prefix + Math.round(val).toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}


/* ============================================================
   14. HEALTH BADGE PULSE (when grade changes)
   ============================================================ */
function animateHealthBadge() {
  var badge = document.getElementById('healthBadge');
  if (!badge || !badge.animate) return;
  badge.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.3)' },
    { transform: 'scale(1)' }
  ], { duration: ANIM.duration.normal, easing: ANIM.easing.spring });
}


/* ============================================================
   15. APP SHELL ENTRANCE
   ============================================================ */
(function appShellEntrance() {
  function _animate(shell) {
    shell.style.opacity   = '0';
    shell.style.transform = 'translateY(30px) scale(0.97)';
    shell.style.transition= 'none';

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        shell.style.transition =
          'opacity 450ms linear, transform 550ms ' + ANIM.easing.spring;
        shell.style.opacity   = '1';
        shell.style.transform = 'translateY(0) scale(1)';
      });
    });
  }

  var shell = document.getElementById('appShell');
  if (shell) { _animate(shell); return; }
  document.addEventListener('DOMContentLoaded', function() {
    var s = document.getElementById('appShell');
    if (s) _animate(s);
  });
})();


/* ============================================================
   16. GLOW PULSE ON CONFIRM BUTTON
   ============================================================ */
(function pulseConfirmBtn() {
  function doPulse() {
    var btn = document.getElementById('kpConfirmBtn');
    if (!btn || !btn.animate) return;
    btn.animate([
      { boxShadow: '0 0 16px rgba(0,230,118,0.2)' },
      { boxShadow: '0 0 28px rgba(0,230,118,0.45)' },
      { boxShadow: '0 0 16px rgba(0,230,118,0.2)' }
    ], { duration: 2200, easing: 'ease-in-out', iterations: Infinity });
  }
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(doPulse, 1000);
  });
  setTimeout(doPulse, 1200);
})();


/* ============================================================
   17. KEYPAD PULL DOWN (SWIPE & TOGGLE)
   ============================================================ */
function toggleKeypad(show) {
  var keypad = document.getElementById('keypadArea');
  var fab    = document.getElementById('homeFab');
  if (!keypad || !fab) return;

  if (show) {
    keypad.classList.remove('hidden');
    fab.classList.remove('visible');
  } else {
    keypad.classList.add('hidden');
    fab.classList.add('visible');
  }
}

// Add swipe down support on the drag handle
(function initKeypadSwipe() {
  document.addEventListener('DOMContentLoaded', function() {
    var handle = document.getElementById('kpDragHandle');
    if (!handle) return;
    
    var startY = 0;
    handle.addEventListener('touchstart', function(e) {
      startY = e.touches[0].clientY;
    }, {passive: true});
    
    handle.addEventListener('touchmove', function(e) {
      var currentY = e.touches[0].clientY;
      if (currentY - startY > 25) { // 25px threshold for pull down
        toggleKeypad(false);
      }
    }, {passive: true});
  });
})();
