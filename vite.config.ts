import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// Non-secret runtime settings. These are always published as plain vars.
const MODEL_VARS: Record<string, string> = {
  GEMINI_MODEL: "gemini-3.5-flash",
  GEMINI_VISION_MODEL: "gemini-3.6-flash",
  OPENAI_MODEL: "gpt-5.6-luna",
};

// Server-only values. In production these live in Worker secrets, so they are
// published as vars only when a local `.env` actually supplies one: a var
// overwrites the deployed secret that shares its name, and an empty var would
// silently wipe the real key.
const SECRET_VARS = [
  "KAKAO_REST_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "BUILDING_REGISTER_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ADMIN_EMAIL",
  "SUPABASE_PHOTO_BUCKET",
];

export default defineConfig(async ({ mode }) => {
  // Load server-only values without exposing them through client-side Vite
  // variables. Only variables prefixed with VITE_ are available to browser
  // bundles; the Kakao REST key is passed directly to the Worker binding.
  const serverEnv = loadEnv(mode, process.cwd(), "");

  // Cloudflare resource identity. A real deploy needs the actual D1 id, so CI
  // supplies these; local dev falls back to the simulated placeholders.
  const workerName = serverEnv.CF_WORKER_NAME || "bring-premap";
  const d1DatabaseName = serverEnv.CF_D1_DATABASE_NAME || "site-creator-d1";
  const d1DatabaseId =
    serverEnv.CF_D1_DATABASE_ID || SITE_CREATOR_PLACEHOLDER_DATABASE_ID;
  const r2BucketName = serverEnv.CF_R2_BUCKET_NAME || "site-creator-r2";

  const vars = { ...MODEL_VARS };
  for (const key of [...Object.keys(MODEL_VARS), ...SECRET_VARS]) {
    if (serverEnv[key]) {
      vars[key] = serverEnv[key];
    }
  }

  const bindingConfig = {
    name: workerName,
    main: "./worker/index.ts",
    compatibility_date: "2026-05-15",
    compatibility_flags: ["nodejs_compat"],
    images: { binding: "IMAGES" },
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: d1DatabaseName,
            database_id: d1DatabaseId,
            // Wrangler resolves this against the generated config in
            // dist/server/, so climb back to the drizzle/ directory that
            // drizzle-kit writes at the project root.
            migrations_dir: "../../drizzle",
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: r2BucketName,
          },
        ]
      : [],
    vars,
  };

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: bindingConfig,
      }),
    ],
  };
});
