/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FRAME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
