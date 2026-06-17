import { Hono } from 'hono'
import { html, raw } from 'hono/html'

// No bindings needed any more — this app is fully public, with each
// visitor's notes stored only in their own browser's localStorage.
const app = new Hono()

// Shared shell. Kept deliberately simple: Cloud Phone renders everything
// server-side in the cloud and ships a compressed vector representation to
// the device, so every visual change costs the user bandwidth. No external
// fonts, no animations, no large images, no JS frameworks.
const Layout = (props: { title?: string; children: any }) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${props.title ?? 'Notes'}</title>
      <style>
        :root {
          --accent: #1f6f6b;
          --accent-dark: #15504c;
          --danger: #b3261e;
          --ink: #1c1f1e;
          --muted: #6b7370;
          --bg: #eef1f0;
          --card: #ffffff;
          --line: #d9dedb;
        }
        * { box-sizing: border-box; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          background: var(--bg);
          color: var(--ink);
          margin: 0;
          padding: 0;
          font-size: 16px;
          line-height: 1.35;
        }
        .app { max-width: 360px; margin: 0 auto; padding-bottom: 24px; }
        header.bar {
          background: var(--accent);
          color: #fff;
          padding: 14px 12px;
        }
        header.bar h1 { margin: 0; font-size: 19px; font-weight: bold; }
        header.bar .sub { font-size: 12px; opacity: 0.85; margin-top: 2px; }
        .pad { padding: 12px; }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 10px;
        }
        label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
        input[type="text"],
        input[type="password"],
        input[type="search"],
        textarea {
          width: 100%;
          padding: 8px;
          font-size: 16px;
          font-family: inherit;
          border: 1px solid var(--line);
          border-radius: 4px;
          background: #fff;
          color: var(--ink);
        }
        textarea { resize: vertical; }
        button, input[type="submit"], a.btn {
          display: inline-block;
          font-size: 14px;
          font-family: inherit;
          padding: 8px 12px;
          border-radius: 4px;
          border: none;
          background: var(--accent);
          color: #fff;
          text-decoration: none;
          margin-top: 6px;
          margin-right: 6px;
        }
        button.secondary, a.btn.secondary {
          background: #fff;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        button.danger { background: var(--danger); }
        button:active, a.btn:active { background: var(--accent-dark); }
        .row { display: block; }
        .note-body { white-space: pre-wrap; word-wrap: break-word; margin-bottom: 6px; }
        .note-body a { color: #0b4ee0; }
        .meta { font-size: 11px; color: var(--muted); display: block; margin-bottom: 6px; }
        .empty { color: var(--muted); font-size: 14px; padding: 16px 4px; text-align: center; }
        .err { color: var(--danger); font-size: 13px; margin: 0 0 8px; }
        .ok { color: var(--accent); font-size: 13px; margin: 0 0 8px; }
        .hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
        details summary { cursor: pointer; font-size: 14px; color: var(--accent); padding: 4px 0; }
        .countbar { font-size: 12px; color: var(--muted); padding: 0 12px 4px; }
      </style>
    </head>
    <body>
      <div class="app">
        ${props.children}
      </div>
    </body>
  </html>
`

// --- Main app (single page, all client-side) --------------------------
// Everything below renders once. From here on, all note CRUD happens in
// the browser against localStorage — no further requests to the Worker,
// which keeps it fast and works fine within Cloud Phone's storage model
// (Cloud Phone supports localStorage with the same 5MB/origin persistence
// as a desktop browser; it survives reloads and only clears if the user
// runs "Clear data" from the Cloud Phone menu). This app is fully public:
// there's no login, and notes are private to each visitor only in the
// sense that they're stuck on whatever device/browser they were typed on.
app.get('/', (c) => {
  return c.html(
    Layout({
      children: html`
        <header class="bar">
          <h1>Notes</h1>
          <div class="sub">Saved on this device only</div>
        </header>

        <div class="pad">
          <div class="card">
            <form id="addForm">
              <label for="content">New note</label>
              <textarea id="content" name="content" rows="3" maxlength="8000" accesskey="1"></textarea>
              <button type="submit">Save note</button>
            </form>
          </div>

          <div class="card">
            <label for="search">Search</label>
            <input type="search" id="search" placeholder="Filter notes..." accesskey="2" />
          </div>

          <p id="status" class="ok" style="display:none;"></p>
          <p id="error" class="err" style="display:none;"></p>
        </div>

        <div class="countbar" id="countbar"></div>
        <div class="pad" style="padding-top:0;">
          <ul id="list" style="list-style:none;padding:0;margin:0;"></ul>
          <p id="empty" class="empty" style="display:none;">No notes yet. Write your first one above.</p>
        </div>

        <div class="pad">
          <details>
            <summary accesskey="3">Backup &amp; restore</summary>
            <div class="card">
              <p class="hint">
                Notes live only in this browser's local storage on this device.
                There is no cloud copy, so back up regularly &mdash; especially
                before clearing browsing data.
              </p>
              <label for="exportBox">Export (copy this somewhere safe)</label>
              <textarea id="exportBox" rows="4" readonly></textarea>
              <button type="button" id="exportBtn" class="secondary">Refresh export</button>
              <button type="button" id="copyBtn" class="secondary">Copy</button>

              <label for="importBox" style="margin-top:10px;">Restore (paste exported text)</label>
              <textarea id="importBox" rows="4" placeholder="Paste backup text here"></textarea>
              <button type="button" id="importBtn">Import</button>
              <p class="hint">Importing adds notes without erasing what's already here.</p>
            </div>
          </details>
        </div>

        <script>${raw(CLIENT_SCRIPT)}</script>
      `
    })
  )
})

export default app

// --- Client-side app -----------------------------------------------------
// Plain ES2017-ish JS, no build step, no dependencies. Cloud Phone runs a
// real recent Chromium under the hood, so modern syntax is safe, but the
// code is kept small and simple since every DOM update still has to be
// re-rendered server-side and streamed down to the device.
const CLIENT_SCRIPT = `
(function () {
  'use strict';

  var STORAGE_KEY = 'dpnotes.v1';
  var state = { notes: [], editingId: null, confirmDeleteId: null, search: '' };

  function loadNotes() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (n) {
        return n && typeof n.id === 'string' && typeof n.content === 'string';
      });
    } catch (e) {
      return [];
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
      return true;
    } catch (e) {
      showError('Could not save: storage may be full or disabled.');
      return false;
    }
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function linkify(text) {
    var escaped = escapeHtml(text);
    return escaped.replace(/(https?:\\/\\/[^\\s<]+)/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
    });
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
    } catch (e) {
      return iso;
    }
  }

  function showStatus(msg) {
    var el = document.getElementById('status');
    var errEl = document.getElementById('error');
    errEl.style.display = 'none';
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    if (msg) setTimeout(function () { el.style.display = 'none'; }, 3000);
  }

  function showError(msg) {
    var el = document.getElementById('error');
    var okEl = document.getElementById('status');
    okEl.style.display = 'none';
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function visibleNotes() {
    var term = state.search.trim().toLowerCase();
    var list = state.notes.slice().sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    if (!term) return list;
    return list.filter(function (n) {
      return n.content.toLowerCase().indexOf(term) !== -1;
    });
  }

  function render() {
    var listEl = document.getElementById('list');
    var emptyEl = document.getElementById('empty');
    var countEl = document.getElementById('countbar');
    var notes = visibleNotes();

    countEl.textContent = state.notes.length === 0
      ? ''
      : (notes.length + ' of ' + state.notes.length + ' note' + (state.notes.length === 1 ? '' : 's'));

    if (notes.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = state.notes.length === 0
        ? 'No notes yet. Write your first one above.'
        : 'No notes match your search.';
      return;
    }
    emptyEl.style.display = 'none';

    var html = '';
    notes.forEach(function (note) {
      html += '<li class="card" data-id="' + note.id + '">';
      if (state.editingId === note.id) {
        html += '<textarea class="editbox" rows="3">' + escapeHtml(note.content) + '</textarea>';
        html += '<button type="button" class="save-edit">Save</button>';
        html += '<button type="button" class="secondary cancel-edit">Cancel</button>';
      } else {
        html += '<div class="note-body">' + linkify(note.content) + '</div>';
        html += '<span class="meta">' + formatDate(note.updatedAt || note.createdAt) + '</span>';
        html += '<button type="button" class="secondary edit-btn">Edit</button>';
        if (state.confirmDeleteId === note.id) {
          html += '<button type="button" class="danger confirm-del">Confirm delete</button>';
          html += '<button type="button" class="secondary cancel-del">Cancel</button>';
        } else {
          html += '<button type="button" class="secondary del-btn">Delete</button>';
        }
      }
      html += '</li>';
    });
    listEl.innerHTML = html;
  }

  function addNote(content) {
    var now = new Date().toISOString();
    state.notes.push({ id: newId(), content: content, createdAt: now, updatedAt: now });
    if (saveNotes()) showStatus('Note saved.');
    render();
  }

  function updateNote(id, content) {
    var note = state.notes.find(function (n) { return n.id === id; });
    if (!note) return;
    note.content = content;
    note.updatedAt = new Date().toISOString();
    if (saveNotes()) showStatus('Note updated.');
    state.editingId = null;
    render();
  }

  function deleteNote(id) {
    state.notes = state.notes.filter(function (n) { return n.id !== id; });
    state.confirmDeleteId = null;
    if (saveNotes()) showStatus('Note deleted.');
    render();
  }

  function refreshExportBox() {
    document.getElementById('exportBox').value = JSON.stringify(state.notes, null, 2);
  }

  function importFromText(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      showError('That backup text is not valid. Nothing was imported.');
      return;
    }
    if (!Array.isArray(parsed)) {
      showError('Expected a list of notes. Nothing was imported.');
      return;
    }
    var added = 0;
    parsed.forEach(function (item) {
      if (item && typeof item.content === 'string' && item.content.trim() !== '') {
        var now = new Date().toISOString();
        state.notes.push({
          id: newId(),
          content: item.content,
          createdAt: item.createdAt || now,
          updatedAt: item.updatedAt || now
        });
        added++;
      }
    });
    if (added > 0) {
      saveNotes();
      showStatus('Imported ' + added + ' note' + (added === 1 ? '' : 's') + '.');
    } else {
      showError('No valid notes found in that text.');
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    state.notes = loadNotes();
    render();
    refreshExportBox();

    document.getElementById('addForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var box = document.getElementById('content');
      var val = box.value.trim();
      if (!val) { showError('Note is empty.'); return; }
      addNote(val);
      box.value = '';
      refreshExportBox();
    });

    document.getElementById('search').addEventListener('input', function (e) {
      state.search = e.target.value;
      render();
    });

    document.getElementById('list').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-id]');
      if (!li) return;
      var id = li.getAttribute('data-id');

      if (e.target.classList.contains('edit-btn')) {
        state.editingId = id;
        state.confirmDeleteId = null;
        render();
      } else if (e.target.classList.contains('cancel-edit')) {
        state.editingId = null;
        render();
      } else if (e.target.classList.contains('save-edit')) {
        var box = li.querySelector('.editbox');
        var val = box.value.trim();
        if (!val) { showError('Note cannot be empty.'); return; }
        updateNote(id, val);
        refreshExportBox();
      } else if (e.target.classList.contains('del-btn')) {
        state.confirmDeleteId = id;
        render();
      } else if (e.target.classList.contains('cancel-del')) {
        state.confirmDeleteId = null;
        render();
      } else if (e.target.classList.contains('confirm-del')) {
        deleteNote(id);
        refreshExportBox();
      }
    });

    document.getElementById('exportBtn').addEventListener('click', refreshExportBox);

    document.getElementById('copyBtn').addEventListener('click', function () {
      var box = document.getElementById('exportBox');
      box.focus();
      box.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(box.value).then(function () {
          showStatus('Copied to clipboard.');
        }).catch(function () {
          showStatus('Text selected — use your device copy action.');
        });
      } else {
        showStatus('Text selected — use your device copy action.');
      }
    });

    document.getElementById('importBtn').addEventListener('click', function () {
      var box = document.getElementById('importBox');
      if (!box.value.trim()) { showError('Paste backup text first.'); return; }
      importFromText(box.value.trim());
      box.value = '';
    });
  });
})();
`
