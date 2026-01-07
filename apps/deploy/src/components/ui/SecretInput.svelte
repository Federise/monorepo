<script lang="ts">
  interface Props {
    label: string;
    value: string;
    placeholder?: string;
    helpText?: string;
    required?: boolean;
    readonly?: boolean;
    onchange?: (value: string) => void;
  }

  let {
    label,
    value = $bindable(),
    placeholder = '',
    helpText = '',
    required = false,
    readonly = false,
    onchange
  }: Props = $props();

  let showValue = $state(false);
  let inputElement: HTMLInputElement;
  const inputId = `secret-input-${Math.random().toString(36).slice(2, 9)}`;

  function toggleVisibility() {
    showValue = !showValue;
  }

  function handleCopy() {
    navigator.clipboard.writeText(value);
  }

  function handleGenerate() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    value = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    onchange?.(value);
  }
</script>

<div class="secret-input">
  <label class="label" for={inputId}>
    {label}
    {#if required}
      <span class="required">*</span>
    {/if}
  </label>

  <div class="input-wrapper">
    <input
      id={inputId}
      bind:this={inputElement}
      type={showValue ? 'text' : 'password'}
      bind:value
      {placeholder}
      {readonly}
      class="input"
      class:readonly
      oninput={() => onchange?.(value)}
    />
    <div class="actions">
      <button type="button" class="action-btn" onclick={toggleVisibility} title={showValue ? 'Hide' : 'Show'}>
        {#if showValue}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clip-rule="evenodd" />
            <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
          </svg>
        {/if}
      </button>
      {#if value}
        <button type="button" class="action-btn" onclick={handleCopy} title="Copy">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
          </svg>
        </button>
      {/if}
      {#if !readonly}
        <button type="button" class="action-btn generate" onclick={handleGenerate} title="Generate">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clip-rule="evenodd" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if helpText}
    <p class="help-text">{helpText}</p>
  {/if}
</div>

<style>
  .secret-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .required {
    color: var(--color-error);
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    background: var(--surface-1);
    border: 1px solid var(--border-muted);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .input-wrapper:focus-within {
    border-color: var(--color-primary);
  }

  .input {
    flex: 1;
    background: transparent;
    border: none;
    padding: var(--space-md) var(--space-lg);
    color: var(--color-text);
    font-size: var(--font-size-base);
    font-family: 'JetBrains Mono', monospace;
    outline: none;
  }

  .input::placeholder {
    color: var(--color-text-subtle);
  }

  .input.readonly {
    opacity: 0.7;
  }

  .actions {
    display: flex;
    padding-right: var(--space-sm);
    gap: 2px;
  }

  .action-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-btn:hover {
    background: var(--surface-2);
    color: var(--color-text);
  }

  .action-btn.generate:hover {
    color: var(--color-primary);
  }

  .action-btn svg {
    width: 16px;
    height: 16px;
  }

  .help-text {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin: 0;
  }
</style>
