/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** Set to `1` to require subscriber login before the app (gated / API mode). Omit for open public builds. */
  readonly VITE_ACCESS_GATE?: string;
  /**
   * Vite app base path, e.g. `/MyRepo/` for `https://user.github.io/MyRepo/`.
   * Defaults to `./` for portable static hosting.
   */
  readonly VITE_BASE_URL?: string;
  /** Optional absolute override for where CSV/JSON live (normally `${BASE_URL}output/`). */
  readonly VITE_OUTPUT_BASE_URL?: string;
  /** Dev: skip /access and use local /output (never use in production). */
  readonly VITE_DEV_SKIP_AUTH?: string;
  /**
   * Plausible Analytics site domain as configured in Plausible (e.g. `youruser.github.io`).
   * Omit to disable. See README “Traffic / analytics”.
   */
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  /** Google Analytics 4 measurement ID (e.g. `G-XXXXXXXX`). Omit to disable. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
