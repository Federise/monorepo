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
            console.warn('Failed to parse note:', key);
          }
        }
      }

      // Sort by updatedAt descending
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

      // Update local state
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

<div class="notes-app">
  <div class="sidebar card">
    <div class="sidebar-header">
      <h2>Notes</h2>
      <button class="btn btn-primary" onclick={createNote}>+ New</button>
    </div>

    {#if isLoading}
      <div class="loading">Loading notes...</div>
    {:else if notes.length === 0}
      <div class="empty">No notes yet. Create one to get started!</div>
    {:else}
      <ul class="notes-list">
        {#each notes as note (note.id)}
          <li class:selected={selectedNote?.id === note.id}>
            <button class="note-item" onclick={() => selectNote(note)}>
              <span class="note-title">{note.title || 'Untitled'}</span>
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
              ×
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="editor card">
    {#if selectedNote}
      <div class="editor-header">
        <div class="title-wrapper">
          <input
            type="text"
            class="title-input"
            bind:value={editTitle}
            placeholder="Note title"
            oninput={markUnsaved}
          />
          {#if hasUnsavedChanges}
            <span class="unsaved-dot" title="Unsaved changes (Ctrl+S to save)"></span>
          {/if}
        </div>
        <span class="save-hint">
          {#if isSaving}
            Saving...
          {:else if hasUnsavedChanges}
            <kbd>Ctrl</kbd>+<kbd>S</kbd>
          {/if}
        </span>
      </div>
      <textarea
        class="content-input"
        bind:value={editContent}
        placeholder="Write your note here..."
        oninput={markUnsaved}
      ></textarea>
    {:else}
      <div class="no-selection">
        <p>Select a note or create a new one</p>
      </div>
    {/if}
  </div>
</div>

{#if error}
  <div class="error-toast">{error}</div>
{/if}

<style>
  .notes-app {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1rem;
    height: calc(100vh - 150px);
    min-height: 400px;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1rem;
  }

  .sidebar-header h2 {
    font-size: 1.125rem;
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
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: var(--color-text);
  }

  .note-item:hover {
    background: var(--color-surface-hover);
  }

  .note-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .note-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .delete-btn {
    padding: 0 1rem;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .notes-list li:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--color-error);
  }

  .loading,
  .empty {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .editor {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1rem;
  }

  .title-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .title-input {
    flex: 1;
    font-size: 1.25rem;
    font-weight: 600;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
  }

  .title-input::placeholder {
    color: var(--color-text-muted);
  }

  .unsaved-dot {
    width: 10px;
    height: 10px;
    background: var(--color-primary);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .save-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .save-hint kbd {
    background: var(--color-surface-hover);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    font-size: 0.7rem;
    font-family: inherit;
  }

  .content-input {
    flex: 1;
    border: none;
    outline: none;
    resize: none;
    font-size: 1rem;
    line-height: 1.6;
    background: transparent;
    color: var(--color-text);
  }

  .content-input::placeholder {
    color: var(--color-text-muted);
  }

  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
  }

  .error-toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: var(--color-error);
    color: white;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    animation: slideIn 0.3s ease;
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

  @media (max-width: 768px) {
    .notes-app {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }

    .sidebar {
      max-height: 200px;
    }
  }
</style>
