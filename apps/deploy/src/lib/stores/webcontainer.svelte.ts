import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import type { TerminalMode } from '../types.js';

class WebContainerStore {
  private _instance = $state<WebContainer | null>(null);
  private _isBooting = $state(false);
  private _isReady = $state(false);
  private _error = $state<string | null>(null);
  private _currentProcess = $state<WebContainerProcess | null>(null);
  private _terminalMode = $state<TerminalMode>('readonly');

  get instance(): WebContainer | null {
    return this._instance;
  }

  get isBooting(): boolean {
    return this._isBooting;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get error(): string | null {
    return this._error;
  }

  get currentProcess(): WebContainerProcess | null {
    return this._currentProcess;
  }

  get terminalMode(): TerminalMode {
    return this._terminalMode;
  }

  setInstance(instance: WebContainer) {
    this._instance = instance;
    this._isReady = true;
    this._isBooting = false;
  }

  setBooting(booting: boolean) {
    this._isBooting = booting;
  }

  setError(error: string | null) {
    this._error = error;
    this._isBooting = false;
  }

  setCurrentProcess(process: WebContainerProcess | null) {
    this._currentProcess = process;
  }

  setTerminalMode(mode: TerminalMode) {
    this._terminalMode = mode;
  }
}

export const webcontainerStore = new WebContainerStore();
