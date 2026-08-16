/** Cloudflare Worker entry point for BRING Pre-Map. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createClient } from "@supabase/supabase-js";
import {
  CAPTURE_CATEGORY_LABELS,
  CaptureCategoryKey,
  captureCategoryLabel,
  toCaptureCategoryKey,
} from "../lib/capture-categories";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CAPTURE_BUCKET?: R2Bucket;
  KAKAO_REST_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_VISION_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_ADMIN_EMAIL?: string;
  SUPABASE_PHOTO_BUCKET?: string;
  BUILDING_REGISTER_API_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function supabaseAdmin(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type AdminSupabaseClient = NonNullable<ReturnType<typeof supabaseAdmin>>;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function facilityTypeForDatabase(value: unknown) {
  return ({ 호텔: "hotel", 오피스: "office", 아파트: "apartment", 병원: "hospital" } as Record<string, string>)[String(value)] || "other";
}

async function saveDiagnosis(request: Request, env: Env) {
  const supabase = supabaseAdmin(env);
  if (!supabase) return json({ error: "진단 저장소 설정이 완료되지 않았습니다." }, 503);
  if (Number(request.headers.get("content-length") || 0) > 512_000) return json({ error: "진단 데이터가 너무 큽니다." }, 413);
  const body = await request.json() as Record<string, unknown>;
  const facility = jsonObject(body.facility);
  const facilityName = cleanText(facility.name, 180);
  const sessionKey = cleanText(body.sessionKey, 160);
  if (!facilityName || !sessionKey) return json({ error: "시설 또는 진단 세션 정보가 없습니다." }, 400);
  const now = new Date().toISOString();
  const row = {
    session_key: sessionKey,
    facility_name: facilityName,
    facility_type: facilityTypeForDatabase(facility.type || body.facilityType),
    facility_address: cleanText(facility.address, 300) || null,
    kakao_place_id: cleanText(facility.id, 120) || null,
    status: body.status === "completed" ? "completed" : "collecting",
    current_stage: Math.max(0, Math.min(3, Number(body.currentStage || 0))),
    progress_percent: Math.max(0, Math.min(100, Number(body.progressPercent || 0))),
    facility_snapshot: facility,
    interview_snapshot: jsonObject(body.interview),
    route_snapshot: jsonObject(body.route),
    analysis_snapshot: jsonObject(body.analysis),
    recommendation_snapshot: jsonObject(body.recommendation),
    quote_snapshot: jsonObject(body.quote),
    completed_at: body.status === "completed" ? now : null,
    updated_at: now,
  };
  const { data, error } = await supabase.from("diagnoses")
    .upsert(row, { onConflict: "session_key" })
    .select("id, status, updated_at")
    .single();
  if (error) {
    console.error("Supabase diagnosis save failed", error.code, error.message);
    return json({ error: "진단 결과를 저장하지 못했습니다." }, 502);
  }

  const observations = Array.isArray(body.observations) ? body.observations.slice(0, 100) : [];
  if (observations.length) {
    await supabase.from("diagnosis_observations").delete().eq("diagnosis_id", data.id);
    const observationRows = observations.map((entry) => {
      const item = jsonObject(entry);
      return {
        diagnosis_id: data.id,
        stage: Math.max(1, Math.min(3, Number(item.stage || 1))),
        category: cleanText(item.category, 80) || "기타",
        observation_type: item.slopeAngle == null ? "detected" : "slope",
        value: item.slopeAngle == null ? item : { ...item, slope_angle: Number(item.slopeAngle) },
      };
    });
    const { error: observationError } = await supabase.from("diagnosis_observations").insert(observationRows);
    if (observationError) console.error("Supabase observation save failed", observationError.code, observationError.message);
  }
  return json({ id: data.id, status: data.status, savedAt: data.updated_at }, 201);
}

async function saveConsultation(request: Request, env: Env) {
  const supabase = supabaseAdmin(env);
  if (!supabase) return json({ error: "상담 저장소 설정이 완료되지 않았습니다." }, 503);
  const body = await request.json() as Record<string, unknown>;
  const diagnosisId = cleanText(body.diagnosisId, 80);
  const contactName = cleanText(body.contactName, 100);
  const email = cleanText(body.email, 180);
  const phone = cleanText(body.phone, 60);
  if (!diagnosisId || !contactName || (!email && !phone) || body.consent !== true) {
    return json({ error: "필수 상담 정보와 개인정보 동의를 확인해주세요." }, 400);
  }
  const { data, error } = await supabase.from("consultation_requests").insert({
    diagnosis_id: diagnosisId,
    contact_name: contactName,
    organization: cleanText(body.organization, 180) || null,
    email: email || null,
    phone: phone || null,
    preferred_contact_method: cleanText(body.preferredContactMethod, 50) || null,
    consent_version: "bring-premap-consult-v1",
    consented_at: new Date().toISOString(),
    notes: JSON.stringify({ department: cleanText(body.department, 100), title: cleanText(body.title, 100), targetTiming: cleanText(body.targetTiming, 100) }),
  }).select("id").single();
  if (error) {
    console.error("Supabase consultation save failed", error.code, error.message);
    return json({ error: "상담 요청을 저장하지 못했습니다." }, 502);
  }
  return json({ id: data.id }, 201);
}

async function verifyAdminSession(request: Request, env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_ADMIN_EMAIL) {
    return json({ error: "관리자 인증 설정이 완료되지 않았습니다." }, 503);
  }
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "로그인이 필요합니다." }, 401);
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!response.ok) return json({ error: "유효하지 않은 로그인입니다." }, 401);
  const user = await response.json() as { id?: string; email?: string };
  if (!user.email || user.email.toLowerCase() !== env.SUPABASE_ADMIN_EMAIL.toLowerCase()) {
    return json({ error: "관리자 계정만 접근할 수 있습니다." }, 403);
  }
  return json({ ok: true, user: { id: user.id, email: user.email } });
}

async function fetchAllAdminRows(supabase: AdminSupabaseClient, table: string) {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function getAdminDiagnoses(request: Request, env: Env) {
  const authorization = await verifyAdminSession(request, env);
  if (!authorization.ok) return authorization;
  const supabase = supabaseAdmin(env);
  if (!supabase) return json({ error: "관리자 진단 저장소 설정이 완료되지 않았습니다." }, 503);
  try {
    await ensureSchema(env.DB);
    const [diagnoses, consultations, capturedPhotos, verificationAttempts] = await Promise.all([
      fetchAllAdminRows(supabase, "diagnoses"),
      fetchAllAdminRows(supabase, "consultation_requests"),
      env.DB.prepare(`SELECT p.id, p.session_id AS sessionId, COALESCE(s.root_session_id, s.id) AS rootSessionId,
        s.route_number AS routeNumber, p.stage, p.category, p.file_name AS fileName,
        p.content_type AS contentType, p.size, p.ai_verified AS aiVerified,
        p.ai_detected_category AS aiDetectedCategory, p.ai_confidence AS aiConfidence,
        p.ai_reason AS aiReason, p.ai_status AS aiStatus, p.ai_evidence AS aiEvidence,
        p.supabase_path AS supabasePath, p.supabase_bucket AS supabaseBucket, p.created_at AS createdAt
        FROM capture_photos p JOIN capture_sessions s ON s.id = p.session_id
        WHERE p.supabase_path IS NOT NULL
        ORDER BY p.created_at DESC LIMIT 1000`).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT a.id, a.session_id AS sessionId, COALESCE(s.root_session_id, s.id) AS rootSessionId,
        s.route_number AS routeNumber, a.stage, a.category, a.status, a.confidence,
        a.image_usable AS imageUsable, a.evidence, a.reason, a.created_at AS createdAt
        FROM capture_verification_attempts a JOIN capture_sessions s ON s.id = a.session_id
        ORDER BY a.created_at DESC LIMIT 1000`).all<Record<string, unknown>>(),
    ]);
    const signedPhotos: Array<Record<string, unknown> & { aiVerified: boolean; signedUrl: string }> = await Promise.all((capturedPhotos.results || []).map(async (photo) => {
      const path = cleanText(photo.supabasePath, 700);
      const bucket = cleanText(photo.supabaseBucket, 120) || env.SUPABASE_PHOTO_BUCKET || "diagnosis-photos";
      const { data } = path ? await supabase.storage.from(bucket).createSignedUrl(path, 3600) : { data: null };
      return { ...photo, aiVerified: Boolean(photo.aiVerified), signedUrl: data?.signedUrl || "" };
    }));
    const photosBySession = new Map<string, Record<string, unknown>[]>();
    signedPhotos.forEach((photo) => {
      const sessionId = cleanText(photo.rootSessionId || photo.sessionId, 160);
      if (!sessionId) return;
      photosBySession.set(sessionId, [...(photosBySession.get(sessionId) || []), photo]);
    });
    const attemptsBySession = new Map<string, Record<string, unknown>[]>();
    (verificationAttempts.results || []).forEach((attempt) => {
      const sessionId = cleanText(attempt.rootSessionId || attempt.sessionId, 160);
      if (!sessionId) return;
      attemptsBySession.set(sessionId, [...(attemptsBySession.get(sessionId) || []), attempt]);
    });
    const diagnosesWithPhotos = diagnoses.map((diagnosis) => ({
      ...diagnosis,
      capture_photos: photosBySession.get(cleanText(diagnosis.session_key, 160)) || [],
      capture_verification_attempts: attemptsBySession.get(cleanText(diagnosis.session_key, 160)) || [],
    }));
    return json({ diagnoses: diagnosesWithPhotos, consultations, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const details = error as { code?: string; message?: string };
    console.error("Supabase admin dashboard load failed", details.code || "unknown", details.message || "unknown");
    return json({ error: "Supabase 진단 결과를 불러오지 못했습니다." }, 502);
  }
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS capture_sessions (
      id TEXT PRIMARY KEY,
      facility_name TEXT NOT NULL,
      facility_type TEXT NOT NULL,
      start_point TEXT NOT NULL,
      end_point TEXT NOT NULL,
      uses_elevator INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'waiting',
      device_count INTEGER NOT NULL DEFAULT 0,
      current_stage INTEGER NOT NULL DEFAULT 0,
      root_session_id TEXT,
      route_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS capture_photos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      stage INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT '기준사진',
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      slope_angle REAL,
      ai_verified INTEGER NOT NULL DEFAULT 0,
      ai_detected_category TEXT,
      ai_confidence REAL,
      ai_reason TEXT,
      ai_status TEXT NOT NULL DEFAULT 'VERIFIED',
      ai_evidence TEXT,
      supabase_path TEXT,
      supabase_bucket TEXT NOT NULL DEFAULT 'diagnosis-photos',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_capture_photos_session_id ON capture_photos(session_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS capture_observations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage INTEGER NOT NULL,
      category TEXT NOT NULL,
      slope_angle REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_capture_observations_session_id ON capture_observations(session_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_capture_observations_session_stage_category ON capture_observations(session_id, stage, category)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS capture_verification_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage INTEGER NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence REAL,
      image_usable INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_capture_verification_attempts_session_id ON capture_verification_attempts(session_id)"),
    db.prepare("PRAGMA optimize"),
  ]);
  const photoColumns = await db.prepare("PRAGMA table_info(capture_photos)").all<{ name: string }>();
  const sessionColumns = await db.prepare("PRAGMA table_info(capture_sessions)").all<{ name: string }>();
  if (!sessionColumns.results.some((column) => column.name === "root_session_id")) {
    await db.prepare("ALTER TABLE capture_sessions ADD COLUMN root_session_id TEXT").run();
  }
  if (!sessionColumns.results.some((column) => column.name === "route_number")) {
    await db.prepare("ALTER TABLE capture_sessions ADD COLUMN route_number INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!photoColumns.results.some((column) => column.name === "category")) {
    await db.prepare("ALTER TABLE capture_photos ADD COLUMN category TEXT NOT NULL DEFAULT '기준사진'").run();
  }
  const additionalPhotoColumns = [
    ["ai_verified", "INTEGER NOT NULL DEFAULT 0"],
    ["ai_detected_category", "TEXT"],
    ["ai_confidence", "REAL"],
    ["ai_reason", "TEXT"],
    ["ai_status", "TEXT NOT NULL DEFAULT 'VERIFIED'"],
    ["ai_evidence", "TEXT"],
    ["supabase_path", "TEXT"],
    ["supabase_bucket", "TEXT NOT NULL DEFAULT 'diagnosis-photos'"],
  ] as const;
  for (const [name, definition] of additionalPhotoColumns) {
    if (!photoColumns.results.some((column) => column.name === name)) {
      await db.prepare(`ALTER TABLE capture_photos ADD COLUMN ${name} ${definition}`).run();
    }
  }
}

async function createCaptureSession(request: Request, env: Env) {
  const body = await request.json() as {
    facilityName?: string;
    facilityType?: string;
    startPoint?: string;
    endPoint?: string;
    usesElevator?: boolean;
    parentSessionId?: string;
  };
  if (!body.facilityName || !body.facilityType) {
    return json({ error: "시설 정보가 누락되었습니다." }, 400);
  }
  await ensureSchema(env.DB);
  const id = crypto.randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();
  let rootSessionId = id;
  let routeNumber = 1;
  if (body.parentSessionId) {
    const parent = await env.DB.prepare(`SELECT id, COALESCE(root_session_id, id) AS rootSessionId
      FROM capture_sessions WHERE id = ?`).bind(body.parentSessionId).first<{ id: string; rootSessionId: string }>();
    if (!parent) return json({ error: "기존 촬영 경로를 찾을 수 없습니다." }, 404);
    rootSessionId = parent.rootSessionId;
    const route = await env.DB.prepare(`SELECT COALESCE(MAX(route_number), 0) + 1 AS nextRouteNumber
      FROM capture_sessions WHERE id = ? OR root_session_id = ?`).bind(rootSessionId, rootSessionId).first<{ nextRouteNumber: number }>();
    routeNumber = Math.max(2, Number(route?.nextRouteNumber || 2));
  }
  await env.DB.prepare(`INSERT INTO capture_sessions
    (id, facility_name, facility_type, start_point, end_point, uses_elevator, status, device_count, current_stage, root_session_id, route_number, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'waiting', 0, 0, ?, ?, ?, ?)`)
    .bind(id, body.facilityName, body.facilityType, cleanText(body.startPoint, 180), cleanText(body.endPoint, 180), body.usesElevator ? 1 : 0, rootSessionId, routeNumber, now, now)
    .run();
  return json({ id, rootSessionId, routeNumber, status: "waiting" }, 201);
}

async function updateCaptureRoute(id: string, request: Request, env: Env) {
  await ensureSchema(env.DB);
  const body = await request.json() as { startPoint?: string; endPoint?: string; usesElevator?: boolean };
  const startPoint = cleanText(body.startPoint, 180);
  const endPoint = cleanText(body.endPoint, 180);
  if (!startPoint || !endPoint) return json({ error: "출발지와 목적지를 모두 입력해주세요." }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE capture_sessions
    SET start_point = ?, end_point = ?, uses_elevator = ?, status = 'connected', current_stage = 0, updated_at = ?
    WHERE id = ?`)
    .bind(startPoint, endPoint, body.usesElevator ? 1 : 0, now, id).run();
  if (!result.meta.changes) return json({ error: "촬영 경로를 찾을 수 없습니다." }, 404);
  return json({ id, startPoint, endPoint, usesElevator: Boolean(body.usesElevator), status: "connected" });
}

async function getCaptureSession(id: string, env: Env, includeRouteGroup = false) {
  await ensureSchema(env.DB);
  const session = await env.DB.prepare(`SELECT id, facility_name AS facilityName, facility_type AS facilityType,
    start_point AS startPoint, end_point AS endPoint, uses_elevator AS usesElevator,
    status, device_count AS deviceCount, current_stage AS currentStage, COALESCE(root_session_id, id) AS rootSessionId,
    route_number AS routeNumber, created_at AS createdAt, updated_at AS updatedAt
    FROM capture_sessions WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  if (!session) return json({ error: "촬영 세션을 찾을 수 없습니다." }, 404);
  const rootSessionId = String(session.rootSessionId || id);
  const scopeCondition = includeRouteGroup ? "(s.id = ? OR s.root_session_id = ?)" : "s.id = ?";
  const scopeBindings = includeRouteGroup ? [rootSessionId, rootSessionId] : [id];
  const [photos, observations, routeSessions] = await Promise.all([
    env.DB.prepare(`SELECT p.id, p.stage, p.category, p.file_name AS fileName, p.content_type AS contentType,
      p.size, p.slope_angle AS slopeAngle, p.ai_verified AS aiVerified, p.ai_detected_category AS aiDetectedCategory,
      p.ai_confidence AS aiConfidence, p.ai_reason AS aiReason, p.ai_status AS aiStatus, p.ai_evidence AS aiEvidence,
      p.created_at AS createdAt,
      s.route_number AS routeNumber FROM capture_photos p JOIN capture_sessions s ON s.id = p.session_id
      WHERE ${scopeCondition} ORDER BY s.route_number, p.created_at`).bind(...scopeBindings).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT o.id, o.stage, o.category, o.slope_angle AS slopeAngle,
      o.created_at AS createdAt, o.updated_at AS updatedAt, s.route_number AS routeNumber
      FROM capture_observations o JOIN capture_sessions s ON s.id = o.session_id
      WHERE ${scopeCondition} ORDER BY s.route_number, o.updated_at`).bind(...scopeBindings).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, route_number AS routeNumber, start_point AS startPoint, end_point AS endPoint,
      uses_elevator AS usesElevator, status, current_stage AS currentStage, device_count AS deviceCount
      FROM capture_sessions WHERE id = ? OR root_session_id = ? ORDER BY route_number`).bind(rootSessionId, rootSessionId).all<Record<string, unknown>>(),
  ]);
  const routes = routeSessions.results || [];
  const groupStatus = includeRouteGroup
    ? (routes.length > 0 && routes.every((route) => route.status === "completed") ? "completed" : routes.some((route) => Number(route.deviceCount) > 0) ? "capturing" : String(session.status))
    : String(session.status);
  const activeRoute = [...routes].reverse().find((route) => route.status !== "completed") || routes.at(-1);
  return json({
    ...session,
    status: groupStatus,
    currentStage: includeRouteGroup ? Number(activeRoute?.currentStage || session.currentStage) : session.currentStage,
    deviceCount: includeRouteGroup ? Math.max(0, ...routes.map((route) => Number(route.deviceCount || 0))) : session.deviceCount,
    usesElevator: Boolean(session.usesElevator),
    routeSessions: routes,
    photos: photos.results.map((photo) => ({ ...photo, aiVerified: Boolean(photo.aiVerified) })),
    observations: observations.results,
  });
}

async function joinCaptureSession(id: string, env: Env) {
  await ensureSchema(env.DB);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE capture_sessions SET device_count = MAX(device_count, 1), status = 'connected', updated_at = ? WHERE id = ?`)
    .bind(now, id).run();
  if (!result.meta.changes) return json({ error: "촬영 세션을 찾을 수 없습니다." }, 404);
  return json({ ok: true, status: "connected" });
}

async function updateCaptureProgress(id: string, request: Request, env: Env) {
  const body = await request.json() as { stage?: number; completed?: boolean };
  const stage = Math.max(0, Math.min(2, Number(body.stage ?? 0)));
  const status = body.completed ? "completed" : "capturing";
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE capture_sessions SET current_stage = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(stage, status, now, id).run();
  if (!result.meta.changes) return json({ error: "촬영 세션을 찾을 수 없습니다." }, 404);
  return json({ ok: true, status, stage });
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

type CaptureVerificationStatus = "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
const strictTargetCriteria: Record<CaptureCategoryKey, string> = {
  MANUAL_DOOR: "Return O when a regular manually operated door is recognizable. A door leaf together with any visible lever, knob, pull handle, push bar, hinge, latch, or push/pull structure is sufficient. EPS/TPS labels, utility-room labels, nearby cables, a visible threshold, or hidden hinges do not invalidate a manual door. Return X only when no manual door is recognizable or the door is clearly automatic.",
  AUTO_DOOR: "Return O when an automatic door or security door is recognizable from a motion sensor, automatic operator, sliding structure, automatic-door sticker, push button, keypad, or card reader.",
  RAMP: "Return O when an inclined plane or sloped travel surface is recognizable, even if the slope is gentle or handrails are absent.",
  THRESHOLD: "Return O when any small raised edge, bump, curb, step, door sill, or visible floor-level transition that may obstruct a wheel is recognizable. A close-up of the edge is sufficient.",
  FLOOR_MATERIAL: "Return O when enough of the floor is visible to identify or inspect its material, including tile, carpet, wood, concrete, tactile paving, metal grating, uneven surface, or another travel-surface finish.",
  DOOR_GAP: "Return O when a visible gap exists below a door, between elevator sill surfaces, or as a crack/opening in the travel surface that could catch a cane or wheel.",
  ELEVATOR_INSIDE: "Return O when the interior of an elevator cabin is recognizable, including a view taken from inside the cabin looking through an open elevator door. A control panel, display, handrail, mirror, cabin wall, open doorway, or elevator sill may support the decision; one clear cue is sufficient.",
  OTHER: "Return O when a meaningful facility/accessibility obstacle or environmental condition is clearly shown but does not belong to the named categories.",
};

type BinaryVerificationDecision = "O" | "X";

class CaptureAnalysisError extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(code: string, detail: string) {
    super(code);
    this.name = "CaptureAnalysisError";
    this.code = code;
    this.detail = cleanText(detail, 1500) || code;
  }
}

function captureAnalysisErrorDetails(error: unknown) {
  if (error instanceof CaptureAnalysisError) {
    return { code: error.code, detail: error.detail };
  }
  const detail = error instanceof Error ? error.message : String(error || "unknown");
  return { code: "UNKNOWN_ANALYSIS_ERROR", detail: cleanText(detail, 1500) || "unknown" };
}

async function runBinaryTargetVerification(
  analysisBuffer: ArrayBuffer,
  analysisType: string,
  expectedCategory: CaptureCategoryKey,
  env: Env,
) {
  const model = env.GEMINI_VISION_MODEL || "gemini-3.6-flash";
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [
      { text: `You are an expert accessibility and facility inspector. Judge only whether the selected category ${expectedCategory} (${CAPTURE_CATEGORY_LABELS[expectedCategory]}) is visibly present in this image. ${strictTargetCriteria[expectedCategory]} If positive visual evidence for the selected category is visible anywhere as a meaningful subject, return O even when other objects are also present or some details are partially hidden. Return X only when the selected category is absent or the image is unusable. Do not classify it into another category. Return reason in Korean.` },
      { inlineData: { mimeType: analysisType, data: bufferToBase64(analysisBuffer) } },
    ] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          decision: { type: "STRING", enum: ["O", "X"] },
          reason: { type: "STRING" },
        },
        required: ["decision", "reason"],
      },
    },
  });
  let lastError: CaptureAnalysisError | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY || "" },
        body: requestBody,
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new CaptureAnalysisError("GEMINI_HTTP_ERROR", `attempt=${attempt}; model=${model}; status=${response.status}; body=${responseText}`);
      }
      let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        throw new CaptureAnalysisError("GEMINI_RESPONSE_JSON_ERROR", `attempt=${attempt}; model=${model}; body=${responseText}`);
      }
      const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
      if (!raw) {
        throw new CaptureAnalysisError("GEMINI_EMPTY_RESULT", `attempt=${attempt}; model=${model}; body=${responseText}`);
      }
      let parsed: { decision?: BinaryVerificationDecision; reason?: string };
      try {
        parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as typeof parsed;
      } catch {
        throw new CaptureAnalysisError("GEMINI_DECISION_PARSE_ERROR", `attempt=${attempt}; model=${model}; result=${raw}`);
      }
      if (parsed.decision !== "O" && parsed.decision !== "X") {
        throw new CaptureAnalysisError("GEMINI_INVALID_DECISION", `attempt=${attempt}; model=${model}; result=${raw}`);
      }
      return {
        decision: parsed.decision,
        confidence: null,
        reason: cleanText(parsed.reason, 300) || "O/X 판정 근거가 제공되지 않았습니다.",
      };
    } catch (error) {
      const details = captureAnalysisErrorDetails(error);
      lastError = error instanceof CaptureAnalysisError
        ? error
        : new CaptureAnalysisError("GEMINI_REQUEST_ERROR", `attempt=${attempt}; model=${model}; detail=${details.detail}`);
      if (attempt < 2) continue;
    }
  }
  throw lastError || new CaptureAnalysisError("GEMINI_UNKNOWN_ERROR", `model=${model}`);
}

async function verifyCaptureCategory(file: File, expectedCategory: CaptureCategoryKey, env: Env) {
  if (!env.GEMINI_API_KEY) throw new Error("사진 판독용 생성형 AI 설정이 필요합니다.");
  const originalBuffer = await file.arrayBuffer();
  let analysisBuffer = originalBuffer;
  let analysisType = file.type || "image/jpeg";
  try {
    const imageOutput = await env.IMAGES
      .input(new Blob([originalBuffer], { type: analysisType }).stream())
      .transform({ width: 1600, height: 1600, fit: "scale-down" })
      .output({ format: "image/jpeg", quality: 82 });
    const optimized = await imageOutput.response();
    if (optimized.ok) {
      analysisBuffer = await optimized.arrayBuffer();
      analysisType = "image/jpeg";
    }
  } catch {
    if (originalBuffer.byteLength > 8 * 1024 * 1024) throw new Error("AI 판독을 위해 사진 크기를 줄인 뒤 다시 촬영해주세요.");
  }

  const binaryVerification = await runBinaryTargetVerification(analysisBuffer, analysisType, expectedCategory, env);
  const approved = binaryVerification.decision === "O";
  const status: CaptureVerificationStatus = approved ? "VERIFIED" : "REJECTED";
  const evidence = [
    `binary_decision=${binaryVerification.decision}`,
    "verification_mode=selected_category_only",
    "attempts=up_to_2",
  ];
  return {
    originalBuffer,
    status,
    detectedCategory: approved ? expectedCategory : "NOT_EXPECTED",
    imageUsable: true,
    evidence,
    confidence: binaryVerification.confidence,
    reason: approved
      ? `O 판정: ${CAPTURE_CATEGORY_LABELS[expectedCategory]} 항목으로 승인했습니다. ${binaryVerification.reason}`
      : `X 판정: ${CAPTURE_CATEGORY_LABELS[expectedCategory]} 항목으로 승인하지 않았습니다. ${binaryVerification.reason}`,
  };
}

async function ensurePhotoBucket(supabase: AdminSupabaseClient, bucket: string) {
  const { data } = await supabase.storage.getBucket(bucket);
  if (data) return;
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 12 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

async function uploadCapturePhoto(id: string, request: Request, env: Env) {
  await ensureSchema(env.DB);
  const session = await env.DB.prepare("SELECT id FROM capture_sessions WHERE id = ?").bind(id).first();
  if (!session) return json({ error: "촬영 세션을 찾을 수 없습니다." }, 404);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "업로드할 사진이 없습니다." }, 400);
  if (!file.type.startsWith("image/")) return json({ error: "이미지 파일만 업로드할 수 있습니다." }, 415);
  if (file.size > 12 * 1024 * 1024) return json({ error: "사진은 12MB 이하만 업로드할 수 있습니다." }, 413);
  const stage = Math.max(0, Math.min(2, Number(form.get("stage") ?? 0)));
  const rawCategory = String(form.get("category") || "").trim().slice(0, 40);
  if (!rawCategory) return json({ error: "촬영 항목을 선택해주세요." }, 400);
  const category = toCaptureCategoryKey(rawCategory);
  const slopeAngleRaw = form.get("slopeAngle");
  const slopeAngle = slopeAngleRaw === null || slopeAngleRaw === "" ? null : Number(slopeAngleRaw);
  const originalBuffer = await file.arrayBuffer();
  const supabase = supabaseAdmin(env);
  if (!supabase) return json({ error: "사진 저장소 설정이 완료되지 않았습니다." }, 503);
  const photoId = crypto.randomUUID().replaceAll("-", "");
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "jpg";
  const objectKey = `captures/${id}/${photoId}.${extension}`;
  const bucket = "door-images";
  const supabasePath = `captures/${id}/${photoId}.${extension}`;
  try {
    await ensurePhotoBucket(supabase, bucket);
    const { error: storageError } = await supabase.storage.from(bucket).upload(supabasePath, originalBuffer, {
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
    if (storageError) throw storageError;
  } catch (error) {
    await supabase.storage.from(bucket).remove([supabasePath]).catch(() => undefined);
    console.error("Photo storage failed", (error as { message?: string }).message || "unknown");
    return json({ error: "사진을 Supabase door-images 버킷에 저장하지 못했습니다." }, 502);
  }
  // R2 사본은 선택 사항이다. 바인딩이 없거나 쓰기가 실패해도 Supabase에
  // 저장된 원본이 정본이므로 업로드를 되돌리지 않는다.
  if (env.CAPTURE_BUCKET) {
    try {
      await env.CAPTURE_BUCKET.put(objectKey, originalBuffer, {
        httpMetadata: { contentType: file.type || "image/jpeg" },
        customMetadata: {
          sessionId: id,
          stage: String(stage),
          category,
          aiStatus: "UPLOADED",
        },
      });
    } catch (error) {
      console.error("R2 mirror failed", (error as { message?: string }).message || "unknown");
    }
  }
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`INSERT INTO capture_photos
      (id, session_id, object_key, stage, category, file_name, content_type, size, slope_angle,
       ai_verified, ai_detected_category, ai_confidence, ai_reason, ai_status, ai_evidence,
       supabase_path, supabase_bucket, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, 'UPLOADED', NULL, ?, ?, ?)`)
      .bind(photoId, id, objectKey, stage, category, file.name || `capture-${photoId}.jpg`, file.type || "image/jpeg", file.size, slopeAngle,
        supabasePath, bucket, now)
      .run();
  } catch (error) {
    await Promise.allSettled([
      env.CAPTURE_BUCKET ? env.CAPTURE_BUCKET.delete(objectKey) : Promise.resolve(),
      supabase.storage.from(bucket).remove([supabasePath]),
    ]);
    console.error("Photo metadata save failed", (error as { message?: string }).message || "unknown");
    return json({ error: "사진 정보 저장을 완료하지 못했습니다." }, 502);
  }
  await env.DB.prepare(`INSERT INTO capture_observations
    (id, session_id, stage, category, slope_angle, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, stage, category) DO UPDATE SET
      slope_angle = COALESCE(excluded.slope_angle, capture_observations.slope_angle), updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID().replaceAll("-", ""), id, stage, category, slopeAngle, now, now)
    .run();
  await env.DB.prepare("UPDATE capture_sessions SET status = 'capturing', current_stage = ?, updated_at = ? WHERE id = ?")
    .bind(stage, now, id).run();
  return json({
    id: photoId,
    stage,
    category,
    url: `/api/capture-photos/${photoId}`,
    slopeAngle,
    status: "UPLOADED",
    bucket,
  }, 201);
}

async function analyzeStoredCapturePhoto(photoId: string, env: Env) {
  await ensureSchema(env.DB);
  const photo = await env.DB.prepare(`SELECT p.id, p.session_id AS sessionId, p.stage, p.category,
    p.file_name AS fileName, p.content_type AS contentType, p.supabase_path AS supabasePath,
    p.supabase_bucket AS supabaseBucket FROM capture_photos p WHERE p.id = ?`)
    .bind(photoId).first<Record<string, unknown>>();
  if (!photo) return json({ error: "분석할 사진을 찾을 수 없습니다." }, 404);
  const supabase = supabaseAdmin(env);
  if (!supabase) return json({ error: "사진 저장소 설정이 완료되지 않았습니다." }, 503);
  const bucket = cleanText(photo.supabaseBucket, 120) || "door-images";
  const path = cleanText(photo.supabasePath, 700);
  if (!path) return json({ error: "Supabase 사진 경로가 없습니다." }, 404);
  const { data: storedImage, error: downloadError } = await supabase.storage.from(bucket).download(path);
  if (downloadError || !storedImage) return json({ error: "Supabase에 저장된 사진을 다시 불러오지 못했습니다." }, 502);

  const category = toCaptureCategoryKey(photo.category);
  const stage = Math.max(0, Math.min(2, Number(photo.stage || 0)));
  let verification: Awaited<ReturnType<typeof verifyCaptureCategory>>;
  try {
    const storedFile = new File([storedImage], cleanText(photo.fileName, 200) || `${photoId}.jpg`, {
      type: cleanText(photo.contentType, 100) || storedImage.type || "image/jpeg",
    });
    verification = await verifyCaptureCategory(storedFile, category, env);
  } catch (error) {
    const analyzedAt = new Date().toISOString();
    const internalError = captureAnalysisErrorDetails(error);
    const internalReason = `${internalError.code}: ${internalError.detail}`;
    console.error("Stored capture AI analysis failed", JSON.stringify({
      photoId,
      sessionId: photo.sessionId,
      stage,
      category,
      code: internalError.code,
      detail: internalError.detail,
    }));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO capture_verification_attempts
        (id, session_id, stage, category, status, confidence, image_usable, evidence, reason, created_at)
        VALUES (?, ?, ?, ?, 'NEEDS_REVIEW', NULL, 1, ?, ?, ?)`)
        .bind(crypto.randomUUID().replaceAll("-", ""), photo.sessionId, stage, category,
          JSON.stringify([`error_code=${internalError.code}`, "attempts=2"]), internalReason, analyzedAt),
      env.DB.prepare(`UPDATE capture_photos SET ai_verified = 0, ai_status = 'NEEDS_REVIEW', ai_reason = ?, ai_evidence = ? WHERE id = ?`)
        .bind(internalReason, JSON.stringify([`error_code=${internalError.code}`, "attempts=2"]), photoId),
    ]);
    const publicReason = "사진 저장은 완료됐으며 AI 판독을 자동으로 다시 확인할 예정입니다.";
    return json({
      id: photoId,
      verification: { matched: false, status: "NEEDS_REVIEW", selectedCategory: category, detectedCategory: category, confidence: null, evidence: [], reason: publicReason },
    });
  }

  const analyzedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO capture_verification_attempts
      (id, session_id, stage, category, status, confidence, image_usable, evidence, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID().replaceAll("-", ""), photo.sessionId, stage, category, verification.status,
        verification.confidence, verification.imageUsable ? 1 : 0, JSON.stringify(verification.evidence), verification.reason, analyzedAt),
    env.DB.prepare(`UPDATE capture_photos SET ai_verified = ?, ai_detected_category = ?, ai_confidence = ?,
      ai_reason = ?, ai_status = ?, ai_evidence = ? WHERE id = ?`)
      .bind(verification.status === "VERIFIED" ? 1 : 0, verification.detectedCategory, verification.confidence,
        verification.reason, verification.status, JSON.stringify(verification.evidence), photoId),
  ]);
  return json({
    id: photoId,
    verification: {
      matched: verification.status === "VERIFIED",
      status: verification.status,
      selectedCategory: category,
      detectedCategory: verification.detectedCategory,
      confidence: verification.confidence,
      evidence: verification.evidence,
      reason: verification.reason,
    },
  });
}

async function saveCaptureObservation(id: string, request: Request, env: Env) {
  await ensureSchema(env.DB);
  const session = await env.DB.prepare("SELECT id FROM capture_sessions WHERE id = ?").bind(id).first();
  if (!session) return json({ error: "촬영 세션을 찾을 수 없습니다." }, 404);
  const body = await request.json() as { stage?: number; category?: string; slopeAngle?: number | null };
  const stage = Math.max(0, Math.min(2, Number(body.stage ?? 0)));
  const rawCategory = String(body.category || "").trim().slice(0, 40);
  if (!rawCategory) return json({ error: "저장할 촬영 항목이 없습니다." }, 400);
  const category = toCaptureCategoryKey(rawCategory);
  const slopeAngle = body.slopeAngle == null ? null : Math.max(0, Math.min(90, Number(body.slopeAngle)));
  const now = new Date().toISOString();
  const observationId = crypto.randomUUID().replaceAll("-", "");
  await env.DB.prepare(`INSERT INTO capture_observations
    (id, session_id, stage, category, slope_angle, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, stage, category) DO UPDATE SET
      slope_angle = COALESCE(excluded.slope_angle, capture_observations.slope_angle), updated_at = excluded.updated_at`)
    .bind(observationId, id, stage, category, slopeAngle, now, now)
    .run();
  return json({ id: observationId, stage, category, slopeAngle }, 201);
}

async function serveCapturePhoto(photoId: string, env: Env) {
  await ensureSchema(env.DB);
  const photo = await env.DB.prepare(`SELECT object_key AS objectKey, content_type AS contentType,
    supabase_path AS supabasePath, supabase_bucket AS supabaseBucket FROM capture_photos WHERE id = ?`)
    .bind(photoId).first<{ objectKey: string; contentType: string; supabasePath?: string; supabaseBucket?: string }>();
  if (!photo) return new Response("Not found", { status: 404 });
  const supabase = supabaseAdmin(env);
  if (supabase && photo.supabasePath) {
    const bucket = photo.supabaseBucket || "door-images";
    const { data } = await supabase.storage.from(bucket).download(photo.supabasePath);
    if (data) return new Response(data.stream(), {
      headers: { "content-type": photo.contentType, "cache-control": "private, max-age=300" },
    });
  }
  const object = env.CAPTURE_BUCKET ? await env.CAPTURE_BUCKET.get(photo.objectKey) : null;
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", photo.contentType);
  headers.set("cache-control", "private, max-age=300");
  return new Response(object.body, { headers });
}

async function searchKakao(request: Request, env: Env) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return json({ documents: [] });
  if (!env.KAKAO_REST_API_KEY) {
    return json({ error: "KAKAO_REST_API_KEY가 설정되지 않았습니다." }, 503);
  }
  const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  kakaoUrl.searchParams.set("query", query);
  kakaoUrl.searchParams.set("size", "15");
  kakaoUrl.searchParams.set("sort", "accuracy");
  const response = await fetch(kakaoUrl, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
  });
  if (!response.ok) return json({ error: "카카오 장소검색에 연결하지 못했습니다." }, response.status);
  const data = await response.json() as { documents: Array<Record<string, string>> };
  return json({
    documents: data.documents.map((item) => ({
      id: item.id,
      name: item.place_name,
      category: item.category_name || "장소",
      categoryGroup: item.category_group_name,
      address: item.road_address_name || item.address_name,
      lot: item.address_name,
      phone: item.phone,
      placeUrl: item.place_url,
      x: item.x,
      y: item.y,
    })),
  });
}

async function analyzeFacility(request: Request, env: Env) {
  if (!env.KAKAO_REST_API_KEY) return json({ error: "카카오 장소검색 설정이 필요합니다." }, 503);
  const body = await request.json() as { name?: string; address?: string; x?: string; y?: string };
  if (!body.name || !body.x || !body.y) return json({ error: "시설 위치 정보가 부족합니다." }, 400);

  const kakaoHeaders = { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` };
  const restaurantIds = new Set<string>();
  const restaurantDocuments: Array<Record<string, string>> = [];
  let restaurantCountLowerBound = false;
  for (let page = 1; page <= 3; page += 1) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
    url.searchParams.set("category_group_code", "FD6");
    url.searchParams.set("x", body.x);
    url.searchParams.set("y", body.y);
    url.searchParams.set("radius", "2000");
    url.searchParams.set("sort", "distance");
    url.searchParams.set("size", "15");
    url.searchParams.set("page", String(page));
    const response = await fetch(url, { headers: kakaoHeaders });
    if (!response.ok) return json({ error: "주변 음식점 정보를 불러오지 못했습니다." }, response.status);
    const data = await response.json() as { meta?: { is_end?: boolean }; documents?: Array<Record<string, string>> };
    (data.documents || []).forEach((item) => {
      if (item.id && !restaurantIds.has(item.id)) restaurantDocuments.push(item);
      if (item.id) restaurantIds.add(item.id);
    });
    restaurantCountLowerBound = page === 3 && !data.meta?.is_end;
    if (data.meta?.is_end) break;
  }

  const normalizedHotelAddress = cleanText(body.address, 300).replace(/\s|\([^)]*\)/g, "");
  const sameAddressCandidates = restaurantDocuments.filter((item) => {
    const candidateAddress = cleanText(item.road_address_name || item.address_name, 300).replace(/\s|\([^)]*\)/g, "");
    return normalizedHotelAddress && candidateAddress === normalizedHotelAddress;
  }).slice(0, 10).map((item) => ({
    id: item.id,
    name: item.place_name,
    category: item.category_name || "음식점",
    address: item.road_address_name || item.address_name,
    floor: "층수 확인 필요",
    placeUrl: item.place_url,
    source: "Kakao Local · 동일 도로명주소",
    confidence: "confirmation_required",
  }));

  let websiteAnalysis: {
    status: "found" | "not_found" | "unavailable";
    officialWebsite: string;
    fnbFound: boolean;
    venues: Array<{ name: string; floor: string; sourceUrl: string }>;
    note: string;
  } = {
    status: env.OPENAI_API_KEY ? "not_found" : "unavailable",
    officialWebsite: "",
    fnbFound: false,
    venues: [],
    note: env.OPENAI_API_KEY ? "공식 홈페이지에서 검증 가능한 F&B 정보를 찾지 못했습니다." : "생성형 AI 웹 검색 설정이 필요합니다.",
  };

  if (env.OPENAI_API_KEY) {
    const websiteSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        website_found: { type: "boolean" },
        official_website: { type: "string" },
        fnb_found: { type: "boolean" },
        venues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { name: { type: "string" }, floor: { type: "string" }, source_url: { type: "string" } },
            required: ["name", "floor", "source_url"],
          },
        },
        note: { type: "string" },
      },
      required: ["website_found", "official_website", "fnb_found", "venues", "note"],
    } as const;
    try {
      const websiteResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.6-luna",
          store: false,
          tools: [{ type: "web_search" }],
          input: [{ role: "user", content: [{ type: "input_text", text: `호텔명: ${body.name}\n주소: ${body.address}\n이 호텔의 공식 홈페이지 도메인만 찾아 해당 홈페이지에 명시된 호텔 내부 레스토랑·바·라운지·카페 이름과 층수를 확인하세요. 공식 홈페이지가 아닌 블로그, 예약 플랫폼, 지도 리뷰는 근거로 쓰지 마세요. 층수가 공식 페이지에 없으면 반드시 '층수 확인 필요'로 쓰고 추정하지 마세요. 공식 홈페이지를 찾지 못하면 website_found=false로 반환하세요.` }] }],
          text: { format: { type: "json_schema", name: "hotel_official_fnb", strict: true, schema: websiteSchema } },
        }),
      });
      if (websiteResponse.ok) {
        const responseData = await websiteResponse.json() as Record<string, unknown>;
        const parsed = JSON.parse(extractResponseText(responseData)) as {
          website_found: boolean; official_website: string; fnb_found: boolean;
          venues: Array<{ name: string; floor: string; source_url: string }>; note: string;
        };
        let officialHost = "";
        try {
          const officialUrl = new URL(parsed.official_website);
          if (["http:", "https:"].includes(officialUrl.protocol)) officialHost = officialUrl.hostname.replace(/^www\./, "");
        } catch { officialHost = ""; }
        const officialVenues = (parsed.venues || []).filter((venue) => {
          try {
            const sourceHost = new URL(venue.source_url).hostname.replace(/^www\./, "");
            return Boolean(officialHost && (sourceHost === officialHost || sourceHost.endsWith(`.${officialHost}`)));
          } catch { return false; }
        });
        websiteAnalysis = {
          status: parsed.website_found && officialHost ? "found" : "not_found",
          officialWebsite: officialHost ? cleanText(parsed.official_website, 500) : "",
          fnbFound: parsed.fnb_found && officialVenues.length > 0,
          venues: officialVenues.slice(0, 12).map((venue) => ({
            name: cleanText(venue.name, 160),
            floor: cleanText(venue.floor, 80) || "층수 확인 필요",
            sourceUrl: cleanText(venue.source_url, 500),
          })).filter((venue) => venue.name && venue.sourceUrl),
          note: cleanText(parsed.note, 300),
        };
      } else {
        websiteAnalysis = { ...websiteAnalysis, status: "unavailable", note: "공식 홈페이지 AI 확인 요청에 연결하지 못했습니다." };
      }
    } catch {
      websiteAnalysis = { ...websiteAnalysis, status: "unavailable", note: "공식 홈페이지 분석 결과를 검증하지 못했습니다." };
    }
  }

  const websiteCandidates = websiteAnalysis.venues.map((venue, index) => ({
    id: `official-${index}`,
    name: venue.name,
    category: "호텔 공식 F&B",
    address: body.address || "",
    floor: venue.floor,
    placeUrl: venue.sourceUrl,
    source: "호텔 공식 홈페이지",
    confidence: "official",
  }));
  const internalCandidates = websiteCandidates.length ? websiteCandidates : sameAddressCandidates;

  return json({
    restaurantCount: restaurantIds.size,
    restaurantCountLowerBound,
    restaurantSearchLimit: 45,
    externalDeliveryEligible: restaurantIds.size > 20,
    internalCandidates,
    internalFnbStatus: websiteAnalysis.fnbFound ? "confirmed" : internalCandidates.length ? "confirmation_required" : "unknown",
    websiteAnalysis,
    gisFallback: {
      status: websiteAnalysis.status === "found" ? "not_needed" : "api_key_required",
      candidateCount: sameAddressCandidates.length,
      note: websiteAnalysis.status !== "found"
        ? "GIS 건물 폴리곤 검증에는 별도의 VWorld GIS API 키가 필요합니다. 현재는 동일 도로명주소 후보만 표시합니다."
        : "공식 홈페이지 결과를 우선 사용합니다.",
    },
  });
}

type KakaoRegionDocument = { region_type?: string; code?: string; address_name?: string };
type KakaoAddressDocument = {
  address?: { mountain_yn?: string; main_address_no?: string; sub_address_no?: string; address_name?: string };
  road_address?: { address_name?: string };
};

function formatApprovalDate(value: unknown) {
  const clean = String(value || "").replace(/\D/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6, 8)}` : "확인 필요";
}

async function getBuildingRegister(request: Request, env: Env) {
  if (!env.BUILDING_REGISTER_API_KEY) return json({ status: "unavailable", error: "건축물대장 API 설정이 필요합니다." }, 503);
  if (!env.KAKAO_REST_API_KEY) return json({ status: "unavailable", error: "주소 변환 설정이 필요합니다." }, 503);
  const body = await request.json() as { name?: string; address?: string; lot?: string; x?: string; y?: string };
  let x = cleanText(body.x, 40);
  let y = cleanText(body.y, 40);
  const lookupAddress = cleanText(body.lot || body.address, 300);
  const kakaoHeaders = { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` };

  if ((!x || !y) && lookupAddress) {
    const addressSearch = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    addressSearch.searchParams.set("query", lookupAddress);
    const addressSearchResponse = await fetch(addressSearch, { headers: kakaoHeaders });
    if (addressSearchResponse.ok) {
      const addressSearchData = await addressSearchResponse.json() as { documents?: Array<{ x?: string; y?: string }> };
      x = cleanText(addressSearchData.documents?.[0]?.x, 40);
      y = cleanText(addressSearchData.documents?.[0]?.y, 40);
    }
  }
  if (!x || !y) return json({ status: "not_found", error: "정확한 건물 좌표를 확인할 수 없습니다." });

  const regionUrl = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  regionUrl.searchParams.set("x", x);
  regionUrl.searchParams.set("y", y);
  const addressUrl = new URL("https://dapi.kakao.com/v2/local/geo/coord2address.json");
  addressUrl.searchParams.set("x", x);
  addressUrl.searchParams.set("y", y);
  const [regionResponse, addressResponse] = await Promise.all([
    fetch(regionUrl, { headers: kakaoHeaders }),
    fetch(addressUrl, { headers: kakaoHeaders }),
  ]);
  if (!regionResponse.ok || !addressResponse.ok) return json({ status: "unavailable", error: "건물 주소를 행정코드로 변환하지 못했습니다." }, 502);
  const regionData = await regionResponse.json() as { documents?: KakaoRegionDocument[] };
  const addressData = await addressResponse.json() as { documents?: KakaoAddressDocument[] };
  const legalRegion = regionData.documents?.find((item) => item.region_type === "B");
  const landAddress = addressData.documents?.find((item) => item.address)?.address;
  const legalCode = cleanText(legalRegion?.code, 10);
  if (legalCode.length !== 10 || !landAddress?.main_address_no) {
    return json({ status: "not_found", error: "법정동 코드 또는 지번을 확인할 수 없습니다." });
  }

  const serviceKey = decodeURIComponent(env.BUILDING_REGISTER_API_KEY);
  const registerUrl = new URL("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo");
  const mainNumber = String(landAddress.main_address_no).padStart(4, "0");
  const subNumber = String(landAddress.sub_address_no || "0").padStart(4, "0");
  Object.entries({
    serviceKey,
    sigunguCd: legalCode.slice(0, 5),
    bjdongCd: legalCode.slice(5),
    platGbCd: landAddress.mountain_yn === "Y" ? "1" : "0",
    bun: mainNumber,
    ji: subNumber,
    _type: "json",
    numOfRows: "100",
    pageNo: "1",
  }).forEach(([key, value]) => registerUrl.searchParams.set(key, value));
  const registerResponse = await fetch(registerUrl, { headers: { accept: "application/json" } });
  const responseText = await registerResponse.text();
  if (!registerResponse.ok) return json({ status: "unavailable", error: "건축물대장 서비스에 연결하지 못했습니다." }, 502);
  let registerData: Record<string, unknown>;
  try { registerData = JSON.parse(responseText) as Record<string, unknown>; }
  catch { return json({ status: "unavailable", error: "건축물대장 응답을 읽지 못했습니다." }, 502); }
  const response = jsonObject(registerData.response);
  const header = jsonObject(response.header);
  if (String(header.resultCode || "00") !== "00") {
    return json({ status: "unavailable", error: cleanText(header.resultMsg, 200) || "건축물대장 조회에 실패했습니다." }, 502);
  }
  const responseBody = jsonObject(response.body);
  const itemsContainer = jsonObject(responseBody.items);
  const rawItems = itemsContainer.item;
  const items = (Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []).map((entry) => jsonObject(entry));
  if (!items.length) {
    return json({
      status: "not_found",
      legalAddress: landAddress.address_name || legalRegion?.address_name || lookupAddress,
      lotNumber: `${Number(mainNumber)}${Number(subNumber) ? `-${Number(subNumber)}` : ""}`,
      error: "해당 지번에서 공개된 표제부를 찾지 못했습니다.",
    });
  }
  const placeName = cleanText(body.name, 180).replace(/\s/g, "").toLowerCase();
  const ranked = [...items].sort((a, b) => {
    const aName = cleanText(a.bldNm, 180).replace(/\s/g, "").toLowerCase();
    const bName = cleanText(b.bldNm, 180).replace(/\s/g, "").toLowerCase();
    const aNameMatch = placeName && (placeName.includes(aName) || aName.includes(placeName)) ? 1 : 0;
    const bNameMatch = placeName && (placeName.includes(bName) || bName.includes(placeName)) ? 1 : 0;
    if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch;
    const aMain = String(a.mainAtchGbCd || "") === "0" ? 1 : 0;
    const bMain = String(b.mainAtchGbCd || "") === "0" ? 1 : 0;
    if (aMain !== bMain) return bMain - aMain;
    return Number(b.totArea || 0) - Number(a.totArea || 0);
  });
  const item = ranked[0];
  const parkingCount = ["indrMechUtcnt", "oudrMechUtcnt", "indrAutoUtcnt", "oudrAutoUtcnt"]
    .reduce((sum, key) => sum + Number(item[key] || 0), 0);
  const roomCount = ["roomCnt", "guestRoomCnt", "hotelRoomCnt", "lodgingRoomCnt", "hoCnt"]
    .map((key) => Number(item[key] || 0))
    .find((value) => Number.isFinite(value) && value > 0) || 0;
  return json({
    status: "found",
    source: "국토교통부 건축HUB 건축물대장",
    matchedBuildingCount: items.length,
    legalAddress: cleanText(item.platPlc, 300) || landAddress.address_name,
    roadAddress: cleanText(item.newPlatPlc, 300) || null,
    buildingName: cleanText(item.bldNm, 180) || cleanText(body.name, 180) || "건축물",
    registerKind: cleanText(item.regstrKindCdNm, 80) || "표제부",
    mainPurpose: cleanText(item.mainPurpsCdNm, 120) || cleanText(item.etcPurps, 120) || "확인 필요",
    structure: cleanText(item.strctCdNm, 120) || cleanText(item.etcStrct, 120) || "확인 필요",
    groundFloors: Number(item.grndFlrCnt || 0),
    undergroundFloors: Number(item.ugrndFlrCnt || 0),
    totalArea: Number(item.totArea || 0),
    buildingArea: Number(item.archArea || 0),
    buildingCoverageRatio: Number(item.bcRat || 0),
    floorAreaRatio: Number(item.vlRat || 0),
    height: Number(item.heit || 0),
    approvalDate: formatApprovalDate(item.useAprDay),
    elevatorCount: Number(item.rideUseElvtCnt || 0) + Number(item.emgenUseElvtCnt || 0),
    parkingCount,
    householdCount: Number(item.hhldCnt || 0),
    roomCount,
    ledgerCreatedDate: formatApprovalDate(item.crtnDay),
  });
}

const interviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistant_message: { type: "string" },
    requirement_summary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          problem: { type: "string" },
          department: { type: "string" },
          time_window: { type: "string", enum: ["night", "morning", "afternoon", "evening", "peak", "unknown"] },
          goal: { type: "string" },
        },
        required: ["problem", "department", "time_window", "goal"],
      },
    },
    detected_services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          service_id: { type: "string", enum: ["concierge", "staff_logistics", "hotel_fnb", "outsourced_fnb", "external_delivery", "luggage", "guidance"] },
          fit_score: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["service_id", "fit_score", "reason", "evidence", "confidence"],
      },
    },
    follow_up_questions: { type: "array", items: { type: "string" } },
    next_action: { type: "string", enum: ["continue_interview", "ready_for_recommendation"] },
  },
  required: ["assistant_message", "requirement_summary", "detected_services", "follow_up_questions", "next_action"],
} as const;

function extractResponseText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output as Array<{ content?: Array<{ type?: string; text?: string }> }>) {
    const content = item.content || [];
    const part = content.find((entry) => entry.type === "output_text" && typeof entry.text === "string");
    if (part?.text) return part.text;
  }
  return "";
}

function extractGeminiText(data: Record<string, unknown>) {
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  for (const candidate of candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>) {
    const text = (candidate.content?.parts || []).map((part) => part.text || "").join("").trim();
    if (text) return text;
  }
  return "";
}

async function aiInterview(request: Request, env: Env) {
  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return json({ error: "생성형 AI가 설정되지 않아 간이 분석 모드로 전환합니다.", fallback: true }, 503);
  const body = await request.json() as {
    message?: string;
    mode?: "requirements" | "question";
    facility?: Record<string, unknown>;
    facilityContext?: Record<string, unknown>;
    conversation?: Array<{ role: string; text: string }>;
  };
  const message = String(body.message || "").trim();
  if (!message) return json({ error: "분석할 문장이 없습니다." }, 400);
  const serviceIds = ["concierge", "staff_logistics", "hotel_fnb", "outsourced_fnb", "external_delivery", "luggage", "guidance"];
  const serviceNames: Record<string, string> = {
    concierge: "컨시어지 서비스",
    staff_logistics: "직원간 물류 이동",
    hotel_fnb: "호텔 식음 배달",
    outsourced_fnb: "외주 F&B 배달",
    external_delivery: "외부 배달 중개",
    luggage: "짐 운반",
    guidance: "객실 안내",
  };
  const serviceGuide = serviceIds.map((id) => `${id}=${serviceNames[id]}`).join(", ");
  const systemPrompt = `당신은 BRING Pre-Map의 호텔 운영 인터뷰 AI입니다. 제공된 시설 데이터와 고객 발화만 사용하세요. detected_services의 service_id는 ${serviceIds.join(", ")} 중에서만 선택하세요. 서비스명 매핑은 ${serviceGuide}입니다. 고객에게 보여주는 assistant_message에는 영문 ID나 snake_case를 절대 쓰지 말고 반드시 한국어 서비스명만 사용하세요. requirements 모드에서는 고객 상황을 이해한 뒤 반드시 '말씀하신 업무/상황은 [한국어 서비스명]을 통해 솔루션 제공이 가능합니다.'라는 명확한 결론을 포함하고, 필요한 확인 질문을 한 가지만 덧붙이세요. evidence는 고객 발화에 실제로 포함된 연속 문자열이어야 합니다. 외부 배달 중개는 facilityContext.externalDeliveryEligible=false이면 추천하지 마세요. 호텔 식음 배달은 공식 홈페이지 F&B 확인 결과나 고객의 직접 요구가 있을 때만 추천하세요. mode가 question이면 GPT·Claude 같은 일반 대화형 답변으로 자유롭게 설명하되 detected_services는 빈 배열로 반환하고 기존 요구 점수를 바꾸지 마세요. 확인되지 않은 매장, 층, 운영시간, 설치 가능성을 만들지 말고 현장 확인 필요라고 설명하세요.`;
  let lastError = "생성형 AI 응답을 검증하지 못했습니다.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const useGemini = Boolean(env.GEMINI_API_KEY);
    const response = useGemini
      ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || "gemini-3.5-flash")}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY || "" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify({ ...body, message }) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseJsonSchema: interviewSchema,
          },
        }),
      })
      : await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.6-luna",
          store: false,
          input: [
            { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
            { role: "user", content: [{ type: "input_text", text: JSON.stringify({ ...body, message }) }] },
          ],
          text: { format: { type: "json_schema", name: "bring_interview", strict: true, schema: interviewSchema } },
        }),
      });
    if (!response.ok) {
      lastError = "생성형 AI 호출에 실패했습니다.";
      continue;
    }
    const data = await response.json() as Record<string, unknown>;
    try {
      const parsed = JSON.parse(useGemini ? extractGeminiText(data) : extractResponseText(data)) as {
        assistant_message: string;
        detected_services: Array<{ service_id: string; evidence: string; fit_score: number }>;
      } & Record<string, unknown>;
      parsed.detected_services = (parsed.detected_services || []).filter((item) =>
        serviceIds.includes(item.service_id) && item.evidence && message.includes(item.evidence)
      );
      parsed.assistant_message = String(parsed.assistant_message || "");
      for (const [id, name] of Object.entries(serviceNames)) {
        parsed.assistant_message = parsed.assistant_message.replaceAll(id, name);
      }
      return json({ ...parsed, mode: "generative", provider: useGemini ? "gemini" : "openai" });
    } catch {
      lastError = "생성형 AI의 구조화 응답을 읽지 못했습니다.";
    }
  }
  return json({ error: lastError, fallback: true }, 502);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/kakao-search" && request.method === "GET") return searchKakao(request, env);
      if (url.pathname === "/api/building-register" && request.method === "POST") return getBuildingRegister(request, env);
      if (url.pathname === "/api/facility-analysis" && request.method === "POST") return analyzeFacility(request, env);
      if (url.pathname === "/api/ai-interview" && request.method === "POST") return aiInterview(request, env);
      if (url.pathname === "/api/supabase-config" && request.method === "GET") {
        if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: "관리자 인증 설정이 없습니다." }, 503);
        return json({ url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
      }
      if (url.pathname === "/api/diagnoses" && request.method === "POST") return saveDiagnosis(request, env);
      if (url.pathname === "/api/consultation-requests" && request.method === "POST") return saveConsultation(request, env);
      if (url.pathname === "/api/admin/session" && request.method === "POST") return verifyAdminSession(request, env);
      if (url.pathname === "/api/admin/diagnoses" && request.method === "GET") return getAdminDiagnoses(request, env);
      if (url.pathname === "/api/capture-sessions" && request.method === "POST") return createCaptureSession(request, env);

      const sessionMatch = url.pathname.match(/^\/api\/capture-sessions\/([a-zA-Z0-9]+)(?:\/(join|route|progress|photos|observations))?$/);
      if (sessionMatch) {
        const [, id, action] = sessionMatch;
        if (!action && request.method === "GET") return getCaptureSession(id, env, url.searchParams.get("scope") === "group");
        if (action === "join" && request.method === "POST") return joinCaptureSession(id, env);
        if (action === "route" && request.method === "POST") return updateCaptureRoute(id, request, env);
        if (action === "progress" && request.method === "POST") return updateCaptureProgress(id, request, env);
        if (action === "photos" && request.method === "POST") return uploadCapturePhoto(id, request, env);
        if (action === "observations" && request.method === "POST") return saveCaptureObservation(id, request, env);
      }

      const photoMatch = url.pathname.match(/^\/api\/capture-photos\/([a-zA-Z0-9]+)$/);
      if (photoMatch && request.method === "GET") return serveCapturePhoto(photoMatch[1], env);
      const photoAnalyzeMatch = url.pathname.match(/^\/api\/capture-photos\/([a-zA-Z0-9]+)\/analyze$/);
      if (photoAnalyzeMatch && request.method === "POST") return analyzeStoredCapturePhoto(photoAnalyzeMatch[1], env);
    } catch (error) {
      console.error(error);
      return json({ error: "요청을 처리하는 중 오류가 발생했습니다." }, 500);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
