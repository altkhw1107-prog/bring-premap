"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { captureCategoryLabel } from "../../lib/capture-categories";

type Diagnosis = {
  id: string;
  facility_name: string;
  facility_type: string;
  facility_address?: string | null;
  status: string;
  progress_percent: number;
  facility_snapshot: Record<string, unknown>;
  interview_snapshot: Record<string, unknown>;
  route_snapshot: Record<string, unknown>;
  analysis_snapshot: Record<string, unknown>;
  recommendation_snapshot: Record<string, unknown>;
  quote_snapshot: Record<string, unknown>;
  created_at: string;
  completed_at?: string | null;
  capture_photos?: CapturePhoto[];
  capture_verification_attempts?: CaptureVerificationAttempt[];
};

type CapturePhoto = {
  id: string;
  stage: number;
  routeNumber?: number;
  category: string;
  fileName?: string;
  aiVerified: boolean;
  aiStatus?: "UPLOADED" | "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
  aiDetectedCategory?: string;
  aiConfidence?: number;
  aiReason?: string;
  aiEvidence?: string;
  signedUrl?: string;
  createdAt: string;
};

type CaptureVerificationAttempt = {
  id: string;
  stage: number;
  routeNumber?: number;
  category: string;
  status: "VERIFIED" | "NEEDS_REVIEW" | "REJECTED";
  confidence?: number;
  imageUsable?: number;
  evidence?: string;
  reason?: string;
  createdAt: string;
};

type Consultation = {
  id: string;
  diagnosis_id: string;
  contact_name: string;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  preferred_contact_method?: string | null;
  status: string;
  created_at: string;
};

const facilityLabels: Record<string, string> = { hotel: "호텔", office: "오피스", apartment: "아파트", hospital: "병원", other: "기타" };

function won(value: unknown) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

