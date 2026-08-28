(() => {
  'use strict';

  const STORAGE_KEY = 'roleta_itens';
  const HISTORY_KEY = 'roleta_historico';
  const TAU = Math.PI * 2;
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  let items = loadItems();
  let wheelEntries = [];
  let rotation = 0;
  let spinning = false;
  let selectedId = null;
  let history = loadHistory();

  function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function loadItems() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!Array.isArray(saved)) return [];
      return saved.filter(item => item && item.id && item.texto && ['tarefa', 'recompensa'].includes(item.tipo)).map(item => ({
        id: String(item.id), texto: String(item.texto), tipo: item.tipo,
        peso: Math.max(0, Math.floor(Number(item.peso) || 0)),
        concluido: Boolean(item.concluido), criadoEm: item.criadoEm || new Date().toISOString()
      }));
    } catch { return []; }
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
      if (saved?.dia !== todayKey()) return { dia: todayKey(), ultimoTipo: null, tarefasSeguidas: 0 };
      return {
        dia: saved.dia,
        ultimoTipo: ['tarefa', 'recompensa'].includes(saved?.ultimoTipo) ? saved.ultimoTipo : null,
        tarefasSeguidas: Math.max(0, Math.min(3, Math.floor(Number(saved?.tarefasSeguidas) || 0)))
      };
    } catch { return { dia: todayKey(), ultimoTipo: null, tarefasSeguidas: 0 }; }
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
  function saveHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  function parseLines(value) {
    return value.split(/\r?\n/).map(line => line.trim().replace(/^(?:(?:[-*•–—]+)|(?:\d+[.)]))\s*/, '').trim()).filter(Boolean);
  }

  function addItems(text, tipo) {
    const created = parseLines(text).map(texto => ({ id: makeId(), texto, tipo, peso: 1, concluido: false, criadoEm: new Date().toISOString() }));
    if (!created.length) return false;
    items.push(...created); save(); render(); return true;
  }

  function distribute(active) {
    const tasks = active.filter(i => i.tipo === 'tarefa');
    const rewards = active.filter(i => i.tipo === 'recompensa');
    if (!tasks.length || !rewards.length) return [...tasks, ...rewards];
    if (tasks.length >= rewards.length) {
      const rewardSlots = new Map();
      rewards.forEach((reward, index) => {
        const slot = Math.floor(index * tasks.length / rewards.length);
        rewardSlots.set(slot, reward);
      });
      return tasks.flatMap((task, index) => rewardSlots.has(index) ? [task, rewardSlots.get(index)] : [task]);
    }
    const result = [], gaps = Array.from({ length: tasks.length + 1 }, () => []);
    rewards.forEach((reward, index) => gaps[Math.floor(index * gaps.length / rewards.length)].push(reward));
    tasks.forEach((task, index) => { result.push(...gaps[index], task); });
    result.push(...gaps[gaps.length - 1]);
    return result;
  }

  function buildWheelEntries() {
    const ordered = distribute(items.filter(item => !item.concluido && item.peso > 0));
    const total = ordered.reduce((sum, item) => sum + item.peso, 0);
    let cursor = -Math.PI / 2;
    wheelEntries = ordered.map(item => {
      const angle = total ? TAU * item.peso / total : 0;
      const entry = { item, start: cursor, end: cursor + angle, center: cursor + angle / 2 };
      cursor += angle;
      return entry;
    });
  }

  function drawWheel() {
    buildWheelEntries();
    const size = canvas.width, center = size / 2, radius = center - 12;
    ctx.clearRect(0, 0, size, size);
    if (!wheelEntries.length) {
      ctx.beginPath(); ctx.arc(center, center, radius, 0, TAU); ctx.fillStyle = '#252525'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.fillStyle = '#b8b8b8'; ctx.font = '600 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Sua roleta está vazia', center, center);
      return;
    }
    wheelEntries.forEach((entry, index) => {
      const { item, start, end, center: angle } = entry;
      const palette = item.tipo === 'tarefa' ? ['#7fbd5c', '#9fd67d', '#b9e49e'] : ['#db7600', '#ff9400', '#ffad3d'];
      ctx.beginPath(); ctx.moveTo(center, center); ctx.arc(center, center, radius, start, end); ctx.closePath();
      ctx.fillStyle = palette[index % palette.length]; ctx.fill();
      ctx.strokeStyle = '#191919'; ctx.lineWidth = 5; ctx.stroke();
      const slice = end - start;
      if (slice > .06) {
        ctx.save(); ctx.translate(center, center); ctx.rotate(angle);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.font = `700 ${slice < .18 ? 18 : slice < .32 ? 22 : 27}px system-ui`;
        const maxChars = slice < .18 ? 11 : slice < .32 ? 16 : 23;
        const label = item.texto.length > maxChars ? `${item.texto.slice(0, maxChars - 1)}…` : item.texto;
        ctx.shadowColor = '#0008'; ctx.shadowBlur = 5; ctx.fillText(label, radius - 28, 0); ctx.restore();
      }
    });
    ctx.beginPath(); ctx.arc(center, center, 48, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(center, center, 27, 0, TAU); ctx.fillStyle = '#ff606d'; ctx.fill();
  }

  function renderList(tipo, targetSelector, countSelector) {
    const target = $(targetSelector), filtered = items.filter(item => item.tipo === tipo);
    $(countSelector).textContent = filtered.length;
    target.innerHTML = '';
    if (!filtered.length) { const empty = document.createElement('div'); empty.className = 'empty-list'; empty.textContent = tipo === 'tarefa' ? 'Nenhuma tarefa ainda.' : 'Nenhuma recompensa ainda.'; target.append(empty); return; }
    filtered.forEach(item => {
      const row = document.createElement('div'); row.className = `item ${item.concluido ? 'done' : ''} ${tipo === 'recompensa' ? 'reward-list-item' : ''}`; row.dataset.id = item.id;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = item.concluido; checkbox.title = item.concluido ? 'Reativar item' : 'Marcar como concluído'; checkbox.setAttribute('aria-label', checkbox.title); checkbox.dataset.action = 'toggle';
      const text = document.createElement('span'); text.className = 'item-text'; text.textContent = item.texto;
      const weight = document.createElement('div'); weight.className = 'weight'; weight.innerHTML = `<button type="button" data-action="minus" aria-label="Diminuir peso">−</button><output aria-label="Peso">${item.peso}</output><button type="button" data-action="plus" aria-label="Aumentar peso">+</button>`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.dataset.action = 'remove'; remove.title = 'Excluir permanentemente'; remove.setAttribute('aria-label', `Excluir ${item.texto}`); remove.textContent = '×';
      row.append(checkbox, text, weight, remove); target.append(row);
    });
  }

  function render() {
    renderList('tarefa', '#task-list', '#task-count'); renderList('recompensa', '#reward-list', '#reward-count');
    $('#item-count').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    drawWheel();
    const empty = wheelEntries.length === 0;
    const options = getSpinOptions();
    const blockedByRule = !empty && options.eligible.length === 0;
    $('#wheel-empty').hidden = !empty;
    $('#spin-rule').textContent = empty ? '' : options.message;
    $('#spin-rule').classList.toggle('warning', blockedByRule);
    $('#spin').hidden = Boolean(selectedId);
    $('#spin').disabled = empty || blockedByRule || spinning;
    $('#spin-again').disabled = blockedByRule || spinning;
    $('#complete-result').disabled = spinning;
    if (selectedId && !items.some(i => i.id === selectedId)) hideResult();
  }

  function hideResult() { selectedId = null; $('#result').hidden = true; }

  function getSpinOptions() {
    if (history.dia !== todayKey()) {
      history = { dia: todayKey(), ultimoTipo: null, tarefasSeguidas: 0 };
      saveHistory();
    }
    const active = items.filter(item => !item.concluido && item.peso > 0);
    const tasks = active.filter(item => item.tipo === 'tarefa');
    const rewards = active.filter(item => item.tipo === 'recompensa');
    if (!history.ultimoTipo) {
      return tasks.length
        ? { eligible: tasks, message: 'O primeiro sorteio do dia será uma tarefa.' }
        : { eligible: [], message: 'Adicione ou reative uma tarefa para iniciar o dia.' };
    }
    if (history.ultimoTipo === 'recompensa') {
      return tasks.length
        ? { eligible: tasks, message: 'A última foi uma recompensa: agora será sorteada uma tarefa.' }
        : { eligible: [], message: 'Adicione ou reative uma tarefa para evitar duas recompensas seguidas.' };
    }
    if (history.tarefasSeguidas >= 3) {
      return rewards.length
        ? { eligible: rewards, message: 'Três tarefas concluíram a sequência: a próxima será uma recompensa.' }
        : { eligible: [], message: 'Adicione ou reative uma recompensa para continuar após três tarefas.' };
    }
    return { eligible: active, message: `${history.tarefasSeguidas}/3 tarefas desde a última recompensa.` };
  }

  function registerResult(item) {
    if (item.tipo === 'recompensa') history = { dia: todayKey(), ultimoTipo: 'recompensa', tarefasSeguidas: 0 };
    else history = { dia: todayKey(), ultimoTipo: 'tarefa', tarefasSeguidas: Math.min(3, history.tarefasSeguidas + 1) };
    saveHistory();
  }

  function spin() {
    if (spinning || !wheelEntries.length) return;
    const options = getSpinOptions();
    if (!options.eligible.length) { render(); return; }
    hideResult(); spinning = true; $('#spin').disabled = true;
    render();
    const eligibleIds = new Set(options.eligible.map(item => item.id));
    const eligibleEntries = wheelEntries.filter(entry => eligibleIds.has(entry.item.id));
    const total = eligibleEntries.reduce((sum, entry) => sum + entry.item.peso, 0);
    let ticket = Math.random() * total, winner;
    for (const entry of eligibleEntries) { ticket -= entry.item.peso; if (ticket < 0) { winner = entry; break; } }
    winner ||= eligibleEntries[eligibleEntries.length - 1];
    const jitter = (Math.random() - .5) * (winner.end - winner.start) * .55;
    const normalized = ((rotation % TAU) + TAU) % TAU;
    const targetNormalized = ((-Math.PI / 2 - winner.center - jitter) % TAU + TAU) % TAU;
    rotation += (TAU * 6) + ((targetNormalized - normalized + TAU) % TAU);
    canvas.style.transform = `rotate(${rotation}rad)`;
    const finish = () => {
      spinning = false; selectedId = winner.item.id;
      registerResult(winner.item);
      $('#result-type').textContent = winner.item.tipo; $('#result-text').textContent = winner.item.texto; $('#result').hidden = false;
      render(); $('#result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    setTimeout(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 5050);
  }

  function handleListAction(event) {
    const action = event.target.dataset.action; if (!action) return;
    const row = event.target.closest('.item'), item = items.find(i => i.id === row?.dataset.id); if (!item) return;
    if (action === 'minus') item.peso = Math.max(0, item.peso - 1);
    if (action === 'plus') item.peso += 1;
    if (action === 'toggle') item.concluido = event.target.checked;
    if (action === 'remove') items = items.filter(i => i.id !== item.id);
    save(); render();
  }

  $('#task-form').addEventListener('submit', event => { event.preventDefault(); if (addItems($('#task-input').value, 'tarefa')) $('#task-input').value = ''; });
  $('#reward-form').addEventListener('submit', event => { event.preventDefault(); if (addItems($('#reward-input').value, 'recompensa')) $('#reward-input').value = ''; });
  $('#task-list').addEventListener('click', handleListAction); $('#reward-list').addEventListener('click', handleListAction);
  $('#spin').addEventListener('click', spin); $('#spin-again').addEventListener('click', spin);
  $('#complete-result').addEventListener('click', () => { const item = items.find(i => i.id === selectedId); if (item) { item.concluido = true; save(); hideResult(); render(); } });
  render();
})();
