(function () {
  'use strict';

  var STORE_KEY = 'sfa.v1.family';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function copyBlock(text, btn) {
    window.SFA.copyText(text, btn);
  }

  var family = {
    init: function (form, out) {
      if (!form || !out || !window.SFA_DATA) return;
      var guide = window.SFA_DATA.familyGuide;
      var agenciesById = {};
      window.SFA_DATA.agencies.agencies.forEach(function (a) {
        agenciesById[a.id] = a;
      });
      var storage = window.SFA.store(STORE_KEY);
      var fields = form.querySelector('#fam-fields');

      var relSel = form.querySelector('#fam-relationship');
      var sitSel = form.querySelector('#fam-situation');
      var scenSel = form.querySelector('#fam-scenario');
      var defaultRelationship = populateSelect(relSel, guide.relationships);
      var defaultSituation = populateSelect(sitSel, guide.situations);
      var saved = storage.get();
      var relationship = defaultRelationship;
      var situation = defaultSituation;
      if (saved && saved.v === 1) {
        if (hasOption(relSel, saved.relationship)) relationship = saved.relationship;
        if (hasOption(sitSel, saved.situation)) situation = saved.situation;
      }
      // The plan links here with only a scenario name in the URL fragment (#situation=lost).
      // It never holds answers or personal data, and it wins over the saved choice.
      var carried = /^#situation=(lost|ongoing)$/.exec(window.location.hash || '');
      if (carried && hasOption(sitSel, carried[1])) situation = carried[1];
      relSel.value = relationship;
      sitSel.value = situation;
      populateScenarios(relationship);
      // Scenario and cadence choices stay ephemeral: they are never stored.
      scenSel.value = defaultScenario(situation);
      var cadence = defaultCadence();
      if (fields) fields.disabled = false;

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        storage.set({ v: 1, relationship: relSel.value, situation: sitSel.value });
        render(relSel.value, sitSel.value, scenSel.value, currentCadence());
      });

      relSel.addEventListener('change', function () {
        populateScenarios(relSel.value);
      });

      sitSel.addEventListener('change', function () {
        scenSel.value = defaultScenario(sitSel.value);
      });

      scenSel.addEventListener('change', function () {
        render(relSel.value, sitSel.value, scenSel.value, currentCadence());
      });

      out.addEventListener('change', function (event) {
        if (event.target && event.target.name === 'fam-cadence') {
          render(relSel.value, sitSel.value, scenSel.value, currentCadence());
        }
      });

      var resetBtn = form.querySelector('#fam-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          if (!window.confirm('Clear the family playbook choices stored on this device?')) return;
          storage.clear();
          relSel.value = defaultRelationship;
          sitSel.value = defaultSituation;
          populateScenarios(defaultRelationship);
          scenSel.value = defaultScenario(defaultSituation);
          render(defaultRelationship, defaultSituation, scenSel.value, defaultCadence());
        });
      }

      function populateSelect(select, items) {
        if (!select) return '';
        select.innerHTML = '';
        (items || []).forEach(function (item) {
          var option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          select.appendChild(option);
        });
        return select.options[0] ? select.options[0].value : '';
      }

      function hasOption(select, value) {
        if (!select || !value) return false;
        return Array.prototype.some.call(select.options, function (option) {
          return option.value === value;
        });
      }

      function applicableScenarios(relationshipId) {
        var list = (guide.scenarios || []).filter(function (s) {
          return (s.appliesTo || []).indexOf(relationshipId) !== -1;
        });
        return list.length ? list : (guide.scenarios || []);
      }

      function populateScenarios(relationshipId) {
        var keep = scenSel ? scenSel.value : '';
        populateSelect(scenSel, applicableScenarios(relationshipId));
        if (scenSel && hasOption(scenSel, keep)) scenSel.value = keep;
      }

      function defaultScenario(situationId) {
        if (situationId === 'ongoing') return 'mid-scam';
        if (situationId === 'lost') return 'after-loss';
        return 'repeat';
      }

      function scenarioById(scenarioId, relationshipId) {
        var list = applicableScenarios(relationshipId);
        for (var i = 0; i < list.length; i += 1) {
          if (list[i].id === scenarioId) return list[i];
        }
        return list[0];
      }

      function defaultCadence() {
        return (guide.ritual && guide.ritual.cadences[0] && guide.ritual.cadences[0].id) || 'weekly';
      }

      function currentCadence() {
        var checked = out.querySelector('input[name="fam-cadence"]:checked');
        return checked ? checked.value : cadence;
      }

      function openerText(relationshipId, situationId) {
        var set = guide.openers;
        if (situationId === 'lost' && guide.openersAfterLoss) set = guide.openersAfterLoss;
        if (situationId === 'ongoing' && guide.openersOngoing) set = guide.openersOngoing;
        return set[relationshipId] || set.relative;
      }

      function sayGroup(lines) {
        var wrap = el('div', 'say-block');
        var joined = lines.join('\n');
        var quote = el('blockquote');
        var list = el('ul', 'script-lines');
        lines.forEach(function (line) {
          list.appendChild(el('li', null, line));
        });
        quote.appendChild(list);
        wrap.appendChild(quote);
        var btn = el('button', 'copy-btn', 'Copy');
        btn.type = 'button';
        btn.addEventListener('click', function () {
          copyBlock(joined, btn);
        });
        wrap.appendChild(btn);
        return wrap;
      }

      function callout(text) {
        var box = el('div', 'fam-callout');
        box.setAttribute('role', 'note');
        var p = el('p');
        var marker = 'After-a-scam wizard';
        var at = text.indexOf(marker);
        if (at === -1) {
          p.textContent = text;
        } else {
          var a = document.createElement('a');
          a.href = 'after-a-scam.html';
          a.textContent = marker;
          p.appendChild(document.createTextNode(text.slice(0, at)));
          p.appendChild(a);
          p.appendChild(document.createTextNode(text.slice(at + marker.length)));
        }
        box.appendChild(p);
        return box;
      }

      function escalationItem(item) {
        var li = el('li');
        if (window.SFA.isDangerCue(item.text)) li.className = 'danger-line';
        li.appendChild(document.createTextNode(item.text));
        var agency = item.agency ? agenciesById[item.agency] : null;
        appendAgencyContact(li, agency, { phoneDetails: true });
        if (agency && agency.warning) li.appendChild(document.createTextNode(' ' + agency.warning));
        return li;
      }

      function ladderRung(rung) {
        var li = el('li');
        li.appendChild(el('strong', null, rung.name + '. '));
        li.appendChild(document.createTextNode(rung.text));
        var agency = rung.agency ? agenciesById[rung.agency] : null;
        appendAgencyContact(li, agency);
        return li;
      }

      function appendAgencyContact(parent, agency, options) {
        var added = false;
        var phoneRecord = agency && agency.phones && agency.phones[0] ? agency.phones[0] : null;
        if (phoneRecord) {
          parent.appendChild(document.createTextNode(' '));
          var phoneLink = document.createElement('a');
          phoneLink.href = window.SFA.telHref(phoneRecord.number);
          phoneLink.textContent = window.SFA.prettyPhone(phoneRecord.number);
          parent.appendChild(phoneLink);
          if (options && options.phoneDetails) {
            if (phoneRecord.label) parent.appendChild(document.createTextNode(' ' + phoneRecord.label));
            if (phoneRecord.hours) parent.appendChild(document.createTextNode(' (' + phoneRecord.hours + ')'));
          }
          parent.appendChild(document.createTextNode(' '));
          parent.appendChild(window.SFA.phoneStateNode(phoneRecord));
          added = true;
        }
        if (agency && agency.urls && agency.urls[0]) {
          parent.appendChild(document.createTextNode(added ? ', ' : ' '));
          var link = document.createElement('a');
          link.href = agency.urls[0].url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = agency.urls[0].label;
          parent.appendChild(link);
        }
      }

      function walletCard() {
        var sec = el('section', 'wallet-card');
        sec.setAttribute('aria-labelledby', 'wallet-title');
        var h3 = el('h3', null, 'Wallet card');
        h3.id = 'wallet-title';
        sec.appendChild(h3);
        sec.appendChild(el('p', null, 'Cut this out and keep it in your wallet.'));
        var ul = el('ul');
        ul.appendChild(el('li', null, 'Our family safe word: ________________'));
        ul.appendChild(el('li', null, 'Hang up first. Call back on a number you already know.'));
        ul.appendChild(el('li', null, 'Bank fraud line: ________________'));
        var hotline = agenciesById['ovc-elder-hotline'];
        if (hotline && hotline.phones && hotline.phones[0]) {
          var rec = hotline.phones[0];
          var line = el('li');
          line.appendChild(document.createTextNode('Elder fraud hotline: '));
          var hot = document.createElement('a');
          hot.href = window.SFA.telHref(rec.number);
          hot.textContent = window.SFA.prettyPhone(rec.number);
          line.appendChild(hot);
          if (rec.hours) line.appendChild(document.createTextNode(' (' + rec.hours + ')'));
          line.appendChild(document.createTextNode(' '));
          line.appendChild(window.SFA.phoneStateNode(rec));
          ul.appendChild(line);
        }
        var crisis = el('li');
        crisis.appendChild(document.createTextNode('In crisis, call or text '));
        var now = document.createElement('a');
        now.href = window.SFA.telHref('988');
        now.textContent = '988';
        crisis.appendChild(now);
        crisis.appendChild(document.createTextNode(' '));
        var nowAgency = agenciesById['lifeline-988'];
        crisis.appendChild(window.SFA.phoneStateNode(nowAgency ? window.SFA.findPhone(nowAgency, '988') : null));
        ul.appendChild(crisis);
        sec.appendChild(ul);
        return sec;
      }

      function ritualStrip(cadenceId) {
        var ritual = guide.ritual;
        var strip = el('div', 'ritual-strip print-only');
        strip.setAttribute('aria-label', 'Twelve check-ins');
        var unit = cadenceId === 'monthly' ? 'Month' : 'Week';
        strip.appendChild(el('h4', null, 'Twelve check-ins'));
        var slots = el('ol', 'ritual-slots');
        for (var i = 0; i < 12; i += 1) {
          var prompt = ritual.prompts[i % ritual.prompts.length];
          slots.appendChild(el('li', null, unit + ' ' + (i + 1) + ': ' + prompt));
        }
        strip.appendChild(slots);
        strip.appendChild(el('p', 'strip-note', ritual.stripNote));
        return strip;
      }

      function render(relationshipId, situationId, scenarioId, cadenceId) {
        cadence = cadenceId || defaultCadence();
        var scenario = scenarioById(scenarioId, relationshipId);
        out.innerHTML = '';
        out.hidden = false;
        out.appendChild(el('h2', null, 'Your family playbook')).id = 'fp-title';

        if (situationId === 'ongoing' && guide.urgentNote.ongoing) {
          out.appendChild(callout(guide.urgentNote.ongoing));
        }
        if (situationId === 'lost' && guide.urgentNote.lost) {
          out.appendChild(callout(guide.urgentNote.lost));
        }

        var openSec = el('section');
        openSec.appendChild(el('h3', null, 'Open the conversation'));
        var opener = sayGroup([openerText(relationshipId, situationId)]);
        openSec.appendChild(opener);
        openSec.appendChild(el('p', null, guide.intro));
        out.appendChild(openSec);

        var normSec = el('section');
        normSec.appendChild(el('h3', null, 'Take the shame off the table'));
        normSec.appendChild(sayGroup(guide.coreScript.normalize));
        out.appendChild(normSec);

        var offerSec = el('section');
        offerSec.appendChild(el('h3', null, 'Offer help, not a takeover'));
        offerSec.appendChild(sayGroup(guide.coreScript.offer));
        offerSec.appendChild(sayGroup(guide.coreScript.close));
        out.appendChild(offerSec);

        if (scenario) {
          var scenSec = el('section', 'scenario-block');
          scenSec.setAttribute('data-scenario', scenario.id);
          scenSec.appendChild(el('h3', null, 'Words for this moment'));
          scenSec.appendChild(el('p', 'scenario-label', scenario.label));
          scenSec.appendChild(sayGroup(scenario.lines));
          out.appendChild(scenSec);
        }

        var avoidSec = el('section');
        avoidSec.appendChild(el('h3', null, 'Words to skip'));
        var table = el('table', 'avoid-table');
        var caption = el('caption', null, 'Swap these lines instead.');
        table.appendChild(caption);
        var thead = el('thead');
        var hr = el('tr');
        hr.appendChild(el('th', null, 'Do not say'));
        hr.appendChild(el('th', null, 'Say instead'));
        thead.appendChild(hr);
        table.appendChild(thead);
        var tbody = el('tbody');
        guide.avoidList.forEach(function (row) {
          var tr = el('tr');
          tr.appendChild(el('td', null, row.doNotSay));
          tr.appendChild(el('td', null, row.sayInstead));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        avoidSec.appendChild(table);
        out.appendChild(avoidSec);

        if (guide.resistanceMoves && guide.resistanceMoves.length) {
          var resSec = el('section', 'resistance-block');
          resSec.appendChild(el('h3', null, 'When they push back'));
          var movesUl = el('ul', 'resistance-moves');
          guide.resistanceMoves.forEach(function (move) {
            var li = el('li');
            li.appendChild(el('strong', null, move.name + '. '));
            li.appendChild(document.createTextNode(move.text));
            movesUl.appendChild(li);
          });
          resSec.appendChild(movesUl);
          if (guide.hardLine) resSec.appendChild(el('p', 'hard-line', guide.hardLine));
          out.appendChild(resSec);
        }

        var swSec = el('section');
        swSec.setAttribute('aria-labelledby', 'safeword-title');
        swSec.appendChild(el('h3', null, guide.safeWord.title)).id = 'safeword-title';
        swSec.appendChild(el('p', null, guide.safeWord.why));
        var stepsOl = el('ol', 'script-lines');
        guide.safeWord.steps.forEach(function (s) {
          stepsOl.appendChild(el('li', null, s));
        });
        swSec.appendChild(stepsOl);
        var agreeLbl = el('p', 'step-label', 'Print and sign your family agreement');
        swSec.appendChild(agreeLbl);
        var agreeUl = el('ul', 'agreement-lines');
        guide.safeWord.agreementLines.forEach(function (line) {
          agreeUl.appendChild(el('li', null, line));
        });
        swSec.appendChild(agreeUl);
        if (guide.safeWord.refreshNote) {
          swSec.appendChild(el('p', 'refresh-note', guide.safeWord.refreshNote));
        }
        out.appendChild(swSec);

        if (guide.safeWord.practiceScript) {
          var practice = guide.safeWord.practiceScript;
          var prSec = el('section', 'practice-block');
          prSec.appendChild(el('h3', null, practice.title));
          var roles = el('div', 'practice-roles');
          var callerDiv = el('div', 'practice-role');
          callerDiv.appendChild(el('h4', null, practice.callerLabel));
          var callerUl = el('ul', 'script-lines');
          practice.caller.forEach(function (line) {
            callerUl.appendChild(el('li', null, line));
          });
          callerDiv.appendChild(callerUl);
          var calleeDiv = el('div', 'practice-role');
          calleeDiv.appendChild(el('h4', null, practice.calleeLabel));
          var calleeUl = el('ul', 'script-lines');
          practice.callee.forEach(function (line) {
            calleeUl.appendChild(el('li', null, line));
          });
          calleeDiv.appendChild(calleeUl);
          roles.appendChild(callerDiv);
          roles.appendChild(calleeDiv);
          prSec.appendChild(roles);
          out.appendChild(prSec);
        }

        if (guide.letterTemplate) {
          var letter = guide.letterTemplate;
          var letterSec = el('section', 'letter-block print-only');
          letterSec.setAttribute('aria-labelledby', 'letter-title');
          letterSec.appendChild(el('h3', null, letter.title)).id = 'letter-title';
          letterSec.appendChild(el('p', null, letter.why));
          var letterBody = el('div', 'letter-body');
          letter.paragraphs.forEach(function (para) {
            letterBody.appendChild(el('p', null, para));
          });
          letterSec.appendChild(letterBody);
          out.appendChild(letterSec);
        }

        if (guide.ritual) {
          var ritSec = el('section', 'ritual-section');
          ritSec.appendChild(el('h3', null, guide.ritual.title));
          ritSec.appendChild(el('p', null, guide.ritual.why));
          var picker = el('fieldset', 'ritual-picker');
          picker.appendChild(el('legend', null, 'How often will you check in?'));
          guide.ritual.cadences.forEach(function (option) {
            var label = el('label', 'ritual-option');
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'fam-cadence';
            radio.value = option.id;
            if (option.id === cadence) radio.checked = true;
            label.appendChild(radio);
            label.appendChild(document.createTextNode(' ' + option.label));
            picker.appendChild(label);
          });
          ritSec.appendChild(picker);
          ritSec.appendChild(ritualStrip(cadence));
          out.appendChild(ritSec);
        }

        var ladderSec = el('section');
        ladderSec.setAttribute('aria-labelledby', 'ladder-title');
        ladderSec.appendChild(el('h3', null, guide.monitoringLadder.title)).id = 'ladder-title';
        var ladderOl = el('ol', 'script-lines');
        guide.monitoringLadder.rungs.forEach(function (rung) {
          ladderOl.appendChild(ladderRung(rung));
        });
        ladderSec.appendChild(ladderOl);
        out.appendChild(ladderSec);

        var escSec = el('section', 'crisis-box');
        escSec.setAttribute('aria-labelledby', 'esc-title');
        escSec.appendChild(el('h3', null, guide.escalation.title)).id = 'esc-title';
        var escUl = el('ul');
        guide.escalation.items.forEach(function (item) {
          escUl.appendChild(escalationItem(item));
        });
        escSec.appendChild(escUl);
        out.appendChild(escSec);

        out.appendChild(walletCard());

        out.appendChild((function () {
          var p = el('p', 'privacy-print-note');
          p.textContent = 'Printed from Scam First Aid. Nothing you chose was sent anywhere. This guide is general information, not legal or financial advice.';
          return p;
        })());

        window.SFA.announce('Your family playbook is ready below. You can print it.');
      }

      render(relSel.value, sitSel.value, scenSel.value, cadence);
    }
  };

  window.SFA.family = family;
})();
