const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) node.append(child);
  return node;
};

const STORAGE_KEY = 'postai:networks';
const ICON = { ok: '✅', error: '❌', 'dry-run': '🧪' };

const state = { networks: [], selected: new Set(), image: null };

function remembered(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return defaults;
}

function remember() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected])); } catch {}
}

function textFor(id) {
  if ($('#customize').checked) {
    const field = document.querySelector(`[data-override="${id}"]`);
    if (field) return field.value;
  }
  return $('#text').value;
}

function renderNetworks() {
  const box = $('#networks');
  box.replaceChildren(
    ...state.networks.map((n) => {
      const input = el('input', { type: 'checkbox', checked: state.selected.has(n.id) });
      input.addEventListener('change', () => {
        input.checked ? state.selected.add(n.id) : state.selected.delete(n.id);
        remember();
        renderOverrides();
        update();
      });
      return el('label', { className: 'chip' }, [input, n.label, el('span', { className: 'count', dataset: { count: n.id } })]);
    }),
  );
}

function renderOverrides() {
  const box = $('#overrides');
  box.hidden = !$('#customize').checked;
  if (box.hidden) return;
  const current = Object.fromEntries([...box.querySelectorAll('textarea')].map((t) => [t.dataset.override, t.value]));
  box.replaceChildren(
    ...state.networks
      .filter((n) => state.selected.has(n.id))
      .map((n) => {
        const area = el('textarea', { rows: 3, value: current[n.id] ?? $('#text').value, dataset: { override: n.id } });
        area.addEventListener('input', update);
        return el('div', {}, [el('label', { textContent: n.label }), area]);
      }),
  );
}

function update() {
  const warnings = [];
  let blocking = state.selected.size === 0;
  if (blocking) warnings.push(['error', 'Escolha pelo menos uma rede.']);

  for (const n of state.networks) {
    const count = document.querySelector(`[data-count="${n.id}"]`);
    const length = textFor(n.id).length;
    count.textContent = `${length}/${n.limit}`;
    count.classList.toggle('over', length > n.limit);
    if (!state.selected.has(n.id)) continue;
    if (length > n.limit) {
      blocking = true;
      warnings.push(['error', `${n.label}: passou ${length - n.limit} caracteres do limite.`]);
    }
    if (!textFor(n.id).trim() && !state.image) {
      blocking = true;
      warnings.push(['error', `${n.label}: o post está vazio.`]);
    }
    if (n.requiresImage && !state.image && textFor(n.id).trim()) {
      warnings.push(['warn', `${n.label} não aceita só texto: vou gerar uma imagem com o texto.`]);
    }
  }

  $('#warnings').replaceChildren(...warnings.map(([kind, text]) => el('li', { className: kind, textContent: text })));
  $('#submit').disabled = blocking;
  $('#submit').textContent = $('#dryRun').checked ? 'Simular' : 'Publicar';
}

function setImage(file) {
  state.image = file;
  $('#preview').hidden = !file;
  if (file) $('#preview img').src = URL.createObjectURL(file);
  else $('#image').value = '';
  update();
}

function resultRow(id) {
  const label = state.networks.find((n) => n.id === id)?.label ?? id;
  return el('li', { dataset: { result: id } }, [
    el('span', { className: 'name', textContent: `⏳ ${label}` }),
    el('span', { className: 'detail', textContent: 'aguardando' }),
  ]);
}

function showResult(result) {
  const row = document.querySelector(`[data-result="${result.network}"]`);
  const label = state.networks.find((n) => n.id === result.network)?.label ?? result.network;
  row.querySelector('.name').textContent = `${ICON[result.status]} ${label}`;
  const detail = row.querySelector('.detail');
  detail.replaceChildren();
  if (result.url) detail.append(el('a', { href: result.url, target: '_blank', rel: 'noopener', textContent: result.url }));
  if (result.note) detail.append(` ${result.note}`);
  if (result.error) {
    detail.append(el('span', { className: 'error', textContent: result.error }));
    if (result.screenshot) detail.append(el('div', { textContent: `print: ${result.screenshot}` }));
  }
}

async function submit(event) {
  event.preventDefault();
  const form = new FormData();
  form.append('text', $('#text').value);
  for (const id of state.selected) form.append('networks', id);
  if (state.image) form.append('image', state.image);
  if ($('#customize').checked) {
    const overrides = {};
    for (const id of state.selected) overrides[id] = textFor(id);
    form.append('overrides', JSON.stringify(overrides));
  }
  form.append('dryRun', String($('#dryRun').checked));

  $('#submit').disabled = true;
  const response = await fetch('/api/posts', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) {
    $('#warnings').replaceChildren(...data.problems.map((p) => el('li', { className: 'error', textContent: p })));
    $('#submit').disabled = false;
    return;
  }

  $('#progress').hidden = false;
  $('#results').replaceChildren(...[...state.selected].map(resultRow));
  const events = new EventSource(`/api/posts/${data.id}/events`);
  events.onmessage = (message) => {
    const event = JSON.parse(message.data);
    const row = event.network && document.querySelector(`[data-result="${event.network}"] .detail`);
    if (event.type === 'start' && row) row.textContent = 'publicando…';
    if (event.type === 'log' && row) row.textContent = `${event.message}…`;
    if (event.type === 'result') showResult(event.result);
    if (event.type === 'finish') {
      events.close();
      update();
      loadHistory();
      const failed = event.record.results.some((r) => r.status === 'error');
      if (!failed && !event.record.dryRun) {
        $('#text').value = '';
        setImage(null);
        renderOverrides();
        update();
      }
    }
  };
}

async function loadHistory() {
  const history = await fetch('/api/history').then((r) => r.json());
  const label = (id) => state.networks.find((n) => n.id === id)?.label ?? id;
  $('#history').replaceChildren(
    ...(history.length
      ? history.map((record) =>
          el('li', {}, [
            el('div', {
              className: 'meta',
              textContent: `${new Date(record.createdAt).toLocaleString()}${record.dryRun ? ' · simulação' : ''}`,
            }),
            el('div', { className: 'text', textContent: record.text }),
            el(
              'div',
              { className: 'links' },
              record.results.map((r) =>
                r.url
                  ? el('a', { href: r.url, target: '_blank', rel: 'noopener', textContent: `${ICON[r.status]} ${label(r.network)}` })
                  : el('span', { textContent: `${ICON[r.status]} ${label(r.network)}`, title: r.error ?? r.note ?? '' }),
              ),
            ),
          ]),
        )
      : [el('li', { className: 'muted', textContent: 'Nada publicado ainda.' })]),
  );
}

async function init() {
  const data = await fetch('/api/networks').then((r) => r.json());
  state.networks = data.networks;
  const ids = new Set(state.networks.map((n) => n.id));
  state.selected = new Set(remembered(data.defaults).filter((id) => ids.has(id)));
  renderNetworks();

  $('#text').addEventListener('input', update);
  $('#dryRun').addEventListener('change', update);
  $('#customize').addEventListener('change', () => { renderOverrides(); update(); });
  $('#image').addEventListener('change', (e) => setImage(e.target.files[0] ?? null));
  $('#removeImage').addEventListener('click', () => setImage(null));
  $('#composer').addEventListener('submit', submit);
  document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file) setImage(file);
  });

  update();
  loadHistory();
}

init();
