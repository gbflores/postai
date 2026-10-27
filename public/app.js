const $ = (s) => document.querySelector(s);

/** Cria um elemento. `dataset` e `className` são tratados à parte (dataset não pode ser atribuído direto). */
const el = (tag, { dataset, ...props } = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
};

const STORAGE_KEY = 'postai:networks';
const ICON = { ok: '✅', error: '❌', 'dry-run': '🧪' };

const state = { networks: [], selected: new Set(), image: null, busy: false };
const labelOf = (id) => state.networks.find((n) => n.id === id)?.label ?? id;

function remembered(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
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
  $('#networks').replaceChildren(
    ...state.networks.map((n) => {
      const input = el('input', { type: 'checkbox', checked: state.selected.has(n.id) });
      input.addEventListener('change', () => {
        input.checked ? state.selected.add(n.id) : state.selected.delete(n.id);
        remember();
        renderOverrides();
        update();
      });
      return el('label', { className: 'chip', dataset: { net: n.id } }, [
        input,
        el('span', { className: 'dot', textContent: '✓', ariaHidden: 'true' }),
        el('span', { className: 'name', textContent: n.label }),
        el('span', { className: 'count', dataset: { count: n.id } }),
      ]);
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
        const id = `override-${n.id}`;
        const area = el('textarea', { id, rows: 3, value: current[n.id] ?? $('#text').value, dataset: { override: n.id } });
        area.addEventListener('input', update);
        return el('div', {}, [el('label', { htmlFor: id, textContent: n.label }), area]);
      }),
  );
}

function update() {
  const warnings = [];
  let blocking = state.selected.size === 0;
  if (blocking) warnings.push(['error', 'Escolha pelo menos uma rede.']);

  for (const n of state.networks) {
    const text = textFor(n.id);
    const count = document.querySelector(`[data-count="${n.id}"]`);
    count.textContent = `${text.length}/${n.limit}`;
    count.classList.toggle('over', text.length > n.limit);
    if (!state.selected.has(n.id)) continue;
    if (text.length > n.limit) {
      blocking = true;
      warnings.push(['error', `${n.label}: ${text.length - n.limit} caracteres acima do limite.`]);
    }
    if (!text.trim() && !state.image) blocking = true;
    if (n.requiresImage && !state.image && text.trim()) {
      warnings.push(['warn', `${n.label} não aceita só texto: vou gerar uma imagem com o texto.`]);
    }
  }

  $('#warnings').replaceChildren(...warnings.map(([kind, text]) => el('li', { className: kind, textContent: text })));
  const button = $('#submit');
  button.disabled = blocking || state.busy;
  button.classList.toggle('busy', state.busy);
  button.textContent = state.busy ? 'Enviando…' : $('#dryRun').checked ? 'Simular' : 'Publicar';
}

function setImage(file) {
  state.image = file;
  const preview = $('#preview');
  preview.hidden = !file;
  if (file) preview.querySelector('img').src = URL.createObjectURL(file);
  else $('#image').value = '';
  update();
}

function resultRow(id) {
  return el('li', { dataset: { result: id } }, [
    el('span', { className: 'icon' }, el('span', { className: 'spinner' })),
    el('span', { className: 'name', textContent: labelOf(id) }),
    el('span', { className: 'detail', textContent: 'na fila' }),
  ]);
}

function showResult(result) {
  const row = document.querySelector(`[data-result="${result.network}"]`);
  row.querySelector('.icon').textContent = ICON[result.status];
  const detail = row.querySelector('.detail');
  detail.replaceChildren();
  if (result.url) detail.append(el('a', { href: result.url, target: '_blank', rel: 'noopener', textContent: result.url }));
  if (result.note) detail.append(` ${result.note}`);
  if (result.error) {
    detail.append(el('span', { className: 'error', textContent: result.error }));
    if (result.screenshot) detail.append(el('div', { className: 'small', textContent: `print: ${result.screenshot}` }));
  }
}

async function submit(event) {
  event.preventDefault();
  if (state.busy) return;
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

  state.busy = true;
  update();
  const response = await fetch('/api/posts', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) {
    state.busy = false;
    update();
    $('#warnings').replaceChildren(...data.problems.map((p) => el('li', { className: 'error', textContent: p })));
    return;
  }

  $('#progress').hidden = false;
  $('#results').replaceChildren(...[...state.selected].map(resultRow));
  $('#progress').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const events = new EventSource(`/api/posts/${data.id}/events`);
  events.onmessage = (message) => {
    const ev = JSON.parse(message.data);
    const detail = ev.network && document.querySelector(`[data-result="${ev.network}"] .detail`);
    if (ev.type === 'start' && detail) detail.textContent = 'publicando…';
    if (ev.type === 'log' && detail) detail.textContent = `${ev.message}…`;
    if (ev.type === 'result') showResult(ev.result);
    if (ev.type === 'finish') {
      events.close();
      state.busy = false;
      const failed = ev.record.results.some((r) => r.status === 'error');
      if (!failed && !ev.record.dryRun) {
        $('#text').value = '';
        setImage(null);
        renderOverrides();
      }
      update();
      loadHistory();
    }
  };
  events.onerror = () => {
    events.close();
    state.busy = false;
    update();
  };
}

async function loadHistory() {
  const history = await fetch('/api/history').then((r) => r.json());
  $('#history').replaceChildren(
    ...(history.length
      ? history.map((record) =>
          el('li', {}, [
            el('div', {
              className: 'meta',
              textContent: `${new Date(record.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${record.dryRun ? ' · simulação' : ''}`,
            }),
            el('div', { className: 'text', textContent: record.text }),
            el(
              'div',
              { className: 'links' },
              record.results.map((r) =>
                r.url
                  ? el('a', { href: r.url, target: '_blank', rel: 'noopener', textContent: `${ICON[r.status]} ${labelOf(r.network)}` })
                  : el('span', { textContent: `${ICON[r.status]} ${labelOf(r.network)}`, title: r.error ?? r.note ?? '' }),
              ),
            ),
          ]),
        )
      : [el('li', { className: 'muted', textContent: 'Nada publicado ainda.' })]),
  );
}

function setupImageInputs() {
  $('#image').addEventListener('change', (e) => setImage(e.target.files[0] ?? null));
  $('#removeImage').addEventListener('click', () => setImage(null));
  document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file) setImage(file);
  });
  const zone = $('#dropzone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) setImage(file);
  });
}

async function init() {
  const data = await fetch('/api/networks').then((r) => r.json());
  state.networks = data.networks;
  const ids = new Set(state.networks.map((n) => n.id));
  state.selected = new Set(remembered(data.defaults).filter((id) => ids.has(id)));
  renderNetworks();
  setupImageInputs();

  $('#text').addEventListener('input', update);
  $('#dryRun').addEventListener('change', update);
  $('#customize').addEventListener('change', () => { renderOverrides(); update(); });
  $('#composer').addEventListener('submit', submit);

  update();
  loadHistory();
}

init();
