import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const captureSessions = sqliteTable("capture_sessions", {
  id: text("id").primaryKey(),
  facilityName: text("facility_name").notNull(),
  facilityType: text("facility_type").notNull(),
  startPoint: text("start_point").notNull(),
  endPoint: text("end_point").notNull(),
  usesElevator: integer("uses_elevator", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("waiting"),
  deviceCount: integer("device_count").notNull().default(0),
  currentStage: integer("current_stage").notNull().default(0),
  rootSessionId: text("root_session_id"),
  routeNumber: integer("route_number").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const capturePhotos = sqliteTable("capture_photos", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  objectKey: text("object_key").notNull(),
  stage: integer("stage").notNull(),
  category: text("category").notNull().default("기준사진"),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  slopeAngle: real("slope_angle"),
  aiVerified: integer("ai_verified", { mode: "boolean" }).notNull().default(false),
  aiDetectedCategory: text("ai_detected_category"),
  aiConfidence: real("ai_confidence"),
  aiReason: text("ai_reason"),
  supabasePath: text("supabase_path"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("idx_capture_photos_session_id").on(table.sessionId),
]);

export const captureObservations = sqliteTable("capture_observations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  stage: integer("stage").notNull(),
  category: text("category").notNull(),
  slopeAngle: real("slope_angle"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_capture_observations_session_id").on(table.sessionId),
  uniqueIndex("idx_capture_observations_session_stage_category").on(table.sessionId, table.stage, table.category),
]);
