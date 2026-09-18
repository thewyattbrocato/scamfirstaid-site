(function () {
  'use strict';

  var STORE_KEY = 'sfa.v1.triage';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  var wizard = {
    init: function (root, planRoot) {
      if (!root || !planRoot || !window.SFA_DATA) return;

      var data = window.SFA_DATA;
      var flow = data.flow;
      var stepsCatalog = data.steps;
      var agenciesById = {};
      data.agencies.agencies.forEach(function (a) {
        agenciesById[a.id] = a;
      });
      var tierRank = {};
      var tierLabel = {};
      stepsCatalog.tiers.forEach(function (t) {
        tierRank[t.id] = t.rank;
        tierLabel[t.id] = t.label;
      });
      var questionIndex = {};
      flow.questions.forEach(function (q, i) {
        questionIndex[q.id] = i;
      });

      var storage = window.SFA.store(STORE_KEY);
      var dataVersion = 'flow' + flow.version + '.steps' + stepsCatalog.catalogVersion;
      var state = null;

      function freshState() {
        return {
          v: 1,
          dataVersion: dataVersion,
          answers: {},
          history: [],
          currentId: flow.entry,
          done: false,
          checked: {}
        };
      }

      function save() {
        storage.set(state);
      }

      function optionFor(question, optionId) {
        var found = null;
        question.options.forEach(function (o) {
          if (o.id === optionId) found = o;
        });
        return found;
      }

      function nextOf(questionId, chosenOption) {
        if (chosenOption && chosenOption.next) return chosenOption.next;
        var idx = questionIndex[questionId];
        if (idx + 1 < flow.questions.length) return flow.questions[idx + 1].id;
        return flow.end;
      }

      function collectTags() {
        var tags = [];
        flow.questions.forEach(function (q) {
          var picked = state.answers[q.id] || [];
          picked.forEach(function (optId) {
            var o = optionFor(q, optId);
            if (o && o.tags) {
              o.tags.forEach(function (t) {
                if (tags.indexOf(t) === -1) tags.push(t);
              });
            }
          });
        });
        return tags;
      }

      function selectSteps() {
        var tags = collectTags();
        var picked = stepsCatalog.steps.filter(function (s) {
          var req = s.requireAny || [];
          var exclude = s.excludeAny || [];
          if (exclude.some(function (t) {
            return tags.indexOf(t) !== -1;
          })) return false;
          if (req.length === 0) return true;
          return req.some(function (t) {
            return tags.indexOf(t) !== -1;
          });
        });
        picked.sort(function (a, b) {
          if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
          return a.order - b.order;
        });
        return picked;
      }

      function branchTotal() {
        var count = 0;
        var id = flow.entry;
        while (id && Object.prototype.hasOwnProperty.call(questionIndex, id)) {
          count += 1;
          var q = flow.questions[questionIndex[id]];
          var picked = state.answers[id] || [];
          var last = picked.length === 1 ? optionFor(q, picked[0]) : null;
          id = nextOf(id, last);
          if (id === flow.end) break;
        }
        return Math.max(count, state.history.length + 1);
      }

      function buildProgress(q) {
        var position = state.history.length + 1;
        var total = branchTotal();
        var wrap = el('div', 'wiz-progress-wrap');
        var progressText = el('p', 'wiz-progress');
        progressText.textContent = 'Question ' + position + ' of ' + total;
        wrap.appendChild(progressText);
        var barWrap = el('div', 'progressbar');
        barWrap.setAttribute('aria-hidden', 'true');
        var fill = el('span');
        fill.style.width = Math.round(((position - 1) / total) * 100) + '%';
        barWrap.appendChild(fill);
        wrap.appendChild(barWrap);
        wrap.appendChild(el('p', 'wiz-reassure', 'Take your time. There are no wrong answers here.'));
        return wrap;
      }

      function syncExclusive(changed, choices) {
        var changedIsNone = changed.tags.length === 0;
        choices.querySelectorAll('input').forEach(function (inp) {
          var o = null;
          var q = currentQuestion();
          o = optionFor(q, inp.value);
          if (!o) return;
          if (changedIsNone && o.id !== changed.id) inp.checked = false;
          if (!changedIsNone && o.tags.length === 0) inp.checked = false;
        });
      }

      function currentQuestion() {
        var found = null;
        flow.questions.forEach(function (item) {
          if (item.id === state.currentId) found = item;
        });
        return found;
      }

      function questionEl(q) {
        var wrap = el('div');
        wrap.appendChild(buildProgress(q));

        var box = document.createElement('fieldset');
        box.className = 'qcard';

        var legend = document.createElement('legend');
        var title = el('p', 'qcard-title', q.text);
        title.id = 'q-' + q.id + '-text';
        title.setAttribute('tabindex', '-1');
        legend.appendChild(title);
        box.appendChild(legend);

        var why = el('p', 'why', 'Why we ask: ' + q.whyWeAsk);
        box.appendChild(why);

        var choices = el('ul', 'choices');
        var priorPicks = state.answers[q.id] || [];

        if (q.type === 'single') {
          q.options.forEach(function (o) {
            var li = el('li');
            var btn = el('button', 'choice', o.label);
            btn.type = 'button';
            btn.addEventListener('click', function () {
              choose(q, [o.id]);
            });
            li.appendChild(btn);
            choices.appendChild(li);
          });
        } else {
          q.options.forEach(function (o) {
            var li = el('li');
            var label = el('label', 'choice');
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = o.id;
            input.checked = priorPicks.indexOf(o.id) !== -1;
            input.addEventListener('change', function () {
              syncExclusive(o, choices);
            });
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + o.label));
            li.appendChild(label);
            choices.appendChild(li);
          });
        }
        box.appendChild(choices);

        var actions = el('div', 'wiz-actions');
        if (q.type === 'multi') {
          var cont = el('button', 'btn primary', 'Continue');
          cont.type = 'button';
          cont.addEventListener('click', function () {
            var picks = [];
            choices.querySelectorAll('input').forEach(function (inp) {
              if (inp.checked) picks.push(inp.value);
            });
            choose(q, picks);
          });
          actions.appendChild(cont);
        }
        if (state.history.length > 0) {
          var back = el('button', 'btn', 'Back');
          back.type = 'button';
          back.addEventListener('click', goBack);
          actions.appendChild(back);
        }
        box.appendChild(actions);

        wrap.appendChild(box);
        return wrap;
      }

      function choose(q, optIds) {
        state.answers[q.id] = optIds.slice();
        var last = optIds.length === 1 ? optionFor(q, optIds[0]) : null;
        var nextId = nextOf(q.id, last);
        state.history.push(q.id);
        if (nextId === flow.end || !Object.prototype.hasOwnProperty.call(questionIndex, nextId)) {
          state.currentId = null;
          state.done = true;
        } else {
          state.currentId = nextId;
        }
        save();
        render();
      }

      function goBack() {
        var prevId = state.history.pop();
        if (!prevId) return;
        delete state.answers[state.currentId];
        state.currentId = prevId;
        state.done = false;
        save();
        render();
      }

      function sayBlock(line) {
        var block = el('div', 'say-block');
        block.appendChild(el('p', 'step-label', 'Say this'));
        var quote = el('blockquote');
        quote.textContent = line;
        block.appendChild(quote);
        var copy = el('button', 'copy-btn', 'Copy');
        copy.type = 'button';
        copy.addEventListener('click', function () {
          window.SFA.copyText(line, copy);
        });
        block.appendChild(copy);
        return block;
      }

      function contactList(step) {
        var list = el('ul', 'contacts');
        (step.phones || []).forEach(function (p) {
          var li = el('li');
          var a = document.createElement('a');
          a.className = 'phone-link';
          a.href = window.SFA.telHref(p.phone);
          a.textContent = window.SFA.prettyPhone(p.phone);
          li.appendChild(a);
          li.appendChild(document.createTextNode(' ' + p.label));
          list.appendChild(li);
        });
        (step.links || []).forEach(function (l) {
          var agency = l.agency ? agenciesById[l.agency] : null;
          var targets = agency ? agency.urls : [{ label: l.label, url: l.url }];
          (targets || []).forEach(function (u) {
            var li = el('li');
            var a = document.createElement('a');
            a.href = u.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = u.label;
            li.appendChild(a);
            list.appendChild(li);
          });
        });
        return list.children.length ? list : null;
      }

      function sourceLine(step) {
        var src = step.source || {};
        if (!src.title && !src.reviewed) return null;
        var p = el('p', 'source-line');
        p.appendChild(document.createTextNode('Source: '));
        if (src.url) {
          var a = document.createElement('a');
          a.href = src.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = src.title;
          p.appendChild(a);
        } else {
          p.appendChild(document.createTextNode(src.title));
        }
        p.appendChild(document.createTextNode(' · reviewed ' + src.reviewed));
        return p;
      }

      function crisisBox() {
        var box = el('section', 'crisis-box');
        box.setAttribute('aria-labelledby', 'crisis-title');
        var h3 = el('h3', null, 'Free help, any hour');
        h3.id = 'crisis-title';
        box.appendChild(h3);
        var ul = el('ul');

        function phoneRecord(agencyId) {
          var agency = agenciesById[agencyId];
          return agency && agency.phones && agency.phones[0] ? agency.phones[0] : null;
        }
        function telLink(agencyId) {
          var record = phoneRecord(agencyId);
          if (!record) return null;
          var a = document.createElement('a');
          a.href = window.SFA.telHref(record.number);
          a.textContent = window.SFA.prettyPhone(record.number);
          return a;
        }
        function siteLink(agencyId) {
          var agency = agenciesById[agencyId];
          if (!agency || !agency.urls || !agency.urls[0]) return null;
          var a = document.createElement('a');
          a.href = agency.urls[0].url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = agency.urls[0].label;
          return a;
        }
        function item(lead, parts) {
          var li = el('li');
          li.appendChild(document.createTextNode(lead + ' '));
          parts.forEach(function (part) {
            if (typeof part === 'string') li.appendChild(document.createTextNode(part));
            else if (part) li.appendChild(part);
          });
          ul.appendChild(li);
        }

        item('Feeling overwhelmed or hopeless?', [
          'Call or text ', telLink('lifeline-988'), ', or visit ', siteLink('lifeline-988'), '.'
        ]);
        item('Worried about an older adult?', [
          'Call ', telLink('eldercare-locator'), ' for help near them, or visit ', siteLink('eldercare-locator'), '.'
        ]);
        item('Age 60 or older and scammed?', [
          'Trained staff call you back and walk you through reporting. Call ',
          telLink('ovc-elder-hotline'),
          (function () {
            var hours = phoneRecord('ovc-elder-hotline');
            return hours && hours.hours ? ' (' + hours.hours + ')' : '';
          })(),
          ', or visit ', siteLink('ovc-elder-hotline'), '.'
        ]);
        ul.appendChild(el('li', 'danger-line', 'Anyone in immediate danger? Call 911.'));
        box.appendChild(ul);
        return box;
      }

      function privacyNote() {
        var p = el('p', 'privacy-print-note');
        p.textContent = 'Printed from Scam First Aid. Nothing you typed was sent anywhere. This guide is general information, not legal or financial advice.';
        return p;
      }

      function evidenceBox() {
        var block = stepsCatalog.evidenceChecklist;
        if (!block || !block.items) return null;
        var sec = el('section', 'evidence-box');
        sec.setAttribute('aria-labelledby', 'evidence-title');
        var h3 = el('h3', null, block.title);
        h3.id = 'evidence-title';
        sec.appendChild(h3);
        sec.appendChild(el('p', null, block.intro));
        var ul = el('ul');
        block.items.forEach(function (line) {
          ul.appendChild(el('li', null, line));
        });
        sec.appendChild(ul);
        return sec;
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
          line.appendChild(document.createTextNode('.'));
          ul.appendChild(line);
        }
        var crisis = el('li');
        crisis.appendChild(document.createTextNode('In crisis, call or text '));
        var now = document.createElement('a');
        now.href = window.SFA.telHref('988');
        now.textContent = '988';
        crisis.appendChild(now);
        crisis.appendChild(document.createTextNode('.'));
        ul.appendChild(crisis);
        sec.appendChild(ul);
        return sec;
      }

      function stepCard(s, number) {
        var card = el('article', 'step-card');
        card.dataset.stepId = s.id;
        if (state.checked[s.id]) card.classList.add('is-done');

        var head = el('div', 'step-head');
        head.appendChild(el('span', 'step-number', number + '.'));
        head.appendChild(el('h4', null, s.title));
        head.appendChild(el('span', 'badge badge-' + s.tier, tierLabel[s.tier] || s.tier));
        card.appendChild(head);

        var what = el('p');
        what.appendChild(el('span', 'step-label', 'What: '));
        what.appendChild(document.createTextNode(s.what));
        card.appendChild(what);

        var why = el('p');
        why.appendChild(el('span', 'step-label', 'Why: '));
        why.appendChild(document.createTextNode(s.why));
        card.appendChild(why);

        (s.say || []).forEach(function (line) {
          card.appendChild(sayBlock(line));
        });

        if (s.note) {
          var note = el('p', 'step-note');
          if (window.SFA.isDangerCue(s.note)) note.classList.add('danger-note');
          note.appendChild(el('strong', null, 'Note: '));
          note.appendChild(document.createTextNode(s.note));
          card.appendChild(note);
        }

        var contacts = contactList(s);
        if (contacts) card.appendChild(contacts);

        var src = sourceLine(s);
        if (src) card.appendChild(src);

        var done = el('label', 'done-box');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!state.checked[s.id];
        cb.addEventListener('change', function () {
          state.checked[s.id] = cb.checked;
          card.classList.toggle('is-done', cb.checked);
          save();
          window.SFA.announce(cb.checked ? s.title + ' marked done.' : s.title + ' unmarked.');
        });
        done.appendChild(cb);
        done.appendChild(document.createTextNode(' Done'));
        card.appendChild(done);

        return card;
      }

      function buildPlanHeader() {
        var head = el('div', 'plan-header');
        var titleWrap = el('div', 'plan-title-wrap');
        var h2 = el('h2', null, 'Your action plan');
        h2.id = 'plan-title';
        h2.setAttribute('tabindex', '-1');
        titleWrap.appendChild(h2);
        var made = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        titleWrap.appendChild(el('p', 'plan-date', 'Made ' + made));
        head.appendChild(titleWrap);
        var acts = el('div', 'plan-actions');

        var printBtn = el('button', 'btn primary', 'Print this plan');
        printBtn.type = 'button';
        printBtn.addEventListener('click', function () {
          window.print();
        });
        acts.appendChild(printBtn);

        var bigBtn = el('button', 'btn', 'Larger text');
        bigBtn.type = 'button';
        bigBtn.setAttribute('aria-pressed', 'false');
        bigBtn.addEventListener('click', function () {
          var on = document.body.classList.toggle('large-print');
          bigBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
          window.SFA.announce(on ? 'Larger text on.' : 'Larger text off.');
        });
        acts.appendChild(bigBtn);

        var resetBtn = el('button', 'btn', 'Start over');
        resetBtn.type = 'button';
        resetBtn.addEventListener('click', function () {
          if (!window.confirm('Start over? Your answers on this device will be erased.')) return;
          storage.clear();
          state = freshState();
          planRoot.innerHTML = '';
          planRoot.hidden = true;
          render();
        });
        acts.appendChild(resetBtn);

        head.appendChild(acts);
        return head;
      }

      function renderPlan() {
        document.body.classList.add('plan-shown');
        var steps = selectSteps();
        planRoot.hidden = false;
        planRoot.innerHTML = '';
        var brand = el('p', 'plan-print-brand', 'Scam First Aid - free, private help after a scam');
        planRoot.appendChild(brand);
        planRoot.appendChild(buildPlanHeader());

        planRoot.appendChild(el('p', 'lede', 'Work top to bottom. Each step tells you what to do, why it matters, and what to say.'));

        var evidence = evidenceBox();
        if (evidence) planRoot.appendChild(evidence);

        var summaryWrap = el('div', 'summary-wrap');
        summaryWrap.appendChild(el('p', 'step-label', 'Your answers'));
        var chips = el('ul', 'summary-chips');
        flow.questions.forEach(function (q) {
          (state.answers[q.id] || []).forEach(function (pid) {
            var o = optionFor(q, pid);
            if (!o) return;
            chips.appendChild(el('li', 'chip', o.label));
          });
        });
        summaryWrap.appendChild(chips);
        planRoot.appendChild(summaryWrap);

        var listWrap = el('div', 'plan-list-wrap');
        var currentTier = null;
        var currentOl = null;
        var stepNumber = 1;
        steps.forEach(function (s) {
          if (s.tier !== currentTier) {
            currentTier = s.tier;
            currentOl = el('ol', 'plan-list');
            currentOl.start = stepNumber;
            listWrap.appendChild(el('h3', 'tier-heading', tierLabel[s.tier] || s.tier));
            listWrap.appendChild(currentOl);
          }
          var item = el('li', 'plan-item');
          item.appendChild(stepCard(s, stepNumber));
          currentOl.appendChild(item);
          stepNumber += 1;
        });
        planRoot.appendChild(listWrap);
        planRoot.appendChild(crisisBox());
        planRoot.appendChild(walletCard());
        planRoot.appendChild(privacyNote());

        var focusTarget = planRoot.querySelector('#plan-title');
        if (focusTarget) focusTarget.focus();
        window.SFA.announce('Your action plan is ready with ' + steps.length + ' steps.');
      }

      function renderQuestion() {
        document.body.classList.remove('plan-shown');
        planRoot.hidden = true;
        planRoot.innerHTML = '';
        root.hidden = false;
        var body = root.querySelector('#wiz-body') || root;
        body.innerHTML = '';
        var q = currentQuestion();
        if (!q) return;
        body.appendChild(questionEl(q));
        var focusTarget = body.querySelector('.qcard-title');
        if (focusTarget) focusTarget.focus();
        window.SFA.announce('Question ' + (state.history.length + 1) + ' of ' + branchTotal() + ': ' + q.text);
      }

      function render() {
        if (state.done) {
          root.hidden = true;
          renderPlan();
        } else {
          renderQuestion();
        }
      }

      var saved = storage.get();
      if (saved && saved.v === 1 && saved.dataVersion === dataVersion) {
        state = saved;
      } else {
        state = freshState();
      }
      render();
    }
  };

  window.SFA.wizard = wizard;
})();
