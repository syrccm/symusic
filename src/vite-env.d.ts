/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_ADMIN_EMAIL?: string;
  readonly VITE_FIREBASE_ADMIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}