<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getClient } from '../../stores/federise.svelte';
  import type { Note } from '../../lib/types';

  let notes = $state<Note[]>([]);
  let selectedNote = $state<Note | null>(null);
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  // Editor state
  let editTitle = $state('');
  let editContent = $state('');
  let hasUnsavedChanges = $state(false);

  // Mobile view state
  let mobileView = $state<'list' | 'editor'>('list');

  const NOTE_PREFIX = 'note:';

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (hasUnsavedChanges && selectedNote) {
        saveNote();
      }
    }
  }

  onMount(() => {
    loadNotes();
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  async function loadNotes() {
    const client = getClient();
    if (!client) return;

    isLoading = true;
    error = null;

    try {
      const keys = await client.kv.keys(NOTE_PREFIX);
      const loadedNotes: Note[] = [];

      for (const key of keys) {
        const value = await client.kv.get(key);
        if (value) {
          try {
            loadedNotes.push(JSON.parse(value));
          } catch {
            // Skip invalid notes
          }
        }
      }

      notes = loadedNotes.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load notes';
    } finally {
      isLoading = false;
    }
  }

  async function createNote() {
    const client = getClient();
    if (!client) return;

    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: 'Untitled Note',
      content: '',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await client.kv.set(`${NOTE_PREFIX}${note.id}`, JSON.stringify(note));
      notes = [note, ...notes];
      selectNote(note);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create note';
    }
  }

  function selectNote(note: Note) {
    selectedNote = note;
    editTitle = note.title;
    editContent = note.content;
    hasUnsavedChanges = false;
    mobileView = 'editor';
  }

  function backToList() {
    mobileView = 'list';
  }

  function markUnsaved() {
    hasUnsavedChanges = true;
  }

  async function saveNote() {
    const client = getClient();
    if (!client || !selectedNote) return;

    isSaving = true;

    try {
      const updatedNote: Note = {
        ...selectedNote,
        title: editTitle,
        content: editContent,
        updatedAt: new Date().toISOString(),
      };

      await client.kv.set(`${NOTE_PREFIX}${updatedNote.id}`, JSON.stringify(updatedNote));

      selectedNote = updatedNote;
      notes = notes
        .map((n) => (n.id === updatedNote.id ? updatedNote : n))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      hasUnsavedChanges = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save note';
    } finally {
      isSaving = false;
    }
  }

  async function deleteNote(note: Note) {
    const client = getClient();
    if (!client) return;

    if (!confirm(`Delete "${note.title}"?`)) return;

    try {
      await client.kv.delete(`${NOTE_PREFIX}${note.id}`);
      notes = notes.filter((n) => n.id !== note.id);

      if (selectedNote?.id === note.id) {
        selectedNote = null;
        editTitle = '';
        editContent = '';
        mobileView = 'list';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete note';
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<div class="notes-app" class:show-editor={mobileView === 'editor'}>
  <div class="list-panel card">
    <div class="panel-header">
      <h2>Notes</h2>
      <button class="btn btn-primary btn-sm" onclick={createNote}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New
      </button>
    </div>

    {#if isLoading}
      <div class="empty-state">
        <div class="spinner"></div>
        <p>Loading notes...</p>
      </div>
    {:else if notes.length === 0}
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p>No notes yet</p>
        <button class="btn btn-primary" onclick={createNote}>Create your first note</button>
      </div>
    {:else}
      <ul class="notes-list">
        {#each notes as note (note.id)}
          <li class:selected={selectedNote?.id === note.id}>
            <button class="note-item" onclick={() => selectNote(note)}>
              <span class="note-title-row">
                <span class="note-title">{note.title || 'Untitled'}</span>
                {#if selectedNote?.id === note.id && hasUnsavedChanges}
                  <span class="unsaved-dot" title="Unsaved changes"></span>
                {/if}
              </span>
              <span class="note-preview">{note.content.slice(0, 50) || 'No content'}</span>
              <span class="note-date">{formatDate(note.updatedAt)}</span>
            </button>
            <button
              class="delete-btn"
              onclick={(e) => {
                e.stopPropagation();
                deleteNote(note);
              }}
              title="Delete note"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="editor-panel card">
    {#if selectedNote}
      <div class="panel-header">
        <button class="back-btn" onclick={backToList} aria-label="Back to notes list">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div class="title-wrapper">
          <input
            type="text"
            class="title-input"
            bind:value={editTitle}
            placeholder="Note title"
            oninput={markUnsaved}
          />
        </div>
        {#if isSaving}
          <span class="save-status">Saving...</span>
        {/if}
      </div>
      <textarea
        class="content-input"
        bind:value={editContent}
        placeholder="Write your note here..."
        oninput={markUnsaved}
      ></textarea>
      <div class="editor-footer">
        <span class="keyboard-hint">
          {#if hasUnsavedChanges}
            <kbd>Ctrl</kbd>+<kbd>S</kbd> to save
          {:else}
            All changes saved
          {/if}
        </span>
      </div>
    {:else}
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <p>Select a note to edit</p>
      </div>
    {/if}
  </div>
</div>

{#if error}
  <div class="error-toast">
    {error}
    <button class="toast-close" onclick={() => (error = null)}>×</button>
  </div>
{/if}

<style>
  .notes-app {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1rem;
    height: calc(100vh - 180px);
    min-height: 400px;
  }

  .list-panel,
  .editor-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 0.5rem;
  }

  .panel-header h2 {
    flex: 1;
    font-size: 1rem;
    font-weight: 600;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }

  .back-btn {
    display: none;
    padding: 0.375rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    border-radius: var(--radius);
  }

  .back-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .notes-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    margin: 0 -1.5rem;
    padding: 0;
  }

  .notes-list li {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--color-border);
  }

  .notes-list li.selected {
    background: var(--color-surface-hover);
  }

  .note-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: var(--color-text);
    min-width: 0;
  }

  .note-item:hover {
    background: var(--color-surface-hover);
  }

  .note-title-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
  }

  .note-title {
    font-weight: 500;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-preview {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .note-date {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .delete-btn {
    padding: 0 0.75rem;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
    display: flex;
    align-items: center;
  }

  .notes-list li:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--color-error);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
    gap: 1rem;
  }

  .empty-state svg {
    opacity: 0.5;
  }

  .empty-state p {
    font-size: 0.9rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .title-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .title-input {
    flex: 1;
    font-size: 1.1rem;
    font-weight: 600;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    min-width: 0;
  }

  .title-input::placeholder {
    color: var(--color-text-muted);
  }

  .unsaved-dot {
    width: 8px;
    height: 8px;
    background: var(--color-primary);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .save-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .content-input {
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    outline: none;
    resize: none;
    font-size: 0.95rem;
    line-height: 1.7;
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0.75rem;
  }

  .content-input:focus {
    border-color: var(--color-primary);
  }

  .content-input::placeholder {
    color: var(--color-text-muted);
  }

  .editor-footer {
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border);
  }

  .keyboard-hint {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .keyboard-hint kbd {
    background: var(--color-surface-hover);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
    font-size: 0.65rem;
    font-family: inherit;
  }

  .error-toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: var(--color-error);
    color: white;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideIn 0.3s ease;
    z-index: 1000;
  }

  .toast-close {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  @keyframes slideIn {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .notes-app {
      grid-template-columns: 1fr;
      height: calc(100vh - 120px);
    }

    .list-panel {
      display: flex;
    }

    .editor-panel {
      display: none;
    }

    .notes-app.show-editor .list-panel {
      display: none;
    }

    .notes-app.show-editor .editor-panel {
      display: flex;
    }

    .back-btn {
      display: flex;
    }

    .delete-btn {
      opacity: 1;
    }

    .keyboard-hint {
      display: none;
    }
  }
</style>
