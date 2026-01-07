import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

class TerminalStore {
  private _terminal = $state<Terminal | null>(null);
  private _fitAddon = $state<FitAddon | null>(null);
  private _isReady = $state(false);

  get terminal(): Terminal | null {
    return this._terminal;
  }

  get fitAddon(): FitAddon | null {
    return this._fitAddon;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  setTerminal(terminal: Terminal, fitAddon: FitAddon) {
    this._terminal = terminal;
    this._fitAddon = fitAddon;
    this._isReady = true;
  }

  write(text: string) {
    if (this._terminal) {
      this._terminal.write(text);
    }
  }

  writeLine(text: string) {
    if (this._terminal) {
      this._terminal.writeln(text);
    }
  }

  clear() {
    if (this._terminal) {
      this._terminal.clear();
    }
  }

  fit() {
    if (this._fitAddon) {
      this._fitAddon.fit();
    }
  }
}

export const terminalStore = new TerminalStore();