function listFrom(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function numberFrom(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function AdminHomeBrand() {
  return (
    <a className="admin-home-link" href="/" aria-label="BRING Pre-Map 메인 첫 페이지로 이동" title="메인 페이지로 이동">
      <span className="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span className="admin-home-wordmark">BRING <b>PRE-MAP</b></span>
    </a>
  );
}

export default function AdminPage() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [mode, setMode] = useState<"loading" | "login" | "mfa" | "dashboard">("loading");
  const [email, setEmail] = useState("altkhw1107@gmail.com");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const selected = diagnoses.find((item) => item.id === selectedId) || null;
  const selectedConsultation = consultations.find((item) => item.diagnosis_id === selectedId) || null;
  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return diagnoses.filter((item) => !clean || `${item.facility_name} ${item.facility_address || ""} ${item.id}`.toLowerCase().includes(clean));
  }, [diagnoses, query]);
  const dashboard = useMemo(() => {
    const completed = diagnoses.filter((item) => item.status === "completed").length;
    const consultedDiagnosisIds = new Set(consultations.map((item) => item.diagnosis_id));
    const facilityCounts = new Map<string, number>();
    const serviceCounts = new Map<string, { total: number; initial: number; expansion: number }>();
    let initialTotal = 0;
    let monthlyTotal = 0;
    let quoteCount = 0;
    let photographed = 0;
    let externalDeliveryEligible = 0;

    diagnoses.forEach((item) => {
      facilityCounts.set(item.facility_type, (facilityCounts.get(item.facility_type) || 0) + 1);
      const selectedServices = listFrom(item.recommendation_snapshot?.selected);
      const initialServices = new Set(listFrom(item.recommendation_snapshot?.initialServices));
      selectedServices.forEach((service) => {
        const count = serviceCounts.get(service) || { total: 0, initial: 0, expansion: 0 };
        count.total += 1;
        if (initialServices.has(service)) count.initial += 1;
        else count.expansion += 1;
        serviceCounts.set(service, count);
      });
      const metrics = item.quote_snapshot?.metrics as Record<string, unknown> | undefined;
      const initial = numberFrom(metrics?.initial);
      const monthly = numberFrom(metrics?.monthly);
      if (initial > 0 || monthly > 0) {
        initialTotal += initial;
        monthlyTotal += monthly;
        quoteCount += 1;
      }
      const photoCounts = item.analysis_snapshot?.photoCounts as Record<string, unknown> | undefined;
      if (photoCounts && Object.values(photoCounts).some((count) => numberFrom(count) > 0)) photographed += 1;
      const facilityAnalysis = item.analysis_snapshot?.facilityAnalysis as Record<string, unknown> | undefined;
      if (facilityAnalysis?.externalDeliveryEligible === true) externalDeliveryEligible += 1;
    });

    const facilities = Array.from(facilityCounts, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    const services = Array.from(serviceCounts, ([name, counts]) => ({ name, ...counts })).sort((a, b) => b.total - a.total);
    const completionRate = diagnoses.length ? Math.round((completed / diagnoses.length) * 100) : 0;
    const conversionRate = diagnoses.length ? Math.round((consultedDiagnosisIds.size / diagnoses.length) * 100) : 0;
    return {
      completed,
      completionRate,
      conversionRate,
      consultedDiagnosisIds,
      facilities,
      services,
      quoteCount,
      averageInitial: quoteCount ? initialTotal / quoteCount : 0,
      averageMonthly: quoteCount ? monthlyTotal / quoteCount : 0,
      photographed,
      externalDeliveryEligible,
    };
  }, [diagnoses, consultations]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/supabase-config");
        const config = await response.json() as { url?: string; publishableKey?: string; error?: string };
        if (!response.ok || !config.url || !config.publishableKey) throw new Error(config.error || "관리자 인증 설정을 불러오지 못했습니다.");
        const supabase = createClient(config.url, config.publishableKey);
        if (!active) return;
        setClient(supabase);
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setMode("login");
          return;
        }
        const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal.data?.currentLevel === "aal2") await authorizeAndLoad(supabase, data.session.access_token);
        else await prepareMfa(supabase);
      } catch (caught) {
        if (active) { setError((caught as Error).message); setMode("login"); }
      }
    })();
    return () => { active = false; };
  }, []);

  async function prepareMfa(supabase: SupabaseClient) {
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const verified = factors.data.totp.find((factor) => factor.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setQrCode("");
      setMode("mfa");
      return;
    }
    const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "BRING PreMap 관리자" });
    if (enrolled.error) throw enrolled.error;
    setFactorId(enrolled.data.id);
    setQrCode(enrolled.data.totp.qr_code);
    setMode("mfa");
  }

  async function authorizeAndLoad(supabase: SupabaseClient, token: string) {
    const response = await fetch("/api/admin/diagnoses", { headers: { authorization: `Bearer ${token}` } });
    const data = await response.json() as { diagnoses?: Diagnosis[]; consultations?: Consultation[]; fetchedAt?: string; error?: string };
    if (!response.ok) {
      await supabase.auth.signOut();
      throw new Error(data.error || "관리자 진단 결과를 불러오지 못했습니다.");
    }
    const diagnosisRows = data.diagnoses || [];
    const consultationRows = data.consultations || [];
    setDiagnoses(diagnosisRows);
    setConsultations(consultationRows);
    setSelectedId((current) => diagnosisRows.some((item) => item.id === current) ? current : diagnosisRows[0]?.id || "");
    setUpdatedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date());
    setMode("dashboard");
  }

  async function refreshDashboard() {
    if (!client || refreshing) return;
    setRefreshing(true); setError("");
    try {
      const session = await client.auth.getSession();
      if (!session.data.session) throw new Error("관리자 세션이 만료되었습니다. 다시 로그인해주세요.");
      await authorizeAndLoad(client, session.data.session.access_token);
    } catch (caught) { setError((caught as Error).message); }
    finally { setRefreshing(false); }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true); setError("");
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      await prepareMfa(client);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    if (!client || !factorId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (result.error) throw result.error;
      const session = await client.auth.getSession();
      if (!session.data.session) throw new Error("관리자 세션을 만들지 못했습니다.");
      await authorizeAndLoad(client, session.data.session.access_token);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await client?.auth.signOut();
    setDiagnoses([]); setConsultations([]); setSelectedId(""); setMode("login");
  }

  if (mode !== "dashboard") return (
    <main className="admin-auth-page">
      <AdminHomeBrand />
      <section className="admin-auth-card">
        <p className="eyebrow">SECURE ADMIN ACCESS</p>
        <h1>{mode === "mfa" ? "2단계 인증" : "관리자 로그인"}</h1>
        <p>{mode === "mfa" ? "인증 앱에 표시된 6자리 코드를 입력하세요." : "등록된 관리자 계정만 진단 결과를 확인할 수 있습니다."}</p>
        {mode === "loading" ? <div className="admin-loading"><i></i>보안 설정 확인 중…</div> : mode === "login" ? (
          <form onSubmit={signIn}>
            <label><span>관리자 이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span>비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
            {error && <p className="admin-error">{error}</p>}
            <button className="btn primary wide" disabled={busy}>{busy ? "확인 중…" : "관리자 로그인 →"}</button>
          </form>
        ) : (
          <form onSubmit={verifyMfa}>
            {qrCode && <div className="mfa-enroll"><strong>처음 로그인하셨나요?</strong><p>Google Authenticator, 1Password 또는 Apple 암호 앱으로 QR을 스캔한 뒤 코드를 입력하세요.</p><img src={qrCode} alt="BRING 관리자 TOTP 등록 QR 코드" /></div>}
            <label><span>인증 코드</span><input className="mfa-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required /></label>
            {error && <p className="admin-error">{error}</p>}
            <button className="btn primary wide" disabled={busy || code.length !== 6}>{busy ? "확인 중…" : "인증하고 진단 결과 보기 →"}</button>
          </form>
        )}
        <small>관리자 allowlist · MFA · Row Level Security 적용</small>
      </section>
    </main>
  );

  const recommendation = selected?.recommendation_snapshot || {};
  const quote = selected?.quote_snapshot || {};
  const route = selected?.route_snapshot || {};
  const analysis = selected?.analysis_snapshot || {};
  const selectedServices = listFrom(recommendation.selected);

  return (
    <main className="admin-page">
      <header className="admin-header"><AdminHomeBrand /><div><span>{email}</span><button onClick={signOut}>로그아웃</button></div></header>
      <section className="admin-summary"><div><p className="eyebrow">DIAGNOSIS CONTROL CENTER</p><h1>전체 진단 요약</h1><p>지금까지 저장된 모든 진단과 상담 요청을 한 화면에서 확인합니다.</p></div><div className="admin-kpis"><article><small>전체 진단</small><strong>{diagnoses.length}</strong><span>건</span></article><article><small>완료율</small><strong>{dashboard.completionRate}</strong><span>%</span></article><article><small>상담 전환율</small><strong>{dashboard.conversionRate}</strong><span>%</span></article><article><small>상담 요청</small><strong>{consultations.length}</strong><span>건</span></article></div></section>
      <section className="admin-overview" aria-labelledby="overview-title">
        <div className="admin-overview-head"><div><p className="eyebrow">ALL DIAGNOSES</p><h2 id="overview-title">누적 진단 현황</h2><p>{updatedAt ? `${updatedAt.toLocaleString("ko-KR")} 기준 · ${diagnoses.length.toLocaleString("ko-KR")}건 전체 반영` : "저장된 진단을 집계하고 있습니다."}</p></div><button onClick={refreshDashboard} disabled={refreshing}>{refreshing ? "업데이트 중…" : "↻ 최신 데이터 불러오기"}</button></div>
        {error && <p className="admin-error admin-refresh-error">{error}</p>}
        <div className="admin-overview-grid">
          <section className="admin-insight-card facility-breakdown"><header><span>FACILITY MIX</span><h3>시설 유형별 진단</h3></header><div>{dashboard.facilities.length ? dashboard.facilities.map((item) => { const percent = diagnoses.length ? Math.round((item.count / diagnoses.length) * 100) : 0; return <article key={item.type}><div><strong>{facilityLabels[item.type] || item.type}</strong><span>{item.count}건 · {percent}%</span></div><i><b style={{ width: `${percent}%` }} /></i></article>; }) : <p className="admin-empty">아직 저장된 진단이 없습니다.</p>}</div></section>
          <section className="admin-insight-card service-ranking"><header><span>SERVICE DEMAND</span><h3>추천·선택 서비스 순위</h3></header><div>{dashboard.services.length ? dashboard.services.slice(0, 7).map((item, index) => <article key={item.name}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.name}</strong><span>초기 운영 {item.initial}건 · 확장 운영 {item.expansion}건</span></div><em>{item.total}건</em></article>) : <p className="admin-empty">선택된 서비스 기록이 없습니다.</p>}</div></section>
          <section className="admin-insight-card operation-summary"><header><span>OPERATION SNAPSHOT</span><h3>운영 준비 요약</h3></header><div className="admin-operation-kpis"><article><small>완료 진단</small><strong>{dashboard.completed}</strong><span>{dashboard.completionRate}% 완료</span></article><article><small>사진 기록 포함</small><strong>{dashboard.photographed}</strong><span>진단 결과 기준</span></article><article><small>외부 배달 적합</small><strong>{dashboard.externalDeliveryEligible}</strong><span>2km F&amp;B 기준</span></article><article><small>상담 연결 진단</small><strong>{dashboard.consultedDiagnosisIds.size}</strong><span>{dashboard.conversionRate}% 전환</span></article></div></section>
          <section className="admin-insight-card quote-summary"><header><span>BUDGET SNAPSHOT</span><h3>누적 견적 요약</h3></header><div><article><small>평균 초기 도입비</small><strong>{won(dashboard.averageInitial)}</strong></article><article><small>평균 월 운영비</small><strong>{won(dashboard.averageMonthly)}</strong></article><p>견적이 저장된 {dashboard.quoteCount}건을 기준으로 계산했습니다.</p></div></section>
        </div>
        <section className="admin-recent"><header><div><span>RECENT DIAGNOSES</span><h3>최근 진단 요약</h3></div><small>최신 {Math.min(diagnoses.length, 8)}건</small></header><div className="admin-recent-table"><div className="admin-recent-row admin-recent-labels"><span>진단일</span><span>시설</span><span>선택 서비스</span><span>예비 견적</span><span>상태</span></div>{diagnoses.slice(0, 8).map((item) => { const services = listFrom(item.recommendation_snapshot?.selected); const metrics = item.quote_snapshot?.metrics as Record<string, unknown> | undefined; return <button className="admin-recent-row" key={item.id} onClick={() => { setSelectedId(item.id); document.getElementById("diagnosis-browser")?.scrollIntoView({ behavior: "smooth" }); }}><span>{new Date(item.created_at).toLocaleDateString("ko-KR")}</span><span><b>{item.facility_name}</b><small>{facilityLabels[item.facility_type] || item.facility_type}</small></span><span>{services.slice(0, 2).join(" + ") || "선택 기록 없음"}{services.length > 2 ? ` 외 ${services.length - 2}` : ""}</span><span>{numberFrom(metrics?.initial) ? won(metrics?.initial) : "미산정"}</span><span><em className={dashboard.consultedDiagnosisIds.has(item.id) ? "lead" : item.status === "completed" ? "done" : "progress"}>{dashboard.consultedDiagnosisIds.has(item.id) ? "상담 요청" : item.status === "completed" ? "완료" : "진행 중"}</em></span></button>; })}{!diagnoses.length && <p className="admin-empty">아직 저장된 진단이 없습니다.</p>}</div></section>
      </section>
      <section className="admin-workspace" id="diagnosis-browser">
        <aside className="admin-list"><label><span>⌕</span><input placeholder="시설명·주소 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="admin-list-meta"><strong>진단 목록</strong><span>{filtered.length}건</span></div><div>{filtered.map((item) => <button key={item.id} className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><span>{facilityLabels[item.facility_type] || item.facility_type}</span>{consultations.some((lead) => lead.diagnosis_id === item.id) && <em>상담</em>}<strong>{item.facility_name}</strong><small>{new Date(item.created_at).toLocaleString("ko-KR")}</small></button>)}{!filtered.length && <p className="admin-empty">저장된 진단이 없습니다.</p>}</div></aside>
        <div className="admin-detail">{selected ? <>
          <div className="admin-detail-head"><div><span>{facilityLabels[selected.facility_type] || selected.facility_type} · {selected.status === "completed" ? "진단 완료" : selected.status}</span><h2>{selected.facility_name}</h2><p>{selected.facility_address || "주소 정보 없음"}</p></div><small>ID {selected.id}</small></div>
          {selectedConsultation && <section className="admin-lead"><span>상담 요청</span><div><strong>{selectedConsultation.contact_name}</strong><p>{selectedConsultation.organization || "소속 미입력"}</p></div><div><a href={`mailto:${selectedConsultation.email || ""}`}>{selectedConsultation.email || "이메일 없음"}</a><a href={`tel:${selectedConsultation.phone || ""}`}>{selectedConsultation.phone || "연락처 없음"}</a></div><em>{selectedConsultation.preferred_contact_method || "연락 방식 미정"}</em></section>}
          <div className="admin-card-grid">
            <section><span>01 · 추천 서비스</span><h3>{selectedServices.length ? selectedServices.join(" + ") : "선택 기록 없음"}</h3><p>초기 운영안: {listFrom(recommendation.initialServices).join(" + ") || "기록 없음"}</p></section>
            <section><span>02 · 대표 경로</span><h3>{String(route.start || "출발지")}</h3><p>{route.elevator ? "엘리베이터 경유 → " : ""}{String(route.end || "목적지")}</p></section>
            <section><span>03 · 공간 기록</span><h3>{listFrom(analysis.recordedCategories).length}개 항목</h3><p>{listFrom(analysis.recordedCategories).join(" · ") || "촬영·측정 기록 없음"}</p></section>
            <section><span>04 · 예비 견적</span><h3>{won((quote.metrics as Record<string, unknown> | undefined)?.initial)}</h3><p>월 {won((quote.metrics as Record<string, unknown> | undefined)?.monthly)} · 로봇 {String(quote.robots || 1)}대</p></section>
          </div>
          <section className="admin-photo-review"><header><div><span>05 · AI PHOTO REVIEW</span><h3>Supabase 저장 사진과 AI 판정</h3><p>door-images 버킷에 먼저 저장된 사진과 후속 AI 분류 상태를 표시합니다.</p></div><b>{selected.capture_photos?.length || 0}장</b></header>{selected.capture_photos?.length ? <div className="admin-photo-grid">{selected.capture_photos.map((photo) => { const statusLabel = photo.aiStatus === "VERIFIED" ? "O · 승인" : photo.aiStatus === "REJECTED" ? "X · 미승인" : photo.aiStatus === "UPLOADED" ? "저장 완료·분석 대기" : "AI 재확인 대기"; const visibleReason = photo.aiStatus === "NEEDS_REVIEW" ? "사진은 안전하게 저장됐으며 AI 판독 결과를 다시 확인하고 있습니다." : photo.aiReason || "Supabase 저장 후 AI 분석을 기다리고 있습니다."; return <article key={photo.id}><div className="admin-photo-image">{photo.signedUrl ? <img src={photo.signedUrl} alt={`${captureCategoryLabel(photo.category)} AI 검증 사진`} /> : <span>사진 링크 만료</span>}<i>{statusLabel}</i></div><div><small>경로 {Number(photo.routeNumber || 1)} · Step {Number(photo.stage) + 1}</small><h4>{captureCategoryLabel(photo.category)}</h4><p>처리 상태 · <b>{statusLabel}</b></p><em>{visibleReason}</em></div></article>; })}</div> : <p className="admin-photo-empty">이 진단에 저장된 현장 사진이 없습니다.</p>}</section>
          <details className="admin-json"><summary>AI 사진 판정 이력 보기 ({selected.capture_verification_attempts?.length || 0}건)</summary><pre>{JSON.stringify(selected.capture_verification_attempts || [], null, 2)}</pre></details>
          <details className="admin-json"><summary>저장된 전체 진단 데이터 보기</summary><pre>{JSON.stringify(selected, null, 2)}</pre></details>
        </> : <div className="admin-empty-detail"><span>B</span><h2>진단을 선택해주세요.</h2><p>왼쪽 목록에서 시설을 선택하면 상세 결과가 표시됩니다.</p></div>}</div>
      </section>
    </main>
  );
}
