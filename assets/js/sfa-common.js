(function () {
  'use strict';

  var LIVE_ID = 'sfa-live';

  function live() {
    return document.getElementById(LIVE_ID);
  }

  function announce(text) {
    var region = live();
    if (!region) return;
    region.textContent = '';
    window.setTimeout(function () {
      if (region) region.textContent = text;
    }, 30);
  }

  function store(key) {
    function get() {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return null;
      }
    }
    function set(value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    }
    function clear() {
      try {
        window.localStorage.removeItem(key);
      } catch (err) {}
    }
    return { get: get, set: set, clear: clear };
  }

  function copyText(text, btn, afterCopy) {
    function done(ok) {
      if (btn && typeof btn.focus === 'function') btn.focus();
      announce(ok ? 'Copied.' : 'Copy did not work. You can select the text and copy it by hand.');
      if (afterCopy) afterCopy(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(ta);
    done(ok);
  }

  function fault(err) {
    if (window.console && console.error) console.error(err);
    announce('Something went wrong on this page. The information below still works.');
  }

  function prettyPhone(digits) {
    var d = String(digits).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') {
      return '1-' + d.slice(1, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7);
    }
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return String(digits);
  }

  function telHref(digits) {
    var d = String(digits).replace(/\D/g, '');
    if (d.length === 3) return 'tel:' + d;
    return 'tel:+' + d;
  }

  function isDangerCue(text) {
    return /\b911\b/.test(String(text || ''));
  }

  window.SFA = {
    announce: announce,
    store: store,
    copyText: copyText,
    fault: fault,
    prettyPhone: prettyPhone,
    telHref: telHref,
    isDangerCue: isDangerCue,
    liveId: LIVE_ID
  };
})();
