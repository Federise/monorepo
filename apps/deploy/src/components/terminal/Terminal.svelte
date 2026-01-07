<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { terminalStore } from './TerminalStore.svelte.js';
  import { webcontainerStore } from '../../lib/stores/webcontainer.svelte.js';

  let terminalElement: HTMLDivElement;
  let resizeObserver: ResizeObserver;

  onMount(async () => {
    // Import xterm - use static imports at top level to let Vite bundle properly
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    await import('@xterm/xterm/css/xterm.css');

    const terminal = new Terminal({
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#8b5cf6',
        cursorAccent: '#0a0a0a',
        selectionBackground: 'rgba(139, 92, 246, 0.3)',
        black: '#1a1a1a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e0e0e0',
        brightBlack: '#666666',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff'
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalElement);
    fitAddon.fit();

    terminalStore.setTerminal(terminal, fitAddon);

    // Handle resize
    resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalElement);

    // Welcome message
    terminal.writeln('\x1b[38;5;141m╭───────────────────────────────────────╮\x1b[0m');
    terminal.writeln('\x1b[38;5;141m│\x1b[0m   \x1b[1;37mFederise Gateway Deployment\x1b[0m         \x1b[38;5;141m│\x1b[0m');
    terminal.writeln('\x1b[38;5;141m╰───────────────────────────────────────╯\x1b[0m');
    terminal.writeln('');
    terminal.writeln('\x1b[90mInitializing WebContainer...\x1b[0m');
  });

  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (terminalStore.terminal) {
      terminalStore.terminal.dispose();
    }
  });
</script>

<div class="terminal-container" class:disabled={webcontainerStore.terminalMode === 'readonly'}>
  <div class="terminal-header">
    <div class="terminal-dots">
      <span class="dot red"></span>
      <span class="dot yellow"></span>
      <span class="dot green"></span>
    </div>
    <span class="terminal-title">Terminal</span>
    <div class="terminal-mode">
      {#if webcontainerStore.terminalMode === 'readonly'}
        <span class="mode-badge readonly">Read-only</span>
      {:else if webcontainerStore.terminalMode === 'limited'}
        <span class="mode-badge limited">Limited</span>
      {:else}
        <span class="mode-badge full">Interactive</span>
      {/if}
    </div>
  </div>
  <div class="terminal-body" bind:this={terminalElement}></div>
</div>

<style>
  .terminal-container {
    background: #0a0a0a;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-muted);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 350px;
    min-width: 0;
    max-width: 100%;
  }

  .terminal-container.disabled {
    opacity: 0.9;
  }

  .terminal-header {
    display: flex;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid var(--border-subtle);
  }

  .terminal-dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot.red {
    background: #f87171;
  }

  .dot.yellow {
    background: #facc15;
  }

  .dot.green {
    background: #4ade80;
  }

  .terminal-title {
    flex: 1;
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .terminal-mode {
    display: flex;
  }

  .mode-badge {
    font-size: var(--font-size-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }

  .mode-badge.readonly {
    background: var(--surface-2);
    color: var(--color-text-muted);
  }

  .mode-badge.limited {
    background: var(--color-warning-bg);
    color: var(--color-warning);
  }

  .mode-badge.full {
    background: var(--color-success-bg);
    color: var(--color-success);
  }

  .terminal-body {
    flex: 1;
    padding: var(--space-md);
    overflow: hidden;
    min-width: 0;
    width: 100%;
  }

  .terminal-body :global(.xterm) {
    height: 100%;
    width: 100% !important;
  }

  .terminal-body :global(.xterm-screen) {
    width: 100% !important;
  }

  .terminal-body :global(.xterm-viewport) {
    overflow-y: auto !important;
    width: 100% !important;
  }

  .terminal-body :global(.xterm-viewport::-webkit-scrollbar) {
    width: 6px;
  }

  .terminal-body :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: transparent;
  }

  .terminal-body :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: #333;
    border-radius: 3px;
  }
</style>
