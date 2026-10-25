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

      var sideRoot = document.getElementById('plan-side');
      var sideSteps = [];
      var sideCurrentId = null;

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

        // A heading plus a labelled group: the question is a real heading, not a legend wrapper.
        var box = el('div', 'qcard');
        box.setAttribute('role', 'group');
        box.setAttribute('aria-labelledby', 'q-' + q.id + '-text');

        var title = el('h3', 'qcard-title', q.text);
        title.id = 'q-' + q.id + '-text';
        title.setAttribute('tabindex', '-1');
        box.appendChild(title);

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

      function helperMode() {
        var who = (state.answers.who || [])[0];
        if (who === 'family') return 'helper';
        if (who === 'unsure') return 'both';
        return 'me';
      }

      function sayBlock(line, label, extraClass) {
        var block = el('div', 'say-block' + (extraClass ? ' ' + extraClass : ''));
        block.appendChild(el('p', 'step-label', label || 'Say this'));
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

      function contactList(step, phonesOnly) {
        var list = el('ul', 'contacts');
        (step.phones || []).forEach(function (p) {
          var li = el('li');
          var a = document.createElement('a');
          a.className = 'phone-link';
          a.href = window.SFA.telHref(p.phone);
          a.textContent = window.SFA.prettyPhone(p.phone);
          li.appendChild(a);
          li.appendChild(document.createTextNode(' ' + p.label + ' '));
          li.appendChild(window.SFA.phoneStateNode(window.SFA.findPhone(p.agency ? agenciesById[p.agency] : null, p.phone)));
          list.appendChild(li);
        });
        (phonesOnly ? [] : step.links || []).forEach(function (l) {
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
        var copy = data.copy.crisisBox;
        var box = el('section', 'crisis-box');
        box.setAttribute('aria-labelledby', 'crisis-title');
        var h3 = el('h3', null, copy.title);
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
        function stateNode(agencyId) {
          var record = phoneRecord(agencyId);
          return record ? window.SFA.phoneStateNode(record) : null;
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

        copy.items.forEach(function (entry) {
          item(entry.lead, entry.parts.map(function (part) {
            if (typeof part === 'string') return part;
            if (part.slot === 'tel') return telLink(entry.agency);
            if (part.slot === 'state') return stateNode(entry.agency);
            if (part.slot === 'site') return siteLink(entry.agency);
            if (part.slot === 'warning') {
              var warned = agenciesById[entry.agency];
              return warned && warned.warning ? ' ' + warned.warning : '';
            }
            if (part.slot === 'hours') {
              var record = phoneRecord(entry.agency);
              return record && record.hours ? ' (' + record.hours + ')' : '';
            }
            return null;
          }));
        });
        ul.appendChild(el('li', 'danger-line', copy.dangerLine.text));
        box.appendChild(ul);
        return box;
      }

      function privacyNote() {
        var p = el('p', 'privacy-print-note');
        p.textContent = 'Printed from Scam First Aid. Nothing you typed was sent anywhere. This guide is general information, not legal or financial advice.';
        return p;
      }

      // Paper shows each source once, in one list; screen keeps the per-block lines (print.css hides them).
      function printSources(root) {
        var seen = {};
        var list = el('ul');
        root.querySelectorAll('.source-line').forEach(function (line) {
          var stamp = line.textContent.match(/·\s*(reviewed\s+\S+)\s*$/);
          var links = Array.prototype.slice.call(line.querySelectorAll('a'));
          var entries = links.length
            ? links.map(function (a) { return { a: a, label: a.textContent }; })
            : [{ a: null, label: line.textContent.replace(/^Source:\s*/, '').replace(/\s*·.*$/, '') }];
          entries.forEach(function (e) {
            var key = (e.a ? e.a.href : '') + '|' + e.label + '|' + (stamp ? stamp[1] : '');
            if (!e.label || seen[key]) return;
            seen[key] = true;
            var li = el('li', null, stamp ? e.label + ' · ' + stamp[1] : e.label);
            if (e.a) li.appendChild(document.createTextNode(' (' + e.a.href + ')'));
            list.appendChild(li);
          });
        });
        if (!list.children.length) return null;
        var box = el('section', 'print-sources');
        box.appendChild(el('h3', null, stepsCatalog.printSources.title));
        box.appendChild(list);
        return box;
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

      // Sources show once per block, small, after the list; own-advice items keep their honest tag.
      function sourcedItem(item, sources) {
        var li = el('li');
        li.appendChild(el('span', null, item.text));
        li.appendChild(document.createTextNode(' '));
        if (item.phoneAgency && agenciesById[item.phoneAgency]) {
          (agenciesById[item.phoneAgency].phones || []).forEach(function (p) {
            li.appendChild(document.createTextNode(' '));
            var t = document.createElement('a');
            t.className = 'phone-link';
            t.href = window.SFA.telHref(p.number);
            t.textContent = window.SFA.prettyPhone(p.number);
            li.appendChild(t);
            li.appendChild(document.createTextNode(' '));
            li.appendChild(window.SFA.phoneStateNode(p));
          });
        }
        if (item.source) {
          var seen = sources.some(function (s) { return s.url === item.source.url; });
          if (!seen) sources.push(item.source);
        } else {
          li.appendChild(el('span', 'own-advice', 'Our own advice, not from an agency.'));
        }
        return li;
      }

      function blockSources(sources) {
        if (!sources.length) return null;
        var p = el('p', 'source-line');
        p.appendChild(document.createTextNode(sources.length > 1 ? 'Sources: ' : 'Source: '));
        sources.forEach(function (src, i) {
          if (i) p.appendChild(document.createTextNode(' · '));
          var a = document.createElement('a');
          a.href = src.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = src.title;
          p.appendChild(a);
        });
        return p;
      }

      function helperCardEl(collapsed) {
        var block = stepsCatalog.helperCard;
        if (!block || !block.items) return null;
        var root = document.createElement(collapsed ? 'details' : 'section');
        root.className = 'helper-card' + (collapsed ? ' helper-fold' : '');
        var body = root;
        if (collapsed) {
          root.appendChild(el('summary', null, block.foldTitle));
        } else {
          var h3 = el('h3', null, block.title);
          h3.id = 'helper-title';
          root.setAttribute('aria-labelledby', 'helper-title');
          root.appendChild(h3);
        }
        body.appendChild(el('p', null, block.intro));
        var ul = el('ul', 'helper-items');
        var sources = [];
        block.items.forEach(function (item) {
          ul.appendChild(sourcedItem(item, sources));
        });
        body.appendChild(ul);
        var srcLine = blockSources(sources);
        if (srcLine) body.appendChild(srcLine);
        body.appendChild(el('h4', 'helper-dir-title', block.directoryTitle));
        var dir = el('ul', 'helper-directory');
        (block.directory || []).forEach(function (id) {
          var agency = agenciesById[id];
          if (!agency) return;
          var li = el('li');
          li.appendChild(el('strong', null, agency.name));
          (agency.urls || []).forEach(function (u) {
            li.appendChild(document.createTextNode(' '));
            var a = document.createElement('a');
            a.href = u.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = u.label;
            li.appendChild(a);
          });
          (agency.phones || []).forEach(function (p) {
            li.appendChild(document.createTextNode(' '));
            var t = document.createElement('a');
            t.className = 'phone-link';
            t.href = window.SFA.telHref(p.number);
            t.textContent = window.SFA.prettyPhone(p.number);
            li.appendChild(t);
            if (p.hours) li.appendChild(document.createTextNode(' (' + p.hours + ')'));
            li.appendChild(document.createTextNode(' '));
            li.appendChild(window.SFA.phoneStateNode(p));
          });
          if (agency.warning) li.appendChild(document.createTextNode(' ' + agency.warning));
          dir.appendChild(li);
        });
        body.appendChild(dir);
        return root;
      }

      function conversationSituation() {
        var tags = collectTags();
        function has(prefix) {
          return tags.some(function (t) {
            return t.indexOf(prefix) === 0 && t !== 'money_none';
          });
        }
        if (tags.indexOf('contact_ongoing') !== -1) return 'ongoing';
        if (has('money_') || has('info_') || has('id_')) return 'lost';
        return null;
      }

      function wordsHref(situation) {
        return 'family.html' + (situation ? '#situation=' + situation : '');
      }

      function wordsJump() {
        var block = stepsCatalog.helperWords;
        if (!block) return null;
        var p = el('p', 'helper-jump');
        var a = el('a', null, block.jumpLabel);
        a.href = '#helper-words';
        p.appendChild(a);
        return p;
      }

      function wordsBlock() {
        var block = stepsCatalog.helperWords;
        if (!block) return null;
        var situation = conversationSituation();
        var sec = el('section', 'helper-words');
        sec.setAttribute('aria-labelledby', 'helper-words');
        var h3 = el('h3', null, block.title);
        h3.id = 'helper-words';
        h3.setAttribute('tabindex', '-1');
        sec.appendChild(h3);
        sec.appendChild(el('p', null, block.intro));
        var chosen = situation ? block.cases[situation] : null;
        var scenario = null;
        if (chosen) {
          data.familyGuide.scenarios.forEach(function (sc) {
            if (sc.id === chosen.scenario) scenario = sc;
          });
        }
        if (scenario) {
          scenario.lines.slice(0, chosen.lines).forEach(function (line) {
            sec.appendChild(sayBlock(line, 'You can say'));
          });
        }
        var link = el('a', 'btn', block.linkLabel);
        link.href = wordsHref(situation);
        sec.appendChild(link);
        sec.appendChild(el('p', 'step-note', block.linkNote));
        return sec;
      }

      function stillInContact() {
        return collectTags().indexOf('contact_ongoing') !== -1;
      }

      function denialBlock() {
        var block = stepsCatalog.helperDenial;
        if (!block || !stillInContact()) return null;
        var sec = el('section', 'helper-denial');
        sec.setAttribute('aria-labelledby', 'helper-denial');
        var h3 = el('h3', null, block.title);
        h3.id = 'helper-denial';
        sec.appendChild(h3);
        sec.appendChild(el('p', null, block.intro));
        data.familyGuide.scenarios.forEach(function (sc) {
          if (sc.id !== block.scenario) return;
          sc.lines.slice(0, block.lines).forEach(function (line) {
            sec.appendChild(sayBlock(line, 'You can say'));
          });
        });
        var link = el('a', 'btn', block.linkLabel);
        link.href = 'family.html#scenario=' + block.scenario;
        sec.appendChild(link);
        sec.appendChild(el('p', 'step-note', block.linkNote));
        sec.appendChild(el('h4', 'helper-dir-title', block.aloneTitle));
        var ul = el('ul', 'helper-items');
        var sources = [];
        block.alone.forEach(function (item) {
          ul.appendChild(sourcedItem(item, sources));
        });
        sec.appendChild(ul);
        var srcLine = blockSources(sources);
        if (srcLine) sec.appendChild(srcLine);
        if (data.familyGuide.hardLine) sec.appendChild(sayBlock(data.familyGuide.hardLine, block.hardLineLabel));
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
        var nowRec = agenciesById['lifeline-988'] ? window.SFA.findPhone(agenciesById['lifeline-988'], '988') : null;
        crisis.appendChild(window.SFA.phoneStateNode(nowRec));
        ul.appendChild(crisis);
        sec.appendChild(ul);
        return sec;
      }

      // Who-to-call side column (CSS shows it at 64rem and wider): phones and helper line of the current step, from the same step data.
      function sideHasContent(s) {
        return !!((s.phones && s.phones.length) || (s.helper && s.helper.say && s.helper.say.length));
      }

      function clearSide() {
        if (!sideRoot) return;
        sideRoot.hidden = true;
        sideRoot.innerHTML = '';
        sideSteps = [];
        sideCurrentId = null;
      }

      function renderSide() {
        if (!sideRoot) return;
        var currentIndex = -1;
        sideSteps.forEach(function (s, i) {
          if (s.id === sideCurrentId) currentIndex = i;
        });
        var open = sideSteps.filter(function (s) {
          return !state.checked[s.id];
        });
        var pick = null;
        open.forEach(function (s) {
          if (!pick && sideSteps.indexOf(s) >= currentIndex) pick = s;
        });
        if (!pick) pick = open[0] || null;
        if (pick) sideCurrentId = pick.id;
        sideRoot.innerHTML = '';
        if (!pick) {
          sideRoot.hidden = true;
          return;
        }
        var h3 = el('h3', null, stepsCatalog.sideColumn.title);
        h3.id = 'plan-side-title';
        sideRoot.appendChild(h3);
        sideRoot.appendChild(el('h4', null, pick.title));
        var contacts = contactList(pick, true);
        if (contacts) sideRoot.appendChild(contacts);
        var mode = helperMode();
        var labels = stepsCatalog.helperLabels;
        ((pick.helper && pick.helper.say) || []).forEach(function (line) {
          sideRoot.appendChild(sayBlock(line, mode === 'helper' ? labels.say : 'If you are the helper, you say:', 'say-helper'));
        });
        sideRoot.hidden = false;
      }

      function stepCard(s, number) {
        var card = el('article', 'step-card');
        card.dataset.stepId = s.id;
        if (state.checked[s.id]) card.classList.add('is-done');

        card.addEventListener('focusin', function () {
          if (sideHasContent(s) && sideCurrentId !== s.id) {
            sideCurrentId = s.id;
            renderSide();
          }
        });

        var head = el('div', 'step-head');
        head.appendChild(el('span', 'step-number', number + '.'));
        head.appendChild(el('h4', null, s.title));
        head.appendChild(el('span', 'badge badge-' + s.tier, tierLabel[s.tier] || s.tier));
        card.appendChild(head);

        var what = el('p');
        what.appendChild(el('span', 'step-label', 'What: '));
        what.appendChild(document.createTextNode(s.what));
        card.appendChild(what);

        var why = el('p', 'step-why');
        why.appendChild(el('span', 'step-label', 'Why: '));
        why.appendChild(document.createTextNode(s.why));
        card.appendChild(why);

        var mode = helperMode();
        (s.say || []).forEach(function (line) {
          var label = mode === 'helper' ? 'Your relative says' : mode === 'both' ? 'The person who was scammed says:' : 'Say this';
          card.appendChild(sayBlock(line, label));
        });
        if (mode !== 'me' && s.helper) {
          var labels = stepsCatalog.helperLabels;
          [['say', 'You say (the helper)', 'If you are the helper, you say:'],
            ['withThem', labels.withThem, 'If you are the helper and they are with you or on the call:'],
            ['cannotJoin', labels.cannotJoin, 'If you are the helper and they cannot join right now:']
          ].forEach(function (group) {
            (s.helper[group[0]] || []).forEach(function (line) {
              var label = mode === 'helper' ? (group[0] === 'say' ? labels.say : group[1]) : group[2];
              card.appendChild(sayBlock(line, label, group[0] === 'say' ? 'say-helper say-mine' : 'say-helper'));
            });
          });
        }

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
          renderSide();
          window.SFA.announce(cb.checked ? s.title + ' marked done.' : s.title + ' unmarked.');
        });
        done.appendChild(cb);
        done.appendChild(document.createTextNode(' Done'));
        card.appendChild(done);

        return card;
      }

      // Start over sits at the end of the plan and asks in the page, not with a browser pop-up.
      // "Keep my plan" is the safe default: it takes focus, and Escape picks it.
      function startOverBlock() {
        var copy = data.copy.startOver.plan;
        var wrap = el('div', 'plan-end no-print');
        var open = el('button', 'btn', copy.button);
        open.type = 'button';
        open.setAttribute('aria-expanded', 'false');
        open.setAttribute('aria-controls', 'start-over-confirm');
        wrap.appendChild(open);

        var ask = el('div', 'confirm');
        ask.id = 'start-over-confirm';
        ask.hidden = true;
        ask.setAttribute('role', 'group');
        ask.setAttribute('aria-label', copy.button);
        ask.appendChild(el('p', null, copy.prompt));
        var row = el('div', 'plan-actions');
        var keep = el('button', 'btn primary', copy.keep);
        keep.type = 'button';
        var go = el('button', 'btn', copy.confirm);
        go.type = 'button';
        row.appendChild(keep);
        row.appendChild(go);
        ask.appendChild(row);
        wrap.appendChild(ask);

        function close() {
          ask.hidden = true;
          open.setAttribute('aria-expanded', 'false');
          open.focus();
        }
        open.addEventListener('click', function () {
          ask.hidden = false;
          open.setAttribute('aria-expanded', 'true');
          keep.focus();
        });
        keep.addEventListener('click', close);
        ask.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') close();
        });
        go.addEventListener('click', function () {
          storage.clear();
          state = freshState();
          planRoot.innerHTML = '';
          planRoot.hidden = true;
          clearSide();
          render();
        });
        return wrap;
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

        var mode = helperMode();
        document.body.classList.toggle('plan-helper', mode !== 'me');
        var lede = 'Work top to bottom. Each step tells you what to do, why it matters, and what to say.';
        if (mode === 'helper' && stepsCatalog.helperLede) lede = stepsCatalog.helperLede;
        planRoot.appendChild(el('p', 'lede', lede));

        function recap() {
          var summaryWrap = el('div', 'summary-wrap');
          summaryWrap.appendChild(el('p', 'step-label', 'Your answers'));
          var chips = el('ul', 'summary-chips');
          flow.questions.forEach(function (q) {
            (state.answers[q.id] || []).forEach(function (pid) {
              var o = optionFor(q, pid);
              if (!o) return;
              chips.appendChild(el('li', 'chip', (q.chipLabel ? q.chipLabel + ': ' : '') + o.label));
            });
          });
          summaryWrap.appendChild(chips);
          return summaryWrap;
        }

        // Helper plans put the first steps above the helper extras, so the first action is on the first screen.
        var extras = [];
        if (mode !== 'me') {
          var jump = wordsJump();
          if (jump) planRoot.appendChild(jump);
          var words = wordsBlock();
          if (words) extras.push(words);
          var denial = mode === 'helper' ? denialBlock() : null;
          if (denial) extras.push(denial);
          var helperCard = helperCardEl(mode === 'both');
          if (helperCard) extras.push(helperCard);
        }
        var evidence = evidenceBox();
        if (evidence) extras.push(evidence);
        extras.push(recap());
        if (mode === 'me') extras.forEach(function (node) {
          planRoot.appendChild(node);
        });

        var listWrap = el('div', 'plan-list-wrap');
        var currentTier = null;
        var currentOl = null;
        var stepNumber = 1;
        var extrasPlaced = mode === 'me';
        steps.forEach(function (s) {
          if (s.tier !== currentTier) {
            if (!extrasPlaced && currentTier !== null) {
              extras.forEach(function (node) {
                listWrap.appendChild(node);
              });
              extrasPlaced = true;
            }
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
        if (!extrasPlaced) {
          extras.forEach(function (node) {
            listWrap.appendChild(node);
          });
        }
        planRoot.appendChild(listWrap);
        planRoot.appendChild(crisisBox());
        var sources = printSources(planRoot);
        if (sources) planRoot.appendChild(sources);
        planRoot.appendChild(privacyNote());
        planRoot.appendChild(walletCard());
        planRoot.appendChild(startOverBlock());

        sideSteps = mode === 'me' ? [] : steps.filter(sideHasContent);
        sideCurrentId = null;
        if (sideSteps.length) renderSide();
        else clearSide();

        var focusTarget = planRoot.querySelector('#plan-title');
        if (focusTarget) focusTarget.focus();
        window.SFA.announce('Your action plan is ready with ' + steps.length + ' steps.');
      }

      function renderQuestion() {
        document.body.classList.remove('plan-shown', 'plan-helper');
        planRoot.hidden = true;
        planRoot.innerHTML = '';
        clearSide();
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
