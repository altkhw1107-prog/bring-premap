"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { CAPTURE_CATEGORY, CAPTURE_CATEGORY_LABELS, CaptureCategoryKey, STAGE_CAPTURE_CATEGORY_KEYS, captureCategoryLabel, toCaptureCategoryKey } from "../lib/capture-categories";

type FacilityType = "호텔" | "오피스" | "아파트" | "병원";
const rentalMonthlyRates: Record<12 | 24 | 36, number> = { 12: 1300000, 24: 1100000, 36: 900000 };
type Facility = {
  id?: string;
  name: string;
  type: FacilityType;
  category: string;
  address: string;
  lot: string;
  phone?: string;
  placeUrl?: string;
  x?: string;
  y?: string;
  tone: string;
};

type Service = {
  name: string;
  short: string;
  route: string;
  condition: string;
  glyph: string;
};

const makeServices = (items: [string, string, string, string][]): Service[] =>
  items.map((item, index) => ({ name: item[0], short: item[1], route: item[2], condition: item[3], glyph: `0${index + 1}` }));

const serviceCatalog: Record<FacilityType, Service[]> = {
  호텔: makeServices([
    ["컨시어지 서비스", "어메니티와 대여품을 객실로 전달", "프런트 → 객실", "상차 담당자와 미수령 정책"],
    ["직원간 물류 이동", "린넨·비품의 부서 간 반복 이동", "창고 → 운영부서", "내부 수령자 지정"],
    ["호텔 식음 배달", "호텔 F&B 주문을 안전하게 전달", "주방 → 객실", "POS·위생 기준 확인"],
    ["외주 F&B 배달", "입점 매장의 식음 주문을 전달", "매장 → 객실", "주문 연동과 상차 동선"],
    ["외부 배달 중개", "배달 기사 물품을 객실까지 중개", "로비 → 객실", "본인 인증과 야간 인계"],
    ["짐 운반", "체크인·아웃 고객의 수하물 이동", "벨데스크 → 객실", "적재 크기와 보안 인계"],
    ["객실 안내", "고객을 객실 또는 부대시설로 안내", "로비 → 목적지", "보행자 혼잡 시간 확인"],
  ]),
  오피스: makeServices([
    ["사내 우편·택배", "수신 우편과 택배를 각 부서로 배송", "메일룸 → 부서", "수령자 인증과 보안정책"],
    ["문서·비품 물류", "문서와 사무용품의 층간 반복 이동", "총무팀 → 업무공간", "보안문과 수령자 지정"],
    ["회의실 식음 배송", "회의 전 다과와 음료를 정시에 배송", "카페테리아 → 회의실", "예약 연동과 회수 정책"],
    ["사내식당 배달", "직원 식사를 지정 좌석·공간으로 전달", "사내식당 → 오피스", "피크시간과 위생 기준"],
    ["외부 배달 중개", "로비에서 외부 음식을 받아 전달", "로비 → 업무층", "출입 인증과 인계 담당자"],
    ["층간 물품 이동", "샘플·장비·소모품을 부서 간 운반", "보관실 → 연구·업무공간", "적재함 규격과 우선순위"],
    ["방문객 안내", "방문객을 회의실과 담당 부서로 안내", "리셉션 → 회의실", "출입 등록과 혼잡도"],
  ]),
  아파트: makeServices([
    ["택배 라스트마일", "보관소의 택배를 세대 앞까지 전달", "택배보관소 → 세대", "입주민 인증과 미수령 정책"],
    ["음식 배달 중개", "공동현관에서 음식을 받아 세대로 전달", "공동현관 → 세대", "기사 인계와 보안문 연동"],
    ["커뮤니티 물품 배송", "커뮤니티 시설의 대여품을 배송", "커뮤니티센터 → 세대", "반납과 분실 정책"],
    ["관리사무소 물류", "안내문·소모품을 동별로 반복 배송", "관리사무소 → 각 동", "동간 이동과 담당자 지정"],
    ["생활용품 배송", "단지 상가의 생필품을 입주민에게 전달", "단지상가 → 세대", "주문·결제 연동"],
    ["대여품 회수", "카트·공구 등 공용 대여품을 회수", "세대 → 관리시설", "오염·분실 확인"],
    ["입주민·방문객 안내", "단지 시설과 방문 동선을 안내", "공동현관 → 목적지", "출입권한과 보행자 혼잡"],
  ]),
  병원: makeServices([
    ["약제 배송", "조제 약품을 병동과 투약 거점으로 배송", "약제부 → 병동", "잠금 적재함과 인수인계"],
    ["검체 운송", "검체를 검사실로 정해진 절차에 따라 운송", "채혈실·병동 → 검사실", "전용 적재함과 안전기준"],
    ["의료 소모품 배송", "진료재료와 소모품을 각 부서로 공급", "중앙공급실 → 진료부서", "재고·수령자 확인"],
    ["린넨 물류", "청결 린넨을 병동과 처치실로 운반", "린넨실 → 병동", "오염 린넨과 동선 분리"],
    ["환자 식사 배송", "배식 카트와 개별 식사를 병동으로 배송", "영양팀 → 병동", "위생·배식시간 기준"],
    ["서류·처방전 이동", "원무 서류와 처방 문서를 안전하게 전달", "원무과 → 진료부서", "개인정보와 밀봉 인계"],
    ["내원객 안내", "내원객을 검사실과 진료과로 안내", "원무 로비 → 진료과", "혼잡도와 응급동선 분리"],
  ]),
};

const questionCatalog: Record<FacilityType, Record<string, string>> = {
  호텔: {
    "어메니티 서비스는 무엇인가요?": "칫솔, 생수, 수건 같은 요청 물품을 직원이 로봇에 싣고 객실 앞까지 전달합니다. 프런트–객실 경로와 엘리베이터 연동을 먼저 확인합니다.",
    "외부 음식도 객실까지 배달할 수 있나요?": "가능합니다. 로비에서 직원이 음식을 인계하고 로봇이 객실까지 이동하며, 야간 상차 담당자와 고객 확인 방식을 함께 설계합니다.",
    "엘리베이터 배송도 가능한가요?": "가능하지만 호출·층 선택 연동과 문 열림 시간, 승강장 틈을 확인해야 합니다.",
  },
  오피스: {
    "사내 택배를 부서까지 배송할 수 있나요?": "메일룸에서 수령한 택배를 부서나 수령 거점까지 전달할 수 있습니다. 사원 인증과 보안문 연동을 먼저 확인합니다.",
    "회의실 다과 배송은 어떻게 운영하나요?": "회의 예약시간에 맞춰 카페테리아에서 회의실로 배송하고, 회수 업무까지 별도 시간대로 운영할 수 있습니다.",
    "보안구역도 이동할 수 있나요?": "출입 시스템 연동 또는 담당자 승인 방식이 필요하며 보안등급별 경로를 분리해 검토합니다.",
  },
  아파트: {
    "택배를 세대 앞까지 배송할 수 있나요?": "택배보관소에서 입주민 인증 후 세대 앞까지 전달할 수 있습니다. 공동현관과 엘리베이터 연동이 핵심입니다.",
    "배달음식은 어떻게 인계하나요?": "공동현관에서 기사 또는 관리 담당자가 로봇에 상차하고, 입주민 알림과 일회용 인증으로 인계합니다.",
    "여러 동을 함께 운영할 수 있나요?": "동간 이동환경과 실외구간 여부에 따라 경로를 나눠 진단하고, 초기에는 대표 동 한 곳부터 검증합니다.",
  },
  병원: {
    "약제 배송은 안전하게 운영되나요?": "잠금 적재함, 지정 수령자 인증, 이력 기록을 전제로 약제부–병동 경로를 운영합니다.",
    "검체 운송도 가능한가요?": "전용 적재함과 감염관리 기준, 응급 검체 우선순위를 별도 기술검토한 뒤 제한된 경로부터 검증합니다.",
    "환자 동선과 충돌하지 않나요?": "외래 피크시간과 응급동선을 피해 운행시간·대기지점을 설계하고, 현장 촬영에서 혼잡구간을 확인합니다.",
  },
};

type ServiceSignal = {
  baseScore: number;
  fitScore: number;
  evidenceCount: number;
  evidence: string;
  reason: string;
};

type FacilityAnalysis = {
  restaurantCount: number;
  restaurantCountLowerBound: boolean;
  restaurantSearchLimit?: number;
  externalDeliveryEligible: boolean;
  internalCandidates: Array<{
    id: string;
    name: string;
    category: string;
    address: string;
    floor?: string;
    placeUrl?: string;
    source: string;
    confidence: string;
  }>;
  internalFnbStatus: "confirmed" | "confirmation_required" | "unknown";
  websiteAnalysis?: {
    status: "found" | "not_found" | "unavailable";
    officialWebsite: string;
    fnbFound: boolean;
    venues: Array<{ name: string; floor: string; sourceUrl: string }>;
    note: string;
  };
  gisFallback?: { status: "api_key_required" | "not_needed"; candidateCount: number; note: string };
};

type BuildingRegisterInfo = {
  status: "found" | "not_found" | "unavailable";
  source?: string;
  matchedBuildingCount?: number;
  legalAddress?: string;
  roadAddress?: string | null;
  buildingName?: string;
  registerKind?: string;
  mainPurpose?: string;
  structure?: string;
  groundFloors?: number;
  undergroundFloors?: number;
  totalArea?: number;
  buildingArea?: number;
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  height?: number;
  approvalDate?: string;
  elevatorCount?: number;
  parkingCount?: number;
  householdCount?: number;
  roomCount?: number;
  ledgerCreatedDate?: string;
  error?: string;
};

type InternalFnbDecision = "unknown" | "direct" | "outsourced" | "none";
type AiMode = "checking" | "generative" | "fallback";

type AiInterviewResponse = {
  assistant_message: string;
  detected_services: Array<{
    service_id: string;
    fit_score: number;
    reason: string;
    evidence: string;
    confidence: number;
  }>;
  follow_up_questions: string[];
  next_action: "continue_interview" | "ready_for_recommendation";
  mode?: "generative";
};

const hotelServiceIds: Record<string, string> = {
  concierge: "컨시어지 서비스",
  staff_logistics: "직원간 물류 이동",
  hotel_fnb: "호텔 식음 배달",
  outsourced_fnb: "외주 F&B 배달",
  external_delivery: "외부 배달 중개",
  luggage: "짐 운반",
  guidance: "객실 안내",
};

const synergyDimensions = [
  { key: "route" as const, title: "동선/배차 통합", description: "겹치는 이동 구간과 배차 흐름을 함께 운영하는 조합" },
  { key: "infra" as const, title: "운영 인프라 공유", description: "상차·수령·설비 연동을 공동으로 활용하는 조합" },
  { key: "time" as const, title: "수요 시간대 보완", description: "서로 다른 피크 시간으로 로봇 가동률을 보완하는 조합" },
];

const hotelInterviewExamples = [
  "야간에 수건이나 생수를 객실까지 가져다주는 업무가 많아요.",
  "체크인 시간에 고객 짐 운반과 객실 안내가 몰려요.",
  "외부 배달원이 객실층에 올라가는 보안 문제가 있어요.",
];

const hotelServicePolicy: Record<string, { range: string; constraints: string[] }> = {
  "컨시어지 서비스": { range: "프런트·컨시어지에서 객실 앞까지 어메니티와 대여품 전달", constraints: ["직원 상차와 고객 수령 알림 필요", "보안층·엘리베이터 연동은 현장 확인"] },
  "직원간 물류 이동": { range: "창고·린넨실·운영 부서 사이의 반복 물류 이동", constraints: ["부서별 인수인계 담당자 지정", "혼잡 시간과 서비스 동선 분리 필요"] },
  "호텔 식음 배달": { range: "호텔 직영 주방·레스토랑에서 객실 앞까지 식음 전달", constraints: ["공식 F&B·층수와 상차 위치 확인", "위생·보온 및 주문 시스템 연동 검토"] },
  "외주 F&B 배달": { range: "호텔 내 입점·제휴 매장에서 객실 앞까지 식음 전달", constraints: ["매장 운영주체와 정산 방식 확인", "입점 매장 상차 책임과 주문 연동 필요"] },
  "외부 배달 중개": { range: "로비에서 외부 배달 물품을 인계받아 객실 앞까지 전달", constraints: ["2km 내 음식점 20개 초과 시 AI 가이드 포함", "배달기사 인계·본인 인증·오배송 정책 필요"] },
  "짐 운반": { range: "벨데스크·로비와 객실 사이의 고객 수하물 운반", constraints: ["적재함 규격·중량 검증", "분실 방지와 고객 인수 확인 필요"] },
  "객실 안내": { range: "로비에서 객실·부대시설까지 고객 동행 안내", constraints: ["혼잡도와 보행자 우선정책 확인", "다국어 안내와 안내 종료 위치 설계"] },
};

const hotelInterviewRules: Record<string, { keywords: string[]; reason: string; followUp: string }> = {
  "컨시어지 서비스": { keywords: ["수건", "생수", "어메니티", "객실 요청", "야간 요청", "칫솔"], reason: "객실 요청 물품을 프런트에서 객실 앞까지 전달하는 업무와 직접 연결됩니다.", followUp: "요청이 집중되는 시간대와 상차 담당자가 정해져 있는지도 알려주세요." },
  "직원간 물류 이동": { keywords: ["비품", "서류", "창고", "부서", "층 사이", "직원 이동", "내부 물류"], reason: "부서·창고·층 사이의 반복적인 내부 물류 이동을 줄이는 요구와 연결됩니다.", followUp: "이동이 가장 많은 부서와 인수인계 방식도 알려주세요." },
  "호텔 식음 배달": { keywords: ["룸서비스", "호텔 식음", "직영", "주방", "조식", "식사", "레스토랑"], reason: "호텔 자체 주방이나 직영 F&B 주문을 객실로 전달하는 업무와 연결됩니다.", followUp: "직영 운영 여부와 주문이 몰리는 시간대를 확인하면 운영 방식을 더 정확히 제안할 수 있어요." },
  "외주 F&B 배달": { keywords: ["입점", "제휴", "외주", "테넌트", "푸드코트", "입점 매장"], reason: "호텔 내 입점·제휴 F&B의 주문을 객실로 전달하려는 요구와 연결됩니다.", followUp: "매장 운영 주체와 로봇 상차 담당자가 누구인지 확인이 필요합니다." },
  "외부 배달 중개": { keywords: ["외부 배달", "배달원", "배달 기사", "보안", "로비 인계", "배달 음식", "객실층"], reason: "외부 배달을 로비에서 인계해 객실층 보안과 고객 프라이버시를 지키려는 요구와 연결됩니다.", followUp: "배달기사 인계 위치와 노쇼·오배송 대응 담당자도 알려주세요." },
  "짐 운반": { keywords: ["짐", "수하물", "캐리어", "벨홉", "체크인", "체크아웃"], reason: "체크인·체크아웃 수하물 이동과 벨홉 업무 부담을 줄이는 요구와 연결됩니다.", followUp: "주요 짐의 크기와 무게, 피크 체크인 시간대를 확인해주세요." },
  "객실 안내": { keywords: ["객실 안내", "길 찾기", "객실 찾", "고객 안내", "복잡한 동선", "체크인 안내"], reason: "고객의 길 찾기와 체크인 안내 경험을 개선하려는 요구와 연결됩니다.", followUp: "안내가 가장 많이 필요한 구간과 혼잡 시간대를 알려주세요." },
};

function pairKey(a: string, b: string) {
  return [a, b].sort((left, right) => left.localeCompare(right, "ko")).join("::");
}

const hotelSynergySeed = new Map<string, { route: number; infra: number; time: number }>([
  [pairKey("컨시어지 서비스", "직원간 물류 이동"), { route: 2, infra: 3, time: 2 }],
  [pairKey("컨시어지 서비스", "호텔 식음 배달"), { route: 2, infra: 2, time: 1 }],
  [pairKey("컨시어지 서비스", "외주 F&B 배달"), { route: 2, infra: 2, time: 1 }],
  [pairKey("컨시어지 서비스", "외부 배달 중개"), { route: 2, infra: 2, time: 0 }],
  [pairKey("컨시어지 서비스", "짐 운반"), { route: 1, infra: 2, time: 2 }],
  [pairKey("컨시어지 서비스", "객실 안내"), { route: 1, infra: 2, time: 2 }],
  [pairKey("직원간 물류 이동", "호텔 식음 배달"), { route: 0, infra: 1, time: 2 }],
  [pairKey("직원간 물류 이동", "외주 F&B 배달"), { route: 0, infra: 1, time: 2 }],
  [pairKey("직원간 물류 이동", "외부 배달 중개"), { route: 0, infra: 1, time: 3 }],
  [pairKey("직원간 물류 이동", "짐 운반"), { route: 1, infra: 1, time: 1 }],
  [pairKey("직원간 물류 이동", "객실 안내"), { route: 0, infra: 1, time: 2 }],
  [pairKey("호텔 식음 배달", "외주 F&B 배달"), { route: 3, infra: 3, time: 0 }],
  [pairKey("호텔 식음 배달", "외부 배달 중개"), { route: 3, infra: 3, time: 1 }],
  [pairKey("호텔 식음 배달", "짐 운반"), { route: 0, infra: 0, time: 1 }],
  [pairKey("호텔 식음 배달", "객실 안내"), { route: 0, infra: 1, time: 2 }],
  [pairKey("외주 F&B 배달", "외부 배달 중개"), { route: 3, infra: 3, time: 1 }],
  [pairKey("외주 F&B 배달", "짐 운반"), { route: 0, infra: 0, time: 1 }],
  [pairKey("외주 F&B 배달", "객실 안내"), { route: 0, infra: 1, time: 1 }],
  [pairKey("외부 배달 중개", "짐 운반"), { route: 1, infra: 2, time: 3 }],
  [pairKey("외부 배달 중개", "객실 안내"), { route: 1, infra: 2, time: 3 }],
  [pairKey("짐 운반", "객실 안내"), { route: 3, infra: 3, time: 0 }],
]);

function serviceInterviewRule(service: Service) {
  const exact = hotelInterviewRules[service.name];
  if (exact) return exact;
  const keywords = service.name.split(/[·\s]+/).filter((word) => word.length >= 2 && !["서비스", "배송", "이동"].includes(word));
  return {
    keywords,
    reason: `말씀하신 업무가 ${service.short} 상황과 연결됩니다.`,
    followUp: "업무가 집중되는 시간대와 상차·수령 담당자를 알려주시면 더 정확히 추천할 수 있어요.",
  };
}

function synergyFor(a: string, b: string) {
  return hotelSynergySeed.get(pairKey(a, b)) || { route: 2, infra: 2, time: 1 };
}

const categoryKeywords: Record<FacilityType, string[]> = {
  호텔: ["호텔", "리조트", "숙박", "모텔", "게스트하우스"],
  오피스: ["기업", "회사", "빌딩", "오피스", "업무시설", "공공기관", "사무실"],
  아파트: ["아파트", "공동주택", "오피스텔", "주거시설"],
  병원: ["병원", "의료", "의원", "클리닉", "보건"],
};

const routeDefaults: Record<FacilityType, { start: string; end: string; elevator: boolean }> = {
  호텔: { start: "", end: "", elevator: true },
  오피스: { start: "", end: "", elevator: true },
  아파트: { start: "", end: "", elevator: true },
  병원: { start: "", end: "", elevator: true },
};

const routeExamples: Record<FacilityType, { start: string; end: string }> = {
  호텔: { start: "ex) 프런트 데스크", end: "ex) 8층 객실" },
  오피스: { start: "ex) 메일룸", end: "ex) 10층 업무공간" },
  아파트: { start: "ex) 택배보관소", end: "ex) 101동 세대" },
  병원: { start: "ex) 약제부", end: "ex) 8층 병동" },
};

const fallbackFacilities: Record<FacilityType, Facility[]> = {
  호텔: [
    { id: "demo-hotel-1", name: "서울신라호텔", type: "호텔", category: "호텔", address: "서울 중구 동호로 249", lot: "서울 중구 장충동2가 202", phone: "02-2233-3131", tone: "violet" },
    { id: "demo-hotel-2", name: "롯데호텔 서울", type: "호텔", category: "호텔", address: "서울 중구 을지로 30", lot: "서울 중구 소공동 1", phone: "02-771-1000", tone: "blue" },
    { id: "demo-hotel-3", name: "그랜드 인터컨티넨탈 서울 파르나스", type: "호텔", category: "호텔", address: "서울 강남구 테헤란로 521", lot: "서울 강남구 삼성동 159-8", phone: "02-555-5656", tone: "amber" },
  ],
  오피스: [
    { id: "demo-office-1", name: "카카오 판교아지트", type: "오피스", category: "기업·오피스", address: "경기 성남시 분당구 판교역로 166", lot: "경기 성남시 분당구 백현동 532", tone: "violet" },
    { id: "demo-office-2", name: "네이버 1784", type: "오피스", category: "기업·오피스", address: "경기 성남시 분당구 정자일로 95", lot: "경기 성남시 분당구 정자동 178-1", tone: "blue" },
    { id: "demo-office-3", name: "서울파이낸스센터", type: "오피스", category: "오피스 빌딩", address: "서울 중구 세종대로 136", lot: "서울 중구 태평로1가 84", tone: "teal" },
  ],
  아파트: [
    { id: "demo-apartment-1", name: "잠실엘스아파트", type: "아파트", category: "아파트", address: "서울 송파구 올림픽로 99", lot: "서울 송파구 잠실동 19", tone: "violet" },
    { id: "demo-apartment-2", name: "헬리오시티아파트", type: "아파트", category: "아파트", address: "서울 송파구 송파대로 345", lot: "서울 송파구 가락동 913", tone: "blue" },
    { id: "demo-apartment-3", name: "래미안 원베일리", type: "아파트", category: "아파트", address: "서울 서초구 반포대로 333", lot: "서울 서초구 반포동 1-1", tone: "coral" },
  ],
  병원: [
    { id: "demo-hospital-1", name: "서울대학교병원", type: "병원", category: "종합병원", address: "서울 종로구 대학로 101", lot: "서울 종로구 연건동 28-21", phone: "1588-5700", tone: "violet" },
    { id: "demo-hospital-2", name: "서울아산병원", type: "병원", category: "종합병원", address: "서울 송파구 올림픽로43길 88", lot: "서울 송파구 풍납동 388-1", phone: "1688-7575", tone: "blue" },
    { id: "demo-hospital-3", name: "삼성서울병원", type: "병원", category: "종합병원", address: "서울 강남구 일원로 81", lot: "서울 강남구 일원동 50", phone: "1599-3114", tone: "mint" },
  ],
};

type CaptureCategory = { key: CaptureCategoryKey; name: string; title: string; description: string; tip: string; guideSteps?: string[] };
type CapturedPhoto = { url: string; category: string; routeNumber?: number; aiVerified?: boolean; aiStatus?: "UPLOADED" | "VERIFIED" | "NEEDS_REVIEW" | "REJECTED"; aiDetectedCategory?: string; aiConfidence?: number };
type RemotePhoto = { id: string; stage: number; routeNumber?: number; category?: string; slopeAngle?: number | null; aiVerified?: boolean; aiStatus?: "UPLOADED" | "VERIFIED" | "NEEDS_REVIEW" | "REJECTED"; aiDetectedCategory?: string; aiConfidence?: number; aiReason?: string };
type RemoteObservation = { id?: string; stage: number; routeNumber?: number; category: string; slopeAngle?: number | null };

const captureCategoryMeta: Record<CaptureCategoryKey, Omit<CaptureCategory, "key" | "name" | "title">> = {
  MANUAL_DOOR: { description: "문 전체와 손잡이, 로봇이 통과할 바닥 부분을 촬영해주세요.", tip: "문이 열리는 방향과 문 앞 대기 공간이 함께 보이게 촬영해주세요." },
  AUTO_DOOR: { description: "문 전체와 센서 또는 출입 인증 장치가 함께 보이도록 촬영해주세요.", tip: "센서와 버튼 위치를 확인할 수 있도록 한두 걸음 뒤에서 촬영해주세요." },
  RAMP: { description: "경사로 전체와 시작·끝 지점의 바닥을 촬영해주세요.", tip: "각도 측정 후 경사로 폭과 주변 장애물이 함께 보이게 촬영해주세요." },
  THRESHOLD: { description: "턱의 높이와 통과 폭을 확인할 수 있도록 가까이 촬영해주세요.", tip: "바닥 기준선과 턱의 옆면이 함께 보이면 높이를 판단하기 쉬워요." },
  FLOOR_MATERIAL: { description: "로봇이 주행할 바닥 표면과 이음매를 촬영해주세요.", tip: "빛 반사보다 표면 질감이 잘 보이는 각도로 촬영해주세요." },
  OTHER: { description: "로봇 이동에 영향을 줄 수 있는 그 밖의 장애물이나 환경을 촬영해주세요.", tip: "좁은 통로, 가구, 매트, 혼잡 구간 등 추가 확인이 필요한 요소를 담아주세요." },
  DOOR_GAP: { description: "승강장과 엘리베이터 카 사이의 틈과 단차를 가까이 촬영해주세요.", tip: "가능하면 자나 기준 물체를 옆에 두어 폭과 높이를 비교해주세요." },
  ELEVATOR_INSIDE: { description: "엘리베이터 카 내부에서 열린 문 너머 바깥을 바라보며 출입 폭과 외부 호출 버튼이 함께 보이도록 촬영해주세요.", tip: "문을 완전히 연 뒤 양쪽 문틀과 승강장 호출 버튼이 한 화면에 들어오게 촬영해주세요.", guideSteps: ["카 내부 뒤쪽에서 승강장 방향을 바라보세요.", "엘리베이터 문이 완전히 열린 순간에 촬영하세요.", "양쪽 문틀의 출입 폭과 외부 호출 버튼을 한 프레임에 담아주세요."] },
};

const makeCaptureCategory = (key: CaptureCategoryKey): CaptureCategory => ({
  key,
  name: CAPTURE_CATEGORY_LABELS[key],
  title: CAPTURE_CATEGORY_LABELS[key],
  ...captureCategoryMeta[key],
});

const captureCategoryCatalog: Record<number, CaptureCategory[]> = {
  0: STAGE_CAPTURE_CATEGORY_KEYS[0].map(makeCaptureCategory),
  1: STAGE_CAPTURE_CATEGORY_KEYS[1].map(makeCaptureCategory),
  2: STAGE_CAPTURE_CATEGORY_KEYS[2].map(makeCaptureCategory),
};

function groupRemotePhotos(remotePhotos: RemotePhoto[]) {
  const grouped: Record<number, CapturedPhoto[]> = { 0: [], 1: [], 2: [] };
  remotePhotos.forEach((photo) => grouped[photo.stage].push({
    url: `/api/capture-photos/${photo.id}`,
    category: captureCategoryLabel(photo.category || captureCategoryCatalog[photo.stage][0].key),
    routeNumber: Number(photo.routeNumber || 1),
    aiVerified: photo.aiVerified,
    aiStatus: photo.aiStatus || (photo.aiVerified ? "VERIFIED" : "NEEDS_REVIEW"),
    aiDetectedCategory: captureCategoryLabel(photo.aiDetectedCategory || photo.category),
    aiConfidence: photo.aiConfidence,
  }));
  return grouped;
}

function groupCapturedCategories(remotePhotos: RemotePhoto[], observations: RemoteObservation[] = []) {
  const grouped: Record<number, string[]> = { 0: [], 1: [], 2: [] };
  remotePhotos.forEach((photo) => {
    const category = captureCategoryLabel(photo.category || captureCategoryCatalog[photo.stage][0].key);
    if (!grouped[photo.stage].includes(category)) grouped[photo.stage].push(category);
  });
  observations.forEach((observation) => {
    const category = captureCategoryLabel(observation.category);
    if (!grouped[observation.stage].includes(category)) grouped[observation.stage].push(category);
  });
  return grouped;
}

function normalizeRemoteObservations(observations: RemoteObservation[] = []) {
  return observations.map((observation) => ({
    ...observation,
    category: captureCategoryLabel(observation.category),
  }));
}
type CaptureSession = {
  id: string;
  facilityName: string;
  facilityType: FacilityType;
  startPoint: string;
  endPoint: string;
  usesElevator: boolean;
  status: string;
  deviceCount: number;
  currentStage: number;
  rootSessionId: string;
  routeNumber: number;
  routeSessions?: Array<{ id: string; routeNumber: number; startPoint: string; endPoint: string; usesElevator?: boolean; status: string; currentStage: number; deviceCount: number }>;
  photos: RemotePhoto[];
  observations: RemoteObservation[];
};

export default function Home() {
  const [step, setStep] = useState(0);
  const [facilityType, setFacilityType] = useState<FacilityType>("호텔");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Facility[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<Facility | null>(null);
  const [buildingRegister, setBuildingRegister] = useState<BuildingRegisterInfo | null>(null);
  const [buildingRegisterLoading, setBuildingRegisterLoading] = useState(false);
  const [buildingRegisterError, setBuildingRegisterError] = useState("");
  const [facility, setFacility] = useState<Facility | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [facilityAnalysis, setFacilityAnalysis] = useState<FacilityAnalysis | null>(null);
  const [facilityAnalysisLoading, setFacilityAnalysisLoading] = useState(false);
  const [facilityAnalysisStage, setFacilityAnalysisStage] = useState(0);
  const [facilityAnalysisError, setFacilityAnalysisError] = useState("");
  const [internalFnbDecision, setInternalFnbDecision] = useState<InternalFnbDecision>("unknown");
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "현재 호텔에서 개선하고 싶은 업무 또는 상황을 알려주세요!" },
  ]);
  const [serviceSignals, setServiceSignals] = useState<Record<string, ServiceSignal>>({});
  const [analysisFinalized, setAnalysisFinalized] = useState(false);
  const [clarificationCount, setClarificationCount] = useState(0);
  const [timeContextKnown, setTimeContextKnown] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("checking");
  const [interviewLoading, setInterviewLoading] = useState(false);
  const interviewInputRef = useRef<HTMLInputElement>(null);
  const interviewMessagesRef = useRef<HTMLDivElement>(null);
  const [route, setRoute] = useState(routeDefaults.호텔);
  const [connected, setConnected] = useState(false);
  const [captureSessionId, setCaptureSessionId] = useState("");
  const [mobileCaptureMode, setMobileCaptureMode] = useState(false);
  const [captureRouteNumber, setCaptureRouteNumber] = useState(1);
  const [activeAnalysisRouteNumber, setActiveAnalysisRouteNumber] = useState(1);
  const [creatingNextRoute, setCreatingNextRoute] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sessionData, setSessionData] = useState<CaptureSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [captureStage, setCaptureStage] = useState(0);
  const [photos, setPhotos] = useState<Record<number, CapturedPhoto[]>>({ 0: [], 1: [], 2: [] });
  const [obstacles, setObstacles] = useState<Record<number, string[]>>({ 0: [], 1: [], 2: [] });
  const [captureObservations, setCaptureObservations] = useState<RemoteObservation[]>([]);
  const [activeCaptureCategory, setActiveCaptureCategory] = useState(CAPTURE_CATEGORY_LABELS[CAPTURE_CATEGORY.MANUAL_DOOR]);
  const [showStageConfirm, setShowStageConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoAiReview, setPhotoAiReview] = useState<{ state: "idle" | "checking" | "accepted" | "rejected"; message: string }>({ state: "idle", message: "" });
  const [slopeOpen, setSlopeOpen] = useState(false);
  const [slopeAngle, setSlopeAngle] = useState(0);
  const [slopeOffset, setSlopeOffset] = useState(0);
  const [slopeStatus, setSlopeStatus] = useState<"ready" | "unsupported" | "denied">("ready");
  const [slopeStable, setSlopeStable] = useState(false);
  const rawSlopeAngle = useRef(0);
  const slopeSamples = useRef<number[]>([]);
  const motionSensorActive = useRef(false);
  const historyReady = useRef(false);
  const restoringHistory = useRef(false);
  const webDiagnosisSessionKey = useRef("");
  const buildingLookupSequence = useRef(0);
  const [destinations, setDestinations] = useState(50);
  const [robots, setRobots] = useState(1);
  const [plan, setPlan] = useState<"rental" | "purchase">("rental");
  const [rentalTerm, setRentalTerm] = useState<12 | 24 | 36>(24);
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState(40000000);
  const [hasExistingApp, setHasExistingApp] = useState(false);
  const [apiIntegrationCost, setApiIntegrationCost] = useState(0);
  const [elevatorIntegration, setElevatorIntegration] = useState(false);
  const [automaticDoorIntegration, setAutomaticDoorIntegration] = useState(false);
  const [manualDoorRepair, setManualDoorRepair] = useState(false);
  const [rampRepair, setRampRepair] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [diagnosisId, setDiagnosisId] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [consultError, setConsultError] = useState("");

  const services = serviceCatalog[facilityType];
  const questionChips = facilityType === "호텔" ? hotelInterviewExamples : Object.keys(questionCatalog[facilityType]);
  const cleanQuery = query.trim().toLowerCase();
  const suggestedFacilities = cleanQuery ? fallbackFacilities[facilityType].filter((item) =>
    `${item.name} ${item.address} ${item.category}`.toLowerCase().includes(cleanQuery)
  ) : [];
  const manualFacility: Facility | null = cleanQuery.length >= 2 && suggestedFacilities.length === 0 && results.length === 0
    ? { id: `manual-${cleanQuery}`, name: query.trim(), type: facilityType, category: `${facilityType} · 직접 입력`, address: "직접 입력한 시설명 또는 주소", lot: "상세 주소는 추후 수정 가능", tone: "violet" }
    : null;
  const visibleFacilities = results.length ? results : manualFacility ? [manualFacility] : suggestedFacilities;

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, bringStep: 0 }, "", window.location.href);
    historyReady.current = true;
    const restoreStep = (event: PopStateEvent) => {
      const previousStep = event.state?.bringStep;
      if (typeof previousStep !== "number") return;
      restoringHistory.current = true;
      setStep(previousStep);
    };
    window.addEventListener("popstate", restoreStep);
    return () => window.removeEventListener("popstate", restoreStep);
  }, []);

  useEffect(() => {
    if (!historyReady.current) return;
    if (restoringHistory.current) {
      restoringHistory.current = false;
      return;
    }
    if (window.history.state?.bringStep !== step) {
      window.history.pushState({ ...window.history.state, bringStep: step }, "", window.location.href);
    }
  }, [step]);

  useEffect(() => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }, [step, captureStage]);

  useEffect(() => {
    const container = interviewMessagesRef.current;
    if (!container) return;
    window.requestAnimationFrame(() => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }));
  }, [messages, interviewLoading]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      const resetTimer = window.setTimeout(() => {
        setResults([]);
        setSearchError("");
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResults([]);
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/kakao-search?q=${encodeURIComponent(clean)}`, { signal: controller.signal });
        const data = await response.json() as { documents?: Array<Omit<Facility, "type" | "tone">>; error?: string };
        if (!response.ok) throw new Error(data.error || "장소검색에 연결하지 못했습니다.");
        setResults((data.documents || []).map((item, index) => ({
          ...item,
          type: facilityType,
          tone: ["violet", "blue", "amber", "teal", "coral", "mint"][index % 6],
        })));
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchError("카카오맵 연결 전이라 추천 시설과 직접 입력을 사용할 수 있어요.");
      } finally {
        setSearchLoading(false);
      }
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, facilityType]);

  useEffect(() => {
    if (step !== 0.5 || !facility) return;
    let cancelled = false;
    (async () => {
      try {
        setFacilityAnalysisStage(2);
        const response = await fetch("/api/facility-analysis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: facility.name, address: facility.address, x: facility.x, y: facility.y }),
        });
        setFacilityAnalysisStage(3);
        const data = await response.json() as FacilityAnalysis & { error?: string };
        if (!response.ok) throw new Error(data.error || "시설 데이터를 분석하지 못했습니다.");
        if (!cancelled) {
          setFacilityAnalysis(data);
          if (data.internalFnbStatus === "confirmed") setInternalFnbDecision("direct");
          setFacilityAnalysisStage(4);
        }
      } catch (error) {
        if (!cancelled) {
          setFacilityAnalysisError((error as Error).message);
          setFacilityAnalysisStage(4);
        }
      } finally {
        if (!cancelled) setFacilityAnalysisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, facility]);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session");
    if (!sessionId) return;
    setMobileCaptureMode(true);
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/capture-sessions/${sessionId}`);
        const data = await response.json() as CaptureSession & { error?: string };
        if (!response.ok) throw new Error(data.error || "촬영 세션을 열 수 없습니다.");
        if (cancelled) return;
        setCaptureSessionId(sessionId);
        setSessionData(data);
        setCaptureRouteNumber(Number(data.routeNumber || 1));
        setFacilityType(data.facilityType);
        setSelected([serviceCatalog[data.facilityType][0].name]);
        setFacility({ name: data.facilityName, type: data.facilityType, category: data.facilityType, address: "PC에서 확인된 시설", lot: "", tone: "violet" });
        setRoute({ start: data.startPoint, end: data.endPoint, elevator: data.usesElevator });
        setCaptureStage(data.currentStage || 0);
        setActiveCaptureCategory(captureCategoryCatalog[data.currentStage || 0][0].name);
        setPhotos(groupRemotePhotos(data.photos || []));
        setCaptureObservations(normalizeRemoteObservations(data.observations || []));
        setObstacles(groupCapturedCategories(data.photos || [], data.observations || []));
        const hasRouteInformation = Boolean(data.startPoint?.trim() && data.endPoint?.trim());
        setStep(hasRouteInformation ? (data.status === "completed" ? 4.5 : 4) : 3.8);
        if (data.status !== "completed") await fetch(`/api/capture-sessions/${sessionId}/join`, { method: "POST" });
      } catch (error) {
        setSessionError((error as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!captureSessionId || step !== 3) return;
    const update = async () => {
      try {
        const response = await fetch(`/api/capture-sessions/${captureSessionId}?scope=group`);
        if (!response.ok) return;
        const data = await response.json() as CaptureSession;
        setSessionData(data);
        setConnected(data.deviceCount > 0);
        setPhotos(groupRemotePhotos(data.photos || []));
        setCaptureObservations(normalizeRemoteObservations(data.observations || []));
        setObstacles(groupCapturedCategories(data.photos || [], data.observations || []));
      } catch { /* polling retries automatically */ }
    };
    update();
    const timer = window.setInterval(update, 3000);
    return () => window.clearInterval(timer);
  }, [captureSessionId, step]);

  useEffect(() => {
    if (!slopeOpen) return;
    const publishSlope = (rawAngle: number) => {
      const adjusted = Math.max(0, Math.min(90, rawAngle - slopeOffset));
      const samples = [...slopeSamples.current, adjusted].slice(-24);
      slopeSamples.current = samples;
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
      rawSlopeAngle.current = rawAngle;
      setSlopeAngle(mean);
      setSlopeStable(samples.length >= 15 && Math.sqrt(variance) <= 0.35);
    };
    const onMotion = (event: DeviceMotionEvent) => {
      const gravity = event.accelerationIncludingGravity;
      if (gravity?.x == null || gravity.y == null || gravity.z == null) return;
      const magnitude = Math.hypot(gravity.x, gravity.y, gravity.z);
      if (magnitude < 2) return;
      motionSensorActive.current = true;
      publishSlope(Math.acos(Math.min(1, Math.abs(gravity.z) / magnitude)) * 180 / Math.PI);
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (motionSensorActive.current) return;
      const beta = (event.beta || 0) * Math.PI / 180;
      const gamma = (event.gamma || 0) * Math.PI / 180;
      publishSlope(Math.acos(Math.min(1, Math.abs(Math.cos(beta) * Math.cos(gamma)))) * 180 / Math.PI);
    };
    window.addEventListener("devicemotion", onMotion, true);
    window.addEventListener("deviceorientation", onOrientation, true);
    const noReadingTimer = window.setTimeout(() => {
      if (slopeSamples.current.length === 0) setSlopeStatus("unsupported");
    }, 3500);
    return () => {
      window.clearTimeout(noReadingTimer);
      window.removeEventListener("devicemotion", onMotion, true);
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, [slopeOpen, slopeOffset]);

  const rankedServices = useMemo(() => services.map((service, originalIndex) => ({
    service,
    originalIndex,
    signal: serviceSignals[service.name],
  })).sort((a, b) => {
    const scoreDifference = (b.signal?.fitScore || 0) - (a.signal?.fitScore || 0);
    if (scoreDifference) return scoreDifference;
    return a.originalIndex - b.originalIndex;
  }), [services, serviceSignals]);

  const detectedServiceCount = rankedServices.filter((item) => (item.signal?.fitScore || 0) >= 60).length;
  const recommendationReady = detectedServiceCount > 0;
  const hasInterviewInput = messages.some((message) => message.role === "user");
  const recommendationModel = useMemo(() => {
    const detected = rankedServices.filter((item) => (item.signal?.fitScore || 0) >= 60).map((item) => item.service.name);
    const rawRequested = Array.from(new Set(detected));
    const facilityEligibility = (name: string) => {
      if (name === "호텔 식음 배달") return internalFnbDecision === "direct" ? true : internalFnbDecision === "unknown" ? null : false;
      if (name === "외주 F&B 배달") return internalFnbDecision === "outsourced" ? true : internalFnbDecision === "unknown" ? null : false;
      if (name === "외부 배달 중개") return facilityAnalysis ? facilityAnalysis.externalDeliveryEligible : null;
      return true;
    };
    const requested = rawRequested.filter((name) => facilityEligibility(name) !== false);
    const excludedRequested = rawRequested.filter((name) => facilityEligibility(name) === false);
    const available = services.filter((service) => facilityEligibility(service.name) !== false);
    const evaluatePair = (a: string, b: string, directBonus = 0) => {
      const firstFit = serviceSignals[a]?.fitScore || 45;
      const secondFit = serviceSignals[b]?.fitScore || 45;
      const synergy = synergyFor(a, b);
      const synergyScore = timeContextKnown
        ? 100 * (.40 * synergy.route / 3 + .35 * synergy.infra / 3 + .25 * synergy.time / 3)
        : 100 * (.55 * synergy.route / 3 + .45 * synergy.infra / 3);
      return { pair: [a, b] as [string, string], score: .60 * ((firstFit + secondFit) / 2) + .40 * synergyScore + directBonus, synergy };
    };
    const candidates: Array<ReturnType<typeof evaluatePair>> = [];
    let extensionService = "";
    if (requested.length === 1) {
      available.filter((service) => service.name !== requested[0]).forEach((service) => {
        candidates.push(evaluatePair(requested[0], service.name));
      });
    } else if (requested.length === 2) {
      candidates.push(evaluatePair(requested[0], requested[1], 12));
      const expansionPairs: Array<ReturnType<typeof evaluatePair>> = [];
      const expansions = available.filter((service) => !requested.includes(service.name)).map((service) => {
        const first = evaluatePair(requested[0], service.name);
        const second = evaluatePair(requested[1], service.name);
        expansionPairs.push(first, second);
        const maxDimension = Math.max(first.synergy.route, first.synergy.infra, first.synergy.time, second.synergy.route, second.synergy.infra, second.synergy.time);
        return { service: service.name, score: (first.score + second.score) / 2, maxDimension };
      }).sort((a, b) => b.maxDimension - a.maxDimension || b.score - a.score);
      extensionService = expansions[0]?.service || "";
      candidates.push(...expansionPairs);
    } else if (requested.length >= 3) {
      for (let first = 0; first < requested.length; first += 1) {
        for (let second = first + 1; second < requested.length; second += 1) {
          candidates.push(evaluatePair(requested[first], requested[second]));
        }
      }
    }
    const priority = [...candidates].sort((a, b) => b.score - a.score)[0];
    const grouped: Array<{ pair: [string, string]; dimensions: typeof synergyDimensions; score: number; priority: boolean }> = [];
    const missing: Array<{ key: "route" | "infra" | "time"; title: string; description: string }> = [];
    synergyDimensions.forEach((dimension) => {
      const matching = Array.from(new Map(
        candidates
          .filter((candidate) => candidate.synergy[dimension.key] >= 2)
          .sort((a, b) => b.synergy[dimension.key] - a.synergy[dimension.key] || b.score - a.score)
          .map((candidate) => [pairKey(...candidate.pair), candidate]),
      ).values()).slice(0, 3);
      if (!matching.length) {
        missing.push(dimension);
        return;
      }
      matching.forEach((candidate) => {
        grouped.push({ pair: candidate.pair, dimensions: [dimension], score: candidate.score, priority: false });
      });
    });
    grouped.forEach((item) => { item.priority = Boolean(priority && pairKey(...item.pair) === pairKey(...priority.pair)); });
    return {
      requested,
      rawRequested,
      excludedRequested,
      candidates,
      cards: grouped.sort((a, b) => Number(b.priority) - Number(a.priority) || b.score - a.score),
      missing,
      priorityPair: priority?.pair,
      directPair: requested.length === 2 ? [requested[0], requested[1]] as [string, string] : undefined,
      extensionService,
      facilityEligibility,
    };
  }, [rankedServices, serviceSignals, services, timeContextKnown, facilityAnalysis, internalFnbDecision]);
  const initialServiceNames = selected.length ? selected.slice(0, 2) : recommendationModel.priorityPair;
  const aiRoadmapServices = recommendationModel.requested.filter((name) => !recommendationModel.priorityPair?.includes(name));
  const extensionSynergyDimension = recommendationModel.directPair && recommendationModel.extensionService
    ? [...synergyDimensions].sort((first, second) => {
      const firstScore = Math.max(
        synergyFor(recommendationModel.directPair![0], recommendationModel.extensionService)[first.key],
        synergyFor(recommendationModel.directPair![1], recommendationModel.extensionService)[first.key],
      );
      const secondScore = Math.max(
        synergyFor(recommendationModel.directPair![0], recommendationModel.extensionService)[second.key],
        synergyFor(recommendationModel.directPair![1], recommendationModel.extensionService)[second.key],
      );
      return secondScore - firstScore;
    })[0]
    : null;

  const manualDoorVerified = Object.values(photos).flat().some((photo) => photo.aiVerified && toCaptureCategoryKey(photo.category) === CAPTURE_CATEGORY.MANUAL_DOOR)
    || captureObservations.some((observation) => toCaptureCategoryKey(observation.category) === CAPTURE_CATEGORY.MANUAL_DOOR);
  const rampVerified = Object.values(photos).flat().some((photo) => photo.aiVerified && toCaptureCategoryKey(photo.category) === CAPTURE_CATEGORY.RAMP)
    || captureObservations.some((observation) => toCaptureCategoryKey(observation.category) === CAPTURE_CATEGORY.RAMP);
  const rampSlopeAngles = captureObservations
    .filter((observation) => toCaptureCategoryKey(observation.category) === CAPTURE_CATEGORY.RAMP && observation.slopeAngle != null)
    .map((observation) => Number(observation.slopeAngle))
    .filter(Number.isFinite);
  const maxRampSlopeAngle = rampSlopeAngles.length ? Math.max(...rampSlopeAngles) : null;
  const rampRequiresRepair = rampSlopeAngles.some((angle) => angle >= 7);
  const rentalMonthlyFee = rentalMonthlyRates[rentalTerm];

  useEffect(() => {
    if (manualDoorVerified) setManualDoorRepair(true);
  }, [manualDoorVerified]);

  useEffect(() => {
    setRampRepair(rampRequiresRepair);
  }, [rampRequiresRepair]);

  const metrics = useMemo(() => {
    const safeDestinations = Math.max(0, destinations || 0);
    const installation = Math.round(4500000 + 200000 * Math.sqrt(Math.max(safeDestinations - 10, 0)));
    const equipment = plan === "purchase" ? Math.max(0, purchaseUnitPrice) * robots : 0;
    const facilityIntegration = (elevatorIntegration ? 5000000 : 0) + (automaticDoorIntegration ? 1800000 : 0);
    const repairs = (manualDoorRepair && manualDoorVerified ? 5000000 : 0) + (rampRepair && rampVerified ? 3000000 : 0);
    const apiIntegration = hasExistingApp ? Math.max(0, apiIntegrationCost) : 0;
    const monthlyBase = plan === "purchase" ? 115000 * robots : Math.max(0, rentalMonthlyFee) * robots;
    const orderService = hasExistingApp ? 0 : 65000;
    return {
      installation,
      equipment,
      facilityIntegration,
      repairs,
      apiIntegration,
      initial: equipment + installation + facilityIntegration + repairs + apiIntegration,
      monthlyBase,
      orderService,
      monthly: monthlyBase + orderService,
    };
  }, [destinations, plan, purchaseUnitPrice, robots, elevatorIntegration, automaticDoorIntegration, manualDoorRepair, manualDoorVerified, rampRepair, rampVerified, hasExistingApp, apiIntegrationCost, rentalMonthlyFee]);

  const expectedImpact = useMemo(() => {
    const totalArea = Math.max(0, Number(buildingRegister?.totalArea || 0));
    const totalFloors = Math.max(0, Number(buildingRegister?.groundFloors || 0) + Number(buildingRegister?.undergroundFloors || 0));
    if (buildingRegister?.status !== "found" || !totalArea || !totalFloors) {
      return { available: false, totalArea, totalFloors, averageFloorArea: 0, savedSecondsPerDay: 0 };
    }
    const averageFloorArea = totalArea / totalFloors;
    const savedSecondsPerDelivery = ((1.5 * Math.sqrt(averageFloorArea) / 1.2) + (totalFloors / 2) * 6) * 2;
    return {
      available: true,
      totalArea,
      totalFloors,
      averageFloorArea,
      savedSecondsPerDay: savedSecondsPerDelivery * 50,
    };
  }, [buildingRegister]);

  const formatWon = (value: number) => `${(value / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`;
  const formatWonExact = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
  const formatSavedTime = (seconds: number) => {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
  };
  const recordedCategoryNames = Array.from(new Set([
    ...Object.values(obstacles).flat(),
    ...Object.values(photos).flat().map((photo) => photo.category),
    ...captureObservations.map((observation) => observation.category),
  ]));
  const allCaptureCategoryNames = Array.from(new Set(
    Object.values(captureCategoryCatalog).flat().map((item) => item.name),
  ));
  const findingNames = [
    ...recordedCategoryNames,
    ...allCaptureCategoryNames.filter((name) => !recordedCategoryNames.includes(name)),
  ].slice(0, Math.max(6, recordedCategoryNames.length));
  const captureRoutes = sessionData?.routeSessions?.length
    ? sessionData.routeSessions
    : [{ id: captureSessionId, routeNumber: captureRouteNumber || 1, startPoint: route.start, endPoint: route.end, usesElevator: route.elevator, status: "completed", currentStage: 2, deviceCount: 1 }];
  const activeAnalysisRoute = captureRoutes.find((item) => Number(item.routeNumber) === activeAnalysisRouteNumber) || captureRoutes[0];
  const activeRoutePhotos = Object.values(photos).flat().filter((photo) => Number(photo.routeNumber || 1) === Number(activeAnalysisRoute?.routeNumber || 1));
  const activeRouteObservations = captureObservations.filter((observation) => Number(observation.routeNumber || 1) === Number(activeAnalysisRoute?.routeNumber || 1));
  const activeRouteRecordedCategoryNames = Array.from(new Set([
    ...activeRoutePhotos.map((photo) => photo.category),
    ...activeRouteObservations.map((observation) => observation.category),
  ]));
  const activeRouteFindingNames = [
    ...activeRouteRecordedCategoryNames,
    ...allCaptureCategoryNames.filter((name) => !activeRouteRecordedCategoryNames.includes(name)),
  ].slice(0, Math.max(6, activeRouteRecordedCategoryNames.length));
  const routeCosts = captureRoutes.map((captureRoute) => {
    const routeNumber = Number(captureRoute.routeNumber || 1);
    const routePhotos = Object.values(photos).flat().filter((photo) => Number(photo.routeNumber || 1) === routeNumber && photo.aiVerified);
    const routeObservations = captureObservations.filter((observation) => Number(observation.routeNumber || 1) === routeNumber);
    const hasCategory = (category: CaptureCategoryKey) => routePhotos.some((photo) => toCaptureCategoryKey(photo.category) === category)
      || routeObservations.some((observation) => toCaptureCategoryKey(observation.category) === category);
    const elevator = elevatorIntegration && Boolean(captureRoute.usesElevator) ? 5000000 : 0;
    const automaticDoor = automaticDoorIntegration && hasCategory(CAPTURE_CATEGORY.AUTO_DOOR) ? 1800000 : 0;
    const manualDoor = manualDoorRepair && hasCategory(CAPTURE_CATEGORY.MANUAL_DOOR) ? 5000000 : 0;
    const ramp = rampRepair && hasCategory(CAPTURE_CATEGORY.RAMP) ? 3000000 : 0;
    return { ...captureRoute, elevator, automaticDoor, manualDoor, ramp, total: elevator + automaticDoor + manualDoor + ramp };
  });

  async function chooseFacility(item: Facility) {
    const source = `${item.name} ${item.category}`.toLowerCase();
    const matched = categoryKeywords[facilityType].some((keyword) => source.includes(keyword.toLowerCase()));
    if (!matched) {
      buildingLookupSequence.current += 1;
      setBuildingRegisterLoading(false);
      setCategoryError(`선택한 시설 유형은 '${facilityType}'이지만 검색된 장소의 카테고리는 '${item.category}'입니다. ${facilityType} 시설을 다시 선택해주세요.`);
      setCandidate(null);
      return;
    }
    setCategoryError("");
    setBuildingRegister(null);
    setBuildingRegisterError("");
    setCandidate(item);
    setBuildingRegisterLoading(true);
    const lookupSequence = ++buildingLookupSequence.current;
    try {
      const response = await fetch("/api/building-register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: item.name, address: item.address, lot: item.lot, x: item.x, y: item.y }),
      });
      const data = await response.json() as BuildingRegisterInfo;
      if (!response.ok && !data.status) throw new Error(data.error || "건축물대장을 조회하지 못했습니다.");
      if (lookupSequence === buildingLookupSequence.current) setBuildingRegister(data);
    } catch (error) {
      if (lookupSequence === buildingLookupSequence.current) setBuildingRegisterError((error as Error).message);
    } finally {
      if (lookupSequence === buildingLookupSequence.current) setBuildingRegisterLoading(false);
    }
  }

  function fallbackAnswer(clean: string, mode: "requirements" | "question") {
    if (mode === "question") {
      if (/왜|이유/.test(clean)) return "요구 적합도와 동선·인프라·시간대 시너지를 따로 비교해 추천했어요. 카드마다 어떤 기준에서 강점이 있는지 확인할 수 있습니다.";
      if (/빼|제외/.test(clean)) return "추천 서비스도 최종 선택 화면에서 제외할 수 있어요. 고객이 정한 선택과 순서가 결과에 우선 반영됩니다.";
      if (/한 대|1대|세 서비스/.test(clean)) return "한 대로 여러 서비스를 운영할 수 있지만 피크 시간 중첩, 적재 구분과 실제 운행시간은 현장 실사와 운영 시뮬레이션으로 확인해야 합니다.";
      return "현재 시설 데이터와 추천 결과 안에서 답변하고 있어요. 설치 가능 여부나 실제 처리량은 현장 실사 후 확정됩니다.";
    }
    const normalized = clean.toLowerCase();
    const detected = services.flatMap((service) => {
      const rule = serviceInterviewRule(service);
      const matchedKeywords = rule.keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()));
      const explicitName = normalized.includes(service.name.toLowerCase());
      if (!matchedKeywords.length && !explicitName) return [];
      const previous = serviceSignals[service.name];
      const evidenceCount = (previous?.evidenceCount || 0) + 1;
      const turnScore = explicitName ? 95 : Math.min(94, 62 + matchedKeywords.length * 8);
      const baseScore = Math.max(previous?.baseScore || 0, turnScore);
      const fitScore = Math.min(100, baseScore + Math.min(10, Math.max(0, evidenceCount - 1) * 5));
      return [{ service, rule, signal: { baseScore, fitScore, evidenceCount, evidence: clean, reason: rule.reason } }];
    }).sort((a, b) => b.signal.fitScore - a.signal.fitScore);
    let answer = questionCatalog[facilityType][clean];
    if (detected.length) {
      setServiceSignals((current) => {
        const next = { ...current };
        detected.forEach((item) => { next[item.service.name] = item.signal; });
        return next;
      });
      setClarificationCount(0);
      const names = detected.slice(0, 3).map((item) => item.service.name).join(" · ");
      const primary = detected[0];
      answer = `말씀하신 업무·상황은 ${names}를 통해 솔루션 제공이 가능합니다. ${primary.rule.reason} ${primary.rule.followUp}`;
    } else if (!answer) {
      const nextClarification = clarificationCount + 1;
      setClarificationCount(nextClarification);
      answer = nextClarification <= 2
        ? "조금 더 구체적으로 확인할게요. 누가 무엇을 어디에서 어디까지 옮기고 있으며, 가장 불편한 시간대는 언제인가요?"
        : "요구를 한 서비스로 확정하기 어려워요. 아래 7개 서비스는 계속 직접 선택할 수 있으며, 선택한 서비스도 추천 조합 계산에 반영됩니다.";
    }
    return answer || "입력한 내용을 서비스 추천에 반영했어요.";
  }

  async function ask(text = question, mode: "requirements" | "question" = "requirements") {
    const clean = text.trim();
    if (!clean || interviewLoading) return;
    setAnalysisFinalized(false);
    setQuestion("");
    setInterviewLoading(true);
    setMessages((current) => [...current, { role: "user", text: clean }]);
    if (mode === "requirements" && /야간|새벽|아침|오전|점심|오후|저녁|체크인 시간|피크|시간대/.test(clean)) setTimeContextKnown(true);
    try {
      const response = await fetch("/api/ai-interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: clean,
          mode,
          facility,
          facilityContext: { ...facilityAnalysis, buildingRegister, internalFnbDecision },
          conversation: messages.slice(-8),
        }),
      });
      const data = await response.json() as AiInterviewResponse & { error?: string; fallback?: boolean };
      if (!response.ok || data.fallback) throw new Error(data.error || "간이 분석으로 전환합니다.");
      setAiMode("generative");
      if (mode === "requirements") {
        setServiceSignals((current) => {
          const next = { ...current };
          (data.detected_services || []).forEach((item) => {
            const name = hotelServiceIds[item.service_id];
            if (!name) return;
            const previous = current[name];
            const evidenceCount = (previous?.evidenceCount || 0) + 1;
            const baseScore = Math.max(previous?.baseScore || 0, item.fit_score);
            next[name] = {
              baseScore,
              fitScore: Math.min(100, baseScore + Math.min(10, Math.max(0, evidenceCount - 1) * 5)),
              evidenceCount,
              evidence: item.evidence,
              reason: item.reason,
            };
          });
          return next;
        });
        setClarificationCount(data.next_action === "continue_interview" ? (current) => Math.min(2, current + 1) : 0);
      }
      setMessages((current) => [...current, { role: "ai", text: data.assistant_message }]);
    } catch {
      setAiMode("fallback");
      const answer = fallbackAnswer(clean, mode);
      setMessages((current) => [...current, { role: "ai", text: answer }]);
    } finally {
      setInterviewLoading(false);
    }
  }

  function toggleService(name: string) {
    setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function showFinalAnalysis() {
    setAnalysisFinalized(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("ai-recommendation")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  async function uploadPhoto(file: File) {
    const localUrl = URL.createObjectURL(file);
    const category = activeCaptureCategory;
    const categoryKey = toCaptureCategoryKey(category);
    setPhotoAiReview({ state: "checking", message: "사진을 Supabase door-images 버킷에 먼저 저장하고 있어요." });
    if (!captureSessionId) throw new Error("사진을 저장할 촬영 세션이 없습니다.");
    const form = new FormData();
    form.append("file", file);
    form.append("stage", String(captureStage));
    form.append("category", categoryKey);
    if (categoryKey === CAPTURE_CATEGORY.RAMP) form.append("slopeAngle", slopeAngle.toFixed(1));
    const response = await fetch(`/api/capture-sessions/${captureSessionId}/photos`, { method: "POST", body: form });
    const data = await response.json() as { id?: string; error?: string; status?: "UPLOADED"; bucket?: string };
    if (!response.ok) {
      URL.revokeObjectURL(localUrl);
      setPhotoAiReview({ state: "rejected", message: data.error || "사진 저장에 실패했습니다." });
      throw new Error(data.error || "사진 업로드에 실패했습니다.");
    }
    if (!data.id) throw new Error("저장된 사진 ID를 확인하지 못했습니다.");
    const storedUrl = `/api/capture-photos/${data.id}`;
    setPhotos((current) => ({
      ...current,
      [captureStage]: [...current[captureStage], {
        url: storedUrl,
        category,
        routeNumber: captureRouteNumber,
        aiVerified: false,
        aiStatus: "UPLOADED",
      }],
    }));
    URL.revokeObjectURL(localUrl);
    setObstacles((current) => ({
      ...current,
      [captureStage]: current[captureStage].includes(category) ? current[captureStage] : [...current[captureStage], category],
    }));
    setPhotoAiReview({ state: "checking", message: "Supabase 저장 완료. 저장된 사진을 UI로 불러와 생성형 AI가 분류하고 있어요." });
    const analysisResponse = await fetch(`/api/capture-photos/${data.id}/analyze`, { method: "POST" });
    const analysis = await analysisResponse.json() as { error?: string; verification?: { matched: boolean; status: "VERIFIED" | "NEEDS_REVIEW" | "REJECTED"; detectedCategory: string; confidence: number | null; evidence?: string[]; reason: string } };
    const verification = analysis.verification;
    if (!analysisResponse.ok || !verification) {
      setPhotoAiReview({ state: "accepted", message: "사진 저장이 완료됐습니다. AI 판독 결과는 자동으로 다시 확인됩니다." });
      return;
    }
    const detectedCategoryLabel = captureCategoryLabel(verification.detectedCategory || categoryKey);
    setPhotos((current) => ({
      ...current,
      [captureStage]: current[captureStage].map((photo) => photo.url === storedUrl ? {
        ...photo,
        aiVerified: verification.status === "VERIFIED",
        aiStatus: verification.status,
        aiDetectedCategory: detectedCategoryLabel,
        aiConfidence: verification.confidence ?? undefined,
      } : photo),
    }));
    setPhotoAiReview({
      state: verification.status === "REJECTED" ? "rejected" : "accepted",
      message: verification.status === "VERIFIED"
        ? `선택한 '${detectedCategoryLabel}' 항목이 사진에서 확인되어 O로 승인했습니다.`
        : verification.status === "REJECTED"
          ? `사진은 Supabase에 저장됐지만 미승인 처리했습니다. ${verification.reason}`
          : "사진 저장이 완료됐습니다. AI 판독 결과는 자동으로 다시 확인됩니다.",
    });
  }

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setSessionError("");
    setPhotoAiReview({ state: "checking", message: "사진을 생성형 AI로 확인할 준비를 하고 있어요." });
    try {
      for (const file of files) await uploadPhoto(file);
    } catch (error) {
      setSessionError((error as Error).message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function openSlopeMeter() {
    if (!("DeviceOrientationEvent" in window) && !("DeviceMotionEvent" in window)) {
      setSlopeStatus("unsupported");
      setSlopeOpen(true);
      return;
    }
    slopeSamples.current = [];
    motionSensorActive.current = false;
    setSlopeStable(false);
    const OrientationEvent = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> }) | undefined;
    const MotionEvent = window.DeviceMotionEvent as (typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> }) | undefined;
    try {
      const permissions = await Promise.all([
        typeof OrientationEvent?.requestPermission === "function" ? OrientationEvent.requestPermission() : Promise.resolve("granted" as const),
        typeof MotionEvent?.requestPermission === "function" ? MotionEvent.requestPermission() : Promise.resolve("granted" as const),
      ]);
      if (permissions.some((permission) => permission !== "granted")) {
        setSlopeStatus("denied");
        setSlopeOpen(true);
        return;
      }
    } catch {
      setSlopeStatus("denied");
      setSlopeOpen(true);
      return;
    }
    setSlopeStatus("ready");
    setSlopeOpen(true);
  }

  async function selectCaptureCategory(item: string) {
    setActiveCaptureCategory(item);
    setPhotoAiReview({ state: "idle", message: "" });
    setSessionError("");
    if (toCaptureCategoryKey(item) === CAPTURE_CATEGORY.RAMP) await openSlopeMeter();
  }

  async function saveSlopeMeasurement() {
    const rampLabel = CAPTURE_CATEGORY_LABELS[CAPTURE_CATEGORY.RAMP];
    const observation: RemoteObservation = { stage: captureStage, routeNumber: captureRouteNumber, category: rampLabel, slopeAngle };
    setObstacles((current) => ({
      ...current,
      [captureStage]: current[captureStage].includes(rampLabel) ? current[captureStage] : [...current[captureStage], rampLabel],
    }));
    setCaptureObservations((current) => [
      ...current.filter((item) => !(item.stage === captureStage && toCaptureCategoryKey(item.category) === CAPTURE_CATEGORY.RAMP)),
      observation,
    ]);
    setSlopeOpen(false);
    if (!captureSessionId) return;
    try {
      const response = await fetch(`/api/capture-sessions/${captureSessionId}/observations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...observation, category: CAPTURE_CATEGORY.RAMP }),
      });
      if (!response.ok) throw new Error("경사도 측정값을 동기화하지 못했습니다.");
    } catch (error) {
      setSessionError((error as Error).message);
    }
  }

  async function createCaptureSession() {
    if (!facility) return;
    setSessionError("");
    try {
      const response = await fetch("/api/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facilityName: facility.name, facilityType, startPoint: "", endPoint: "", usesElevator: true }),
      });
      const data = await response.json() as { id?: string; routeNumber?: number; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "촬영 세션을 만들 수 없습니다.");
      const url = `${window.location.origin}/?session=${data.id}`;
      const qr = await QRCode.toDataURL(url, { width: 340, margin: 2, errorCorrectionLevel: "H", color: { dark: "#121126", light: "#ffffff" } });
      setCaptureSessionId(data.id);
      setCaptureRouteNumber(Number(data.routeNumber || 1));
      setCaptureUrl(url);
      setQrDataUrl(qr);
      setStep(3);
    } catch (error) {
      setSessionError((error as Error).message);
    }
  }

  async function saveMobileRouteAndStart() {
    if (!captureSessionId || !route.start.trim() || !route.end.trim()) return;
    setSessionError("");
    try {
      const response = await fetch(`/api/capture-sessions/${captureSessionId}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startPoint: route.start.trim(), endPoint: route.end.trim(), usesElevator: route.elevator }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "경로 정보를 저장하지 못했습니다.");
      setSessionData((current) => current ? {
        ...current,
        startPoint: route.start.trim(),
        endPoint: route.end.trim(),
        usesElevator: route.elevator,
        status: "connected",
      } : current);
      setCaptureStage(0);
      setActiveCaptureCategory(captureCategoryCatalog[0][0].name);
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSessionError((error as Error).message);
    }
  }

  async function completeStage() {
    setShowStageConfirm(false);
    const completed = captureStage === 2;
    if (captureSessionId) {
      await fetch(`/api/capture-sessions/${captureSessionId}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: completed ? captureStage : captureStage + 1, completed }),
      });
    }
    if (!completed) {
      const nextStage = captureStage + 1;
      setCaptureStage(nextStage);
      setActiveCaptureCategory(captureCategoryCatalog[nextStage][0].name);
    }
    else setStep(mobileCaptureMode ? 4.5 : 5);
  }

  async function startAnotherMobileRoute() {
    if (!facility || !captureSessionId || creatingNextRoute) return;
    setCreatingNextRoute(true);
    setSessionError("");
    try {
      const response = await fetch("/api/capture-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          facilityName: facility.name,
          facilityType,
          startPoint: "",
          endPoint: "",
          usesElevator: true,
          parentSessionId: sessionData?.rootSessionId || captureSessionId,
        }),
      });
      const data = await response.json() as { id?: string; rootSessionId?: string; routeNumber?: number; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "추가 촬영 경로를 만들 수 없습니다.");
      const nextUrl = `${window.location.origin}/?session=${data.id}`;
      window.history.replaceState({ ...window.history.state, bringStep: 4 }, "", nextUrl);
      setCaptureSessionId(data.id);
      setCaptureRouteNumber(Number(data.routeNumber || captureRouteNumber + 1));
      setRoute(routeDefaults[facilityType]);
      setCaptureStage(0);
      setActiveCaptureCategory(captureCategoryCatalog[0][0].name);
      setPhotos({ 0: [], 1: [], 2: [] });
      setObstacles({ 0: [], 1: [], 2: [] });
      setCaptureObservations([]);
      setPhotoAiReview({ state: "idle", message: "" });
      setSessionData({
        id: data.id,
        rootSessionId: data.rootSessionId || data.id,
        routeNumber: Number(data.routeNumber || captureRouteNumber + 1),
        facilityName: facility.name,
        facilityType,
        startPoint: "",
        endPoint: "",
        usesElevator: true,
        status: "connected",
        deviceCount: 1,
        currentStage: 0,
        photos: [],
        observations: [],
      });
      setStep(3.8);
      await fetch(`/api/capture-sessions/${data.id}/join`, { method: "POST" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSessionError((error as Error).message);
    } finally {
      setCreatingNextRoute(false);
    }
  }

  async function goToCaptureStage(nextStage: number) {
    if (nextStage === captureStage || nextStage < 0 || nextStage > 2 || uploading) return;
    setCaptureStage(nextStage);
    setActiveCaptureCategory(captureCategoryCatalog[nextStage][0].name);
    setPhotoAiReview({ state: "idle", message: "" });
    setSessionError("");
    setShowStageConfirm(false);
    if (!captureSessionId) return;
    try {
      const response = await fetch(`/api/capture-sessions/${captureSessionId}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: nextStage, completed: false }),
      });
      if (!response.ok) throw new Error("Step 이동 상태를 동기화하지 못했습니다.");
    } catch (error) {
      setSessionError((error as Error).message);
    }
  }

  async function saveDiagnosisSnapshot() {
    if (!facility) return "";
    setSaveStatus("saving");
    if (!webDiagnosisSessionKey.current) webDiagnosisSessionKey.current = `web-${facility.id || "facility"}-${Date.now()}`;
    const sessionKey = captureSessionId || webDiagnosisSessionKey.current;
    try {
      const response = await fetch("/api/diagnoses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionKey,
          facilityType,
          facility,
          status: "completed",
          currentStage: 3,
          progressPercent: 100,
          interview: { messages, serviceSignals, aiMode, internalFnbDecision },
          route: { ...route, routes: captureRoutes },
          analysis: {
            facilityAnalysis,
            buildingRegister,
            recordedCategories: recordedCategoryNames,
            photoCounts: Object.fromEntries(Object.entries(photos).map(([stage, items]) => [stage, items.length])),
          },
          observations: captureObservations.map((item) => ({ ...item, stage: item.stage + 1 })),
          recommendation: { selected, initialServices: initialServiceNames, recommendationModel },
          quote: {
            plan, rentalTerm, robots, destinations, purchaseUnitPrice, rentalMonthlyFee,
            hasExistingApp, apiIntegrationCost, elevatorIntegration, automaticDoorIntegration,
            manualDoorRepair, rampRepair, metrics, routeCosts, expectedImpact,
          },
        }),
      });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "진단 결과 저장에 실패했습니다.");
      setDiagnosisId(data.id);
      setSaveStatus("saved");
      return data.id;
    } catch (error) {
      setSaveStatus("error");
      setSessionError((error as Error).message);
      return "";
    }
  }

  async function openResults() {
    setStep(6);
    await saveDiagnosisSnapshot();
  }

  async function submitConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsultError("");
    const form = new FormData(event.currentTarget);
    const savedDiagnosisId = await saveDiagnosisSnapshot();
    if (!savedDiagnosisId) {
      setConsultError("진단 결과를 먼저 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const response = await fetch("/api/consultation-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        diagnosisId: savedDiagnosisId,
        organization: form.get("organization"),
        department: form.get("department"),
        contactName: form.get("contactName"),
        title: form.get("title"),
        email: form.get("email"),
        phone: form.get("phone"),
        preferredContactMethod: form.get("preferredContactMethod"),
        targetTiming: form.get("targetTiming"),
        consent: form.get("consent") === "on",
      }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setConsultError(data.error || "상담 요청을 저장하지 못했습니다.");
      return;
    }
    setSubmitted(true);
  }

  function downloadReport() {
    const expectedImpactSection = `<h2>기대효과</h2><p><strong>직원의 불필요한 배달 업무 대체를 통한 업무 시간 확보</strong></p><p>${expectedImpact.available ? `하루 직원 배송 50건 기준 약 ${formatSavedTime(expectedImpact.savedSecondsPerDay)} 확보` : "건축물대장 연면적·층수 확인 후 자동 산출"}</p><p>확보된 인력을 고객 응대와 부가서비스 운영에 재배치해 새로운 수익 기회를 만들고, 야간·피크시간의 일관된 배송으로 고객 만족도를 높일 수 있습니다.</p>`;
    const appNotice = hasExistingApp ? "기존 앱이 있어 API 연동 비용이 발생할 수 있습니다." : "기존 앱이 없어 주문 서비스 비용 월 65,000원이 발생합니다.";
    const routeReport = routeCosts.map((routeCost) => `<li>경로 ${routeCost.routeNumber} · ${routeCost.startPoint} → ${routeCost.endPoint}</li>`).join("");
    const report = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>BRING Pre-Map 사전진단</title><style>body{font-family:Arial,sans-serif;color:#15152b;max-width:820px;margin:60px auto;line-height:1.7}h1{font-size:38px}h2{margin-top:34px;border-top:1px solid #ddd;padding-top:24px}ul{margin:0;padding:0;list-style:none}li{padding:9px 0;border-bottom:1px solid #eee}table{width:100%;border-collapse:collapse}td{padding:9px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:700}small{color:#666}</style><body><small>BRING PRE-MAP · PRELIMINARY REPORT</small><h1>${facility?.name || "시설"} 사전진단</h1><p>${facility?.address || ""}</p><h2>선택 서비스와 우선순위</h2><p>${selected.map((name, index) => `${index + 1}. ${name}`).join(" · ")}</p><h2>초기 운영안</h2><p>${(initialServiceNames || []).join(" + ")}</p>${selected.length > 2 ? `<p>확장 로드맵: ${selected.slice(2).join(" → ")}</p>` : ""}<h2>촬영 경로</h2><ul>${routeReport}</ul><h2>예비 견적</h2><p>${plan === "rental" ? `임대형 ${rentalTerm}개월` : `판매형 · 로봇 ${robots}대`} · 목적지 ${destinations}개</p><table><tr><td>목적지 기반 설치비</td><td>${formatWonExact(metrics.installation)}</td></tr>${plan === "purchase" ? `<tr><td>단말가</td><td>${formatWonExact(metrics.equipment)}</td></tr>` : ""}<tr><td>시설 연동비</td><td>${formatWonExact(metrics.facilityIntegration)}</td></tr><tr><td>검증된 개보수비</td><td>${formatWonExact(metrics.repairs)}</td></tr><tr><td>초기 일시납 합계</td><td>${formatWonExact(metrics.initial)}</td></tr><tr><td>월 고정 납부 합계</td><td>${formatWonExact(metrics.monthly)}</td></tr></table><p>${appNotice}</p><p>엘리베이터·자동문·수동문·경사로 비용은 기본 비용이며, 현장 실사 결과에 따라 달라질 수 있습니다.</p>${expectedImpactSection}</body></html>`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([report], { type: "text/html;charset=utf-8" }));
    link.download = `BRING_PreMap_${facility?.name || "사전진단"}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const progress = ["시설", "분석", "서비스", "경로", "촬영", "결과"];
  const captureStages = ["출발지", "엘리베이터", "목적지"];
  const capturePercent = Math.round((captureStage / 3) * 100);
  const categoryOptions = captureCategoryCatalog[captureStage];
  const currentCategory = categoryOptions.find((item) => item.name === activeCaptureCategory) || categoryOptions[0];
  const activeCategoryPhotos = photos[captureStage].filter((photo) => photo.category === currentCategory.name);
  const approvedCategoryPhotos = activeCategoryPhotos.filter((photo) => photo.aiVerified);
  const completedCategoryCount = categoryOptions.filter((item) =>
    photos[captureStage].some((photo) => photo.category === item.name)
    || captureObservations.some((observation) => observation.stage === captureStage && observation.category === item.name)
  ).length;

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setStep(0)} aria-label="처음으로">
          <span className="brand-mark"><i></i><i></i><i></i></span>
          <span>BRING <b>PRE-MAP</b></span>
        </button>
        <div className="top-progress" aria-label="진단 진행률">
          {progress.map((item, index) => {
            const mapped = step === 0 ? 0 : step === 0.5 ? 1 : step < 2 ? 2 : step === 2 ? 3 : step <= 5 ? 4 : 5;
            return <span key={item} className={index <= mapped ? "active" : ""}><i>{index < mapped ? "✓" : index + 1}</i>{item}</span>;
          })}
        </div>
        <div className="secure"><a className="admin-entry" href="/admin">관리자</a></div>
      </header>

      {step === 0 && (
        <section className="landing">
          <div className="landing-copy">
            <div className="mascot-speech"><span>안녕하세요!</span><strong>공간 진단을<br />도와드릴게요.</strong></div>
            <img className="landing-mascot" src="/bring-mascot-v3.png" alt="큰 머리와 파란 눈의 BRING 로봇 마스코트" />
            <div className="pc-recommendation"><i>PC</i><div><strong>PC 열람을 추천합니다</strong><span>진단과 결과 확인은 PC에서 진행하고, 현장 사진 촬영만 휴대폰으로 연결해 이용하세요.</span></div></div>
            <h1>공간을 이해하면, <em>도입은 더 선명해집니다.</em></h1>
            <p className="lead">시설을 선택하고 대표 이동 경로를 보여주세요. BRING이 서비스 조합부터 예상 편익까지 미리 그려드립니다.</p>
          </div>
          <div className="facility-selector">
            <p className="section-no">01 · FACILITY</p>
            <h2>어떤 공간에<br />BRING을 준비할까요?</h2>
            <div className="facility-grid">
              {(["호텔", "오피스", "아파트", "병원"] as FacilityType[]).map((type, index) => (
                <button key={type} className="facility-tile" onClick={() => { setFacilityType(type); setQuery(""); setResults([]); setSearchError(""); setCategoryError(""); setSearching(true); }}>
                  <span className="tile-index">0{index + 1}</span>
                  <span className="building-icon" aria-hidden="true"><i></i><i></i><i></i></span>
                  <strong>{type}</strong>
                  <small>{["HOTEL & RESORT", "OFFICE & HQ", "RESIDENCE", "HOSPITAL"][index]}</small>
                  <span className="tile-arrow">↗</span>
                </button>
              ))}
            </div>
            {searching && (
              <div className="search-panel">
                <div className="search-head"><span>{facilityType}</span><button onClick={() => setSearching(false)}>닫기</button></div>
                <label className="search-box">
                  <span>⌕</span>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${facilityType} 이름 또는 주소 검색`} />
                  <kbd>ENTER</kbd>
                </label>
                <p className="search-hint">{results.length ? "카카오맵 검색 결과입니다." : query.trim().length === 0 ? "시설명 또는 주소를 입력하면 검색 결과가 표시됩니다." : query.trim().length < 2 ? "계속 입력해주세요. 입력 중인 내용과 일치하는 시설이 있으면 바로 표시됩니다." : "입력한 시설을 검색하고, 결과가 없으면 입력한 이름으로 바로 시작할 수 있어요."}</p>
                <div className="search-results">
                  {searchLoading && <div className="searching-inline"><span className="search-spinner"></span> 실제 장소 검색 중</div>}
                  {visibleFacilities.map((item) => (
                    <button key={item.id || `${item.name}-${item.address}`} onClick={() => chooseFacility(item)}>
                      <span className={`place-dot ${item.tone}`}></span>
                      <span><strong>{item.name}</strong><small>{item.category} · {item.address}</small></span>
                      <b>{item.id?.startsWith("manual-") ? "직접 입력" : "선택"}</b>
                    </button>
                  ))}
                </div>
                {searchError && <p className="search-notice"><span>i</span>{searchError}</p>}
                {categoryError && <p className="error-text">! {categoryError}</p>}
              </div>
            )}
          </div>
          <div className="landing-foot"><span>KAKAO MOBILITY</span><span>BRING ROBOT DELIVERY SOLUTIONS</span><span>2026</span></div>
        </section>
      )}

      {candidate && step === 0 && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="시설 확인">
          <div className="confirm-modal">
            <button className="modal-close" onClick={() => setCandidate(null)}>×</button>
            <p className="eyebrow">FACILITY CONFIRMATION</p>
            <h2>이 시설이 맞나요?</h2>
            <div className="map-preview">
              <div className="road road-a"></div><div className="road road-b"></div><div className="road road-c"></div>
              <span className="pin"><i></i></span>
              <div className="map-label">{candidate.name}</div>
              <small>지도 미리보기</small>
            </div>
            <div className="facility-detail">
              <span className="type-pill">{candidate.category}</span>
              <h3>{candidate.name}</h3>
              <dl><div><dt>도로명</dt><dd>{candidate.address}</dd></div><div><dt>지번</dt><dd>{candidate.lot}</dd></div>{candidate.phone && <div><dt>대표전화</dt><dd>{candidate.phone}</dd></div>}</dl>
            </div>
            <section className={`building-register-panel ${buildingRegister?.status || "loading"}`} aria-live="polite">
              <div className="building-register-head"><div><h3>건축물대장 상세정보</h3></div>{buildingRegister?.status === "found" && <b>공공데이터 확인</b>}</div>
              {buildingRegisterLoading && <div className="building-register-loading"><span className="search-spinner"></span><p><strong>법정동·지번을 확인하고 있어요</strong><small>카카오 좌표를 건축물대장 표제부와 연결합니다.</small></p></div>}
              {!buildingRegisterLoading && buildingRegister?.status === "found" && <>
                <div className="building-register-title"><strong>{buildingRegister.buildingName}</strong><span>{buildingRegister.registerKind}</span></div>
                <div className="building-register-tags"><span>{buildingRegister.mainPurpose}</span><span>{buildingRegister.structure}</span></div>
                <dl className="building-register-metrics">
                  <div><dt>층수</dt><dd>지상 {buildingRegister.groundFloors ?? 0}층 · 지하 {buildingRegister.undergroundFloors ?? 0}층</dd></div>
                  <div><dt>연면적</dt><dd>{(buildingRegister.totalArea ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}㎡</dd></div>
                  <div><dt>승강기</dt><dd>{buildingRegister.elevatorCount ? `${buildingRegister.elevatorCount}대` : "확인 필요"}</dd></div>
                  <div><dt>사용승인일</dt><dd>{buildingRegister.approvalDate}</dd></div>
                  <div><dt>높이</dt><dd>{buildingRegister.height ? `${buildingRegister.height.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}m` : "확인 필요"}</dd></div>
                  <div><dt>주차</dt><dd>{buildingRegister.parkingCount ? `${buildingRegister.parkingCount}대` : "확인 필요"}</dd></div>
                </dl>
                <p className="building-register-address">{buildingRegister.legalAddress}</p>
                {(buildingRegister.matchedBuildingCount ?? 0) > 1 && <small className="building-register-note">동일 지번의 표제부 {buildingRegister.matchedBuildingCount}건 중 시설명·주건축물·면적을 기준으로 대표 건물을 표시합니다.</small>}
              </>}
              {!buildingRegisterLoading && (buildingRegister?.status === "not_found" || buildingRegister?.status === "unavailable" || buildingRegisterError) && <div className="building-register-empty"><strong>건축물대장 확인 필요</strong><p>{buildingRegisterError || buildingRegister?.error || "공개된 표제부 정보를 찾지 못했습니다."}</p><small>조회 실패를 건물 정보 없음으로 판단하지 않으며, 현장 실사에서 다시 확인합니다.</small></div>}
            </section>
            <div className="modal-actions"><button className="btn secondary" onClick={() => setCandidate(null)}>다른 시설 검색</button><button className="btn primary" disabled={buildingRegisterLoading} onClick={() => { setFacility(candidate); setFacilityAnalysis(null); setFacilityAnalysisLoading(true); setFacilityAnalysisStage(1); setFacilityAnalysisError(""); setInternalFnbDecision("unknown"); setDestinations(50); setSelected([]); setServiceSignals({}); setAnalysisFinalized(false); setClarificationCount(0); setTimeContextKnown(false); setAiMode("checking"); setRoute(routeDefaults[facilityType]); setMessages([{ role: "ai", text: `현재 ${facilityType === "호텔" ? "호텔" : facilityType}에서 개선하고 싶은 업무 또는 상황을 알려주세요!` }]); setCandidate(null); setStep(0.5); }}>{buildingRegisterLoading ? "건축물대장 확인 중…" : "확인하고 시설 분석"} <span>→</span></button></div>
          </div>
        </div>
      )}

      {step === 0.5 && (
        <section className="workspace facility-analysis-page">
          <div className="workspace-intro"><p className="eyebrow">02 · FACILITY CONTEXT</p><h1>추천 전에 시설의<br /><em>기본 정보를 확인합니다.</em></h1><p>{facility?.name} 주변 상권과 내부 F&B 후보를 먼저 확인해 서비스 추천에 반영합니다.</p></div>
          <div className="analysis-progress-card">
            <div className="analysis-progress-head"><span className="ai-orb">B</span><div><strong>{facilityAnalysisLoading ? "시설 데이터를 분석하고 있어요" : facilityAnalysis ? "시설 분석이 완료됐어요" : "자동 분석을 완료하지 못했어요"}</strong><small>확인되지 않은 정보는 임의로 추정하지 않습니다.</small></div></div>
            <div className="analysis-step-list">{["호텔·주소 표준화", "공식 홈페이지 F&B 확인", "GIS·동일주소 후보 확인", "2km 내 음식점 확인"].map((label, index) => <div key={label} className={facilityAnalysisStage > index + 1 ? "complete" : facilityAnalysisStage === index + 1 ? "active" : ""}><span className="analysis-step-label"><strong>{label}</strong></span><b>{facilityAnalysisStage > index + 1 ? "완료" : facilityAnalysisStage === index + 1 ? "진행 중" : "대기"}</b></div>)}</div>
          </div>
          <div className="facility-context-results">
            <article className="context-card internal-card"><h2>호텔 내부 F&B · 층수</h2><p>{facilityAnalysis?.websiteAnalysis?.status === "found" ? <>생성형 AI가 <a href={facilityAnalysis.websiteAnalysis.officialWebsite} target="_blank" rel="noreferrer">호텔 공식 홈페이지</a>만 근거로 확인했습니다.</> : facilityAnalysis?.websiteAnalysis?.status === "not_found" ? "공식 홈페이지를 찾지 못해 동일 도로명주소의 카카오 업소 후보를 확인했습니다." : "공식 홈페이지 AI 확인이 연결되지 않아 동일 주소 후보를 보조자료로 표시합니다."}</p>{facilityAnalysis?.internalCandidates.slice(0, 6).map((item) => <div className="fnb-candidate" key={item.id}><div><strong>{item.name}</strong><small>{item.floor || "층수 확인 필요"} · {item.source}</small></div><span className={item.confidence === "official" ? "verified" : ""}>{item.confidence === "official" ? "공식 확인" : "후보"}</span></div>)}{!facilityAnalysis?.internalCandidates.length && <div className="manual-fnb-check"><div><strong>검증 가능한 내부 F&B를 찾지 못했습니다.</strong><p>호텔 내부에 식음 시설이 있나요? 현장 정보를 직접 선택하면 서비스 추천에 바로 반영됩니다.</p></div><div className="manual-fnb-options" role="group" aria-label="호텔 내부 F&B 시설 유무"><button className={internalFnbDecision === "direct" ? "selected yes" : ""} aria-pressed={internalFnbDecision === "direct"} onClick={() => setInternalFnbDecision("direct")}><span>예</span><small>내부 F&B 있음</small></button><button className={internalFnbDecision === "none" ? "selected no" : ""} aria-pressed={internalFnbDecision === "none"} onClick={() => setInternalFnbDecision("none")}><span>아니오</span><small>내부 F&B 없음</small></button></div>{internalFnbDecision !== "unknown" && <p className={`manual-fnb-result ${internalFnbDecision === "direct" ? "yes" : "no"}`}>사용자 확인 · 내부 F&B {internalFnbDecision === "direct" ? "있음" : "없음"}으로 추천 조건에 반영했습니다.</p>}</div>}</article>
            <article className="context-card building-context-card"><h2>건물 정보</h2>{buildingRegister?.status === "found" ? <><strong className="building-context-name">{buildingRegister.buildingName}</strong><div className="building-context-grid"><span><small>주용도</small><b>{buildingRegister.mainPurpose}</b></span><span><small>층수</small><b>지상 {buildingRegister.groundFloors ?? 0} · 지하 {buildingRegister.undergroundFloors ?? 0}</b></span><span><small>연면적</small><b>{(buildingRegister.totalArea ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}㎡</b></span><span><small>승강기</small><b>{buildingRegister.elevatorCount ? `${buildingRegister.elevatorCount}대` : "확인 필요"}</b></span><span><small>구조</small><b>{buildingRegister.structure}</b></span><span><small>사용승인</small><b>{buildingRegister.approvalDate}</b></span></div><p>건축물대장은 로봇 동선 검토의 참고자료이며 실제 출입·승강기 연결 가능 여부는 현장 실사로 확정합니다.</p></> : <><strong className="building-context-name">공개 원장 확인 필요</strong><p>{buildingRegister?.error || buildingRegisterError || "해당 시설의 표제부를 자동으로 연결하지 못했습니다."}</p><span className="context-status unknown">현장 확인</span></>}</article>
            <article className="context-card outside-fnb-card"><h2>건물 외 F&B</h2>{facilityAnalysis ? <><strong className="context-number">{facilityAnalysis.restaurantCount}{facilityAnalysis.restaurantCountLowerBound ? "+" : ""}<small>곳</small></strong><p>카카오 Local API에서 최대 {facilityAnalysis.restaurantSearchLimit || 45}개를 확인했습니다. {facilityAnalysis.externalDeliveryEligible ? "20개 초과이므로 외부 배달 중개를 AI 서비스 추천에 포함합니다." : "20개 이하이므로 외부 배달 중개를 AI 서비스 추천에서 제외합니다."}</p><span className={`context-status ${facilityAnalysis.externalDeliveryEligible ? "eligible" : "limited"}`}>{facilityAnalysis.externalDeliveryEligible ? "AI 추천 포함" : "AI 추천 제외"}</span></> : <><strong className="context-number">—</strong><p>{facilityAnalysisError || "시설 좌표를 확인할 수 없어 직접 요구를 기준으로 추천합니다."}</p><span className="context-status unknown">확인 필요</span></>}</article>
          </div>
          <div className="analysis-start-action"><button className="btn primary" onClick={() => setStep(1)}>AI 서비스 인터뷰 시작 <span>→</span></button></div>
        </section>
      )}

      {step === 1 && (
        <section className="workspace interview-flow-page">
          <div className="workspace-intro">
            <p className="eyebrow">03 · AI SERVICE CHATBOT</p>
            <h1>대화로 요구를 찾고,<br /><em>직접 우선순위를 정하세요.</em></h1>
            <p>{facility?.name}에서 개선하고 싶은 업무와 상황을 자유롭게 이야기해주세요. 충분히 대화한 뒤 최종 분석을 요청하면 서비스 조합과 장점을 한 화면에서 확인할 수 있습니다.</p>
          </div>
          <div className="chat-panel interview-chat-panel">
            <div className="chat-title"><span className="ai-orb">B</span><div><strong>BRING 챗봇</strong></div></div>
            <div className="interview-question-guide"><strong>현재 {facilityType === "호텔" ? "호텔" : facilityType}에서 개선하고 싶은 업무 또는 상황을 알려주세요!</strong><p>누가 · 무엇을 · 어디에서 어디까지 옮기는지, 불편이 자주 발생하는 시간대와 개선 목표를 함께 알려주면 더 정확하게 분석할 수 있어요.</p></div>
            <div className="interview-examples"><small>예시 질문을 눌러 바로 대화해보세요</small><div className="chips">{questionChips.map((chip) => <button key={chip} disabled={interviewLoading} onClick={() => ask(chip)}>{chip}</button>)}</div></div>
            <div className="messages" ref={interviewMessagesRef} aria-live="polite" aria-busy={interviewLoading}>
              {messages.map((message, index) => <div key={index} className={`message ${message.role}`}>{message.role === "ai" && <span>B</span>}<p>{message.text}</p></div>)}
              {interviewLoading && <div className="message ai thinking-message" role="status"><span>B</span><div className="ai-thinking"><div><strong>생각 중</strong><span className="ai-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><small>질문이 정상적으로 전달됐습니다. Gemini가 답변을 준비하고 있어요.</small></div></div>}
            </div>
            <form className="chat-input" onSubmit={(e: FormEvent) => { e.preventDefault(); ask(); }}><input ref={interviewInputRef} disabled={interviewLoading} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="업무·상황·목표·시간대를 자유롭게 입력하세요" /><button disabled={interviewLoading} aria-label="인터뷰 답변 보내기">{interviewLoading ? "…" : "↑"}</button></form>
            <button className="final-analysis-button" disabled={!hasInterviewInput || interviewLoading} onClick={showFinalAnalysis}>{analysisFinalized ? "대화 내용 다시 최종 분석하기" : "요구사항 최종 분석"}<span>→</span></button>
            {!hasInterviewInput && <small className="analysis-button-help">한 번 이상 대화하면 최종 분석을 시작할 수 있습니다.</small>}
          </div>
          <aside className="service-info-panel" aria-label={`${facilityType} 제공 서비스 안내`}>
            <div className="service-info-head"><p className="eyebrow">AVAILABLE SERVICES</p><h2>{facilityType} 제공 서비스</h2><span>{services.length}가지 서비스 · 항목에 마우스를 올려보세요</span></div>
            <div className="service-info-list">{services.map((service, index) => <article className="service-info-card" key={service.name} tabIndex={0}><header><i>{String(index + 1).padStart(2, "0")}</i><strong>{service.name}</strong><b>＋</b></header><div><p>{service.short}</p><small>{service.route}</small></div></article>)}</div>
          </aside>
          {analysisFinalized && (
            <div className="interview-analysis-result" id="ai-recommendation">
              <div className="analysis-result-heading"><p className="eyebrow">AI RECOMMENDATION COMBINATION</p><h2>대화에서 파악한 요구를<br />서비스 조합으로 분석했어요.</h2></div>
              <div className="recommendation-case-summary"><span>대화 분석 · {recommendationModel.requested.length}개 서비스 요구 파악</span><strong>{recommendationModel.requested.length === 1 ? `${recommendationModel.requested[0]}을 포함한 카테고리별 최대 3개 시너지 조합` : recommendationModel.requested.length === 2 ? `${recommendationModel.requested.join(" + ")} 조합과 추후 확장 서비스` : recommendationModel.requested.length > 2 ? "요구 서비스 중 2개 조합 + 나머지 추후 확장 로드맵" : "서비스 요구를 명확하게 파악하지 못했습니다."}</strong>{recommendationModel.excludedRequested.length > 0 && <p><b>시설 조건상 조합 가이드 제외</b> {recommendationModel.excludedRequested.join(" · ")}{recommendationModel.excludedRequested.includes("외부 배달 중개") && " · 2km 이내 F&B가 20개 이하입니다."}</p>}{recommendationModel.requested.length > 2 && recommendationModel.priorityPair && <p><b>초기 조합</b> {recommendationModel.priorityPair.join(" + ")} · <b>추후 확장 로드맵</b> {aiRoadmapServices.join(" → ") || "운영 데이터 확인 후 결정"}</p>}</div>

              {recommendationModel.requested.length === 0 && <div className="analysis-empty"><strong>조금 더 구체적인 대화가 필요해요.</strong><p>누가 어떤 물품을 어디에서 어디까지 옮기는지, 반복 횟수와 불편한 시간대를 알려주신 뒤 다시 최종 분석해주세요.</p><button onClick={() => { setAnalysisFinalized(false); interviewInputRef.current?.focus(); }}>대화 계속하기</button></div>}

              {recommendationModel.directPair && <div className="direct-pair-note direct-pair-analysis"><span>요구에서 직접 확인된 서비스 조합</span><strong>{recommendationModel.directPair.join(" + ")}</strong><p>두 업무를 하나의 로봇 운영 체계로 통합하면 배차와 이동 동선을 함께 설계하고, 주문 접수·고객 알림·예외 대응 절차를 공유할 수 있습니다.</p><ul>{synergyDimensions.map((dimension) => <li key={dimension.key}><b>{dimension.title}</b><span>{dimension.description}</span></li>)}</ul></div>}

              {recommendationModel.requested.length > 0 && <div className="synergy-category-list">{synergyDimensions.map((dimension, dimensionIndex) => { const categoryCards = recommendationModel.cards.filter((card) => card.dimensions[0].key === dimension.key); return <section className="synergy-category" key={dimension.key}><header><i>0{dimensionIndex + 1}</i><div><h3>{dimension.title} 시너지 조합</h3><p>{dimension.description}에 부합하는 조합을 최대 3개까지 표시합니다.</p></div><b>{categoryCards.length}개 조합</b></header>{categoryCards.length ? <div className="criterion-grid">{categoryCards.map((card) => { const evidence = card.pair.map((name) => serviceSignals[name]?.evidence).filter(Boolean).join(" / "); return <article className="criterion-card" key={`${dimension.key}-${pairKey(...card.pair)}`}><div className="criterion-tags"><span>{dimension.title} 시너지</span><em>{synergyFor(...card.pair)[dimension.key]}/3</em></div><h2>{card.pair[0]} <i>+</i> {card.pair[1]}</h2><p><b>대화에서 확인한 요구</b>{evidence || "시설 운영 맥락과 대화에서 확인한 요구를 반영했습니다."}</p><ul><li><strong>{dimension.title}</strong><span>{dimension.description}</span>{dimension.key === "time" && !timeContextKnown && <em>실제 수요 시간대 추가 확인 필요</em>}</li></ul><small>조합의 실제 효과는 이동 동선, 상차·수령 담당자, 시설 연동 범위를 현장에서 확인한 뒤 확정합니다.</small></article>; })}</div> : <article className="criterion-card empty"><div className="criterion-tags"><span>{dimension.title}</span></div><h2>추가 확인 필요</h2><p>{dimension.key === "time" && !timeContextKnown ? "수요 시간대 정보가 부족해 해당 시너지 조합은 보류했습니다." : `${dimension.title} 기준에서 명확한 조합을 찾지 못해 임의로 추천하지 않았습니다.`}</p></article>}</section>; })}</div>}

              {recommendationModel.requested.length === 2 && recommendationModel.extensionService && <article className="extension-roadmap-card"><span>확장 운영 로드맵</span><div><small>{extensionSynergyDimension?.title} 시너지 서비스</small><strong>{recommendationModel.extensionService}</strong><p>{extensionSynergyDimension?.description} {recommendationModel.requested.join(" + ")} 운영 데이터를 확인한 뒤 추후 확장 서비스로 순차 도입을 검토하세요.</p></div></article>}

              <section className="customer-service-selection">
                <div className="section-heading"><div><p className="eyebrow">CUSTOMER PRIORITY</p><h2>제공받고 싶은 서비스를 원하는 순서대로 선택해주세요.</h2><p>선택 개수는 자유이며, 카드를 누른 순서가 고객 우선순위가 됩니다. AI가 선택 순서를 미리 정하지 않습니다.</p></div><span><b>{selected.length}</b>개 선택</span></div>
                <div className="final-selection-grid">{services.map((service) => { const selectionIndex = selected.indexOf(service.name); const selectedService = selectionIndex >= 0; return <button key={service.name} className={`final-service-card ${selectedService ? "selected" : ""}`} onClick={() => toggleService(service.name)} aria-pressed={selectedService}><i>{selectedService ? selectionIndex + 1 : "+"}</i><span>{selectedService ? `${selectionIndex + 1}순위 선택됨` : "선택 가능"}</span><small>{service.glyph}</small><h2>{service.name}</h2><p>{service.short}</p></button>; })}</div>
                {selected.length >= 3 && <p className="multi-note"><b>초기 운영 방안</b> {selected.slice(0, 2).join(" + ")} · <b>추후 확장 운영 방안</b> {selected.slice(2).join(" → ")}</p>}
                <div className="selection-actions"><button className="btn secondary" onClick={() => { setAnalysisFinalized(false); interviewInputRef.current?.focus(); }}>← 대화 더 하기</button><button className="btn primary" disabled={selected.length === 0} onClick={() => setStep(1.3)}>결과 확인 <span>→</span></button></div>
              </section>
            </div>
          )}
        </section>
      )}

      {step === 1.3 && (
        <section className="workspace service-result-page">
          <div className="service-result-hero"><p className="eyebrow">SERVICE RECOMMENDATION RESULT</p><span className="result-orb">✓</span><h1>고객 우선순위 기준<br /><em>서비스 운영안입니다.</em></h1></div>
          <div className="service-roadmap-result"><article><span>초기 운영 조합</span><strong>{selected.slice(0, Math.min(2, selected.length)).join(" + ")}</strong><p>{selected.length >= 3 ? "우선순위 1·2위를 초기 운영 범위로 제안합니다." : "선택한 서비스를 초기 운영 범위로 제안합니다."}</p></article><i>→</i><article className="expansion"><span>확장 운영 로드맵</span><strong>{selected.length >= 3 ? selected.slice(2).join(" → ") : "운영 데이터 확보 후 확장 검토"}</strong><p>초기 운행 데이터와 현장 실사 결과를 바탕으로 순차 확장합니다.</p></article></div>
          <div className="service-scope-grid">{selected.map((name, index) => { const policy = hotelServicePolicy[name]; return <article key={name}><header><i>{index + 1}</i><div><span>{index < 2 ? "초기 운영 후보" : "확장 운영 후보"}</span><h2>{name}</h2></div></header><div><strong>제공 가능 범위</strong><p>{policy?.range || services.find((service) => service.name === name)?.short}</p></div><div><strong>주요 제약·확인사항</strong><ul>{(policy?.constraints || ["실제 동선과 시설 연동 가능 여부는 현장 실사에서 확인합니다."]).map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></div>{name === "호텔 식음 배달" && <small>내부 F&B 근거 · {facilityAnalysis?.internalFnbStatus === "confirmed" ? `공식 홈페이지 확인 ${facilityAnalysis.internalCandidates.length}곳` : "직접 확인 필요"}</small>}{name === "외부 배달 중개" && <small>외부 F&B 근거 · 2km 이내 {facilityAnalysis?.restaurantCount ?? "—"}{facilityAnalysis?.restaurantCountLowerBound ? "+" : ""}곳</small>}</article>; })}</div>
          <div className="service-result-actions"><button className="btn secondary" onClick={() => { setAnalysisFinalized(true); setStep(1); }}>← 우선순위 다시 정하기</button><div><strong>다음은 공간 진단입니다.</strong><span>대표 경로를 정하고 휴대폰으로 장애물을 촬영할 수 있어요.</span></div><button className="btn primary" onClick={() => setStep(2)}>공간 진단 계속하기 <span>→</span></button></div>
        </section>
      )}

      {step === 2 && (
        <section className="route-page pc-route-launch">
          <div className="route-visual">
            <div className="route-visual-copy"><p className="eyebrow">03 · ROUTE SETUP</p><h1>로봇이 오갈<br /><em>대표 경로를 정해주세요.</em></h1><p>PC에서는 촬영 세션만 준비합니다. QR을 스캔한 휴대폰에서 출발지와 목적지를 입력한 뒤 바로 촬영을 시작할 수 있어요.</p></div>
            <div className="route-launch-flow"><div><i>1</i><strong>PC에서 촬영 준비</strong><span>고객 전용 QR 생성</span></div><b>→</b><div><i>2</i><strong>휴대폰에서 경로 입력</strong><span>출발지·목적지 설정</span></div><b>→</b><div><i>3</i><strong>현장 사진 촬영</strong><span>3단계 사진 업로드</span></div></div>
            <div className="route-tip"><span>i</span><p><b>촬영 전 안내</b> 통로 전체가 보이도록 휴대폰을 세로로 들고, 실제 로봇 이동 동선을 따라 걸어주세요.</p></div>
            <div className="route-launch-action"><button className="btn primary" onClick={createCaptureSession}>경로 촬영 준비 <span>→</span></button><button className="text-btn" onClick={() => setStep(1.3)}>← 서비스 결과 다시 보기</button>{sessionError && <p className="inline-error">{sessionError}</p>}</div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="connect-page workspace">
          <div className="connect-copy"><img className="connect-mascot" src="/bring-mascot-v3.png" alt="BRING 로봇 마스코트" /><p className="eyebrow">04 · PHOTO ANALYSIS</p><h1>휴대폰으로<br /><em>공간을 연결하세요.</em></h1><p>고객 전용 QR을 촬영 담당자에게 공유하세요. 만료 시간이나 앱 설치 없이 카메라로 바로 시작할 수 있습니다.</p></div>
          <div className="qr-card">
            <div className="qr-meta"><span>실시간 촬영 QR</span><small>고객 전용 · 만료 없음</small></div>
            <div className="qr-shell" aria-label="휴대폰 촬영 연결 QR 코드">{qrDataUrl ? <img src={qrDataUrl} alt="휴대폰 촬영 세션 QR 코드" /> : <span className="search-spinner"></span>}</div>
            <h2>휴대폰 카메라로 QR을 스캔하세요</h2><p>QR은 첫 번째 경로 촬영을 시작합니다. 추가 경로는 휴대폰 촬영 완료 화면에서 바로 만들 수 있어요.</p>
            <div className="share-buttons"><button onClick={() => navigator.clipboard?.writeText(captureUrl)}>링크 복사</button><button onClick={() => navigator.share ? navigator.share({ title: "BRING Pre-Map 공간촬영", text: `${facility?.name} 공간촬영 링크`, url: captureUrl }) : navigator.clipboard?.writeText(captureUrl)}>휴대폰으로 공유</button></div>
          </div>
          <div className="device-panel"><div className="device-head"><div><p className="eyebrow">CONNECTED DEVICES</p><h2>촬영 현황</h2></div><span className={connected ? "online" : ""}><i></i>{connected ? "1대 접속" : "접속 대기"}</span></div>
            <div className="device-route-list">{captureRoutes.map((captureRoute) => <article key={captureRoute.id}><span>ROUTE {String(captureRoute.routeNumber).padStart(2, "0")}</span><strong>{captureRoute.startPoint && captureRoute.endPoint ? `${captureRoute.startPoint} → ${captureRoute.endPoint}` : "휴대폰에서 경로 정보 입력 대기"}</strong><small>{captureRoute.startPoint && captureRoute.endPoint ? `${facility?.name}${captureRoute.usesElevator ? " · 엘리베이터 이용" : " · 같은 층 이동"}` : "QR 스캔 후 출발지와 목적지를 입력해주세요."}</small><b className={captureRoute.status === "completed" ? "complete" : ""}>{captureRoute.status === "completed" ? "완료" : captureRoute.startPoint ? "촬영 중" : "입력 대기"}</b></article>)}</div>
            {!connected ? <div className="waiting"><div className="phone-pulse"><span></span></div><strong>휴대폰 접속을 기다리고 있어요</strong><p>QR을 스캔하면 휴대폰에 출발지와 목적지 입력 화면이 먼저 나타납니다.</p></div> : <><div className="connected-card"><div className="device-icon">▯</div><div><strong>현장 담당자 휴대폰 · 경로 {sessionData?.routeSessions?.length || 1}개</strong><small>{sessionData?.status === "completed" ? "모든 경로 촬영 완료" : sessionData?.routeSessions?.some((item) => !item.startPoint || !item.endPoint) ? "휴대폰에서 경로 정보 입력 중" : `Step ${(sessionData?.currentStage || 0) + 1} 진행 중`} · 전체 사진 {sessionData?.photos?.length || 0}장</small></div><span>{sessionData?.status === "completed" ? "완료" : "접속 중"}</span></div><div className="live-progress"><div className="live-progress-copy"><span>현재 경로 촬영 진행률</span><strong>{sessionData?.status === "completed" ? 100 : Math.round(((sessionData?.currentStage || 0) / 3) * 100)}%</strong></div><div className="live-progress-track"><i style={{ width: `${sessionData?.status === "completed" ? 100 : Math.round(((sessionData?.currentStage || 0) / 3) * 100)}%` }}></i></div><div className="live-stage-list">{captureStages.map((stageName, index) => { const currentStage = sessionData?.currentStage || 0; const complete = sessionData?.status === "completed" || index < currentStage; const active = sessionData?.status !== "completed" && index === currentStage; return <div key={stageName} className={complete ? "complete" : active ? "active" : ""}><i>{complete ? "✓" : index + 1}</i><span><strong>{stageName}</strong><small>{complete ? "촬영 완료" : active ? "휴대폰에서 촬영 중" : "대기 중"}</small></span><b>{complete ? "완료" : active ? "진행" : "대기"}</b></div>; })}</div></div></>}
            {sessionData?.status === "completed" && <div className="handoff-ready"><img src="/bring-mascot-v3.png" alt="" /><div><strong>휴대폰 촬영이 모두 완료됐어요!</strong><p>경로 {sessionData?.routeSessions?.length || 1}개의 사진과 항목 분류가 이 컴퓨터에 동기화되었습니다. 추가 경로는 휴대폰 완료 화면에서만 만들 수 있어요.</p></div><button className="btn primary wide" onClick={() => setStep(5)}>이 컴퓨터에서 분석 계속하기 <span>→</span></button></div>}
            {sessionError && <p className="inline-error">{sessionError}</p>}
          </div>
        </section>
      )}

      {step === 3.8 && (
        <section className="mobile-route-setup">
          <div className="mobile-route-card">
            <p className="eyebrow">ROUTE {String(captureRouteNumber).padStart(2, "0")} · MOBILE SETUP</p>
            <h1>촬영할 경로를<br />휴대폰에서 입력해주세요.</h1>
            <p>입력한 출발지와 목적지는 PC 촬영 현황과 경로별 진단 결과에 실시간으로 연결됩니다.</p>
            <label><span>출발지</span><input value={route.start} onChange={(event) => setRoute({ ...route, start: event.target.value })} placeholder={routeExamples[facilityType].start} /><small>물품을 싣고 로봇이 출발하는 곳</small></label>
            <label><span>목적지</span><input value={route.end} onChange={(event) => setRoute({ ...route, end: event.target.value })} placeholder={routeExamples[facilityType].end} /><small>고객 또는 직원이 물품을 받는 곳</small></label>
            <div className="elevator-toggle"><div><span>엘리베이터 이용</span><small>경로 중 층간 이동이 있나요?</small></div><button className={route.elevator ? "on" : ""} onClick={() => setRoute({ ...route, elevator: !route.elevator })} aria-pressed={route.elevator}><i></i></button></div>
            <div className="route-summary"><span>{route.start || "출발지"}</span><i>→</i>{route.elevator && <><span>엘리베이터</span><i>→</i></>}<span>{route.end || "목적지"}</span></div>
            <button className="btn primary wide" disabled={!route.start.trim() || !route.end.trim()} onClick={saveMobileRouteAndStart}>경로 저장하고 촬영 시작 <span>→</span></button>
            <small className="mobile-example-note">회색 문구는 입력 예시이며 실제 경로 정보로 저장되지 않습니다.</small>
            {sessionError && <p className="inline-error">{sessionError}</p>}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="capture-page">
          <div className="capture-top"><div className="capture-route-name"><p className="eyebrow">ROUTE CAPTURE {captureRouteNumber}</p><strong>{facility?.name}</strong></div><div className="capture-progress-center"><div className="capture-progress-meta"><span><b>Step {captureStage + 1}</b> · {captureStages[captureStage]}</span><strong>{capturePercent}%</strong></div><div className="capture-progress-track"><i style={{ width: `${capturePercent}%` }}></i></div><div className="stage-progress">{captureStages.map((item, index) => <button type="button" key={item} className={index < captureStage ? "complete" : index === captureStage ? "active" : ""} onClick={() => goToCaptureStage(index)} aria-current={index === captureStage ? "step" : undefined} aria-label={`Step ${index + 1} ${item}로 이동`}><i>{index < captureStage ? "✓" : index + 1}</i><b>Step {index + 1} · {item}</b></button>)}</div></div><small>Step을 눌러 이동</small></div>
          <nav className="capture-category-strip" aria-label={`${captureStages[captureStage]} 촬영 항목`}>
            <div className="capture-category-instruction"><i>↔</i><div><strong>해당되는 장애물을 선택해서 사진을 찍어주세요.</strong><span>위 Step과 아래 세부 항목을 눌러 언제든 자유롭게 이동할 수 있어요.</span></div></div>
            <div className="capture-category-meta"><span>{captureStage + 1}번째 Step 세부 항목</span><strong>{completedCategoryCount}<i>/</i>{categoryOptions.length}</strong></div>
            <div className="capture-category-tabs" style={{ gridTemplateColumns: `repeat(${Math.min(categoryOptions.length, 6)}, minmax(92px, 1fr))` }}>{categoryOptions.map((item, index) => { const count = photos[captureStage].filter((photo) => photo.category === item.name).length; const measured = captureObservations.some((observation) => observation.stage === captureStage && observation.category === item.name); const recorded = count > 0 || measured; return <button key={item.name} className={`${currentCategory.name === item.name ? "active" : ""} ${recorded ? "complete" : ""}`} onClick={() => selectCaptureCategory(item.name)}><i>{recorded ? "✓" : `0${index + 1}`}</i><span>{item.name}</span>{count > 0 && <b>{count}</b>}{count === 0 && measured && <b>측정</b>}</button>; })}</div>
          </nav>
          <div className="capture-body">
            <div className="capture-guide"><p className="eyebrow">STEP 0{captureStage + 1} · {currentCategory.name}</p><h1>{currentCategory.title}</h1><p>{currentCategory.description}</p><div className="capture-example"><span className="frame-corner a"></span><span className="frame-corner b"></span><span className="frame-corner c"></span><span className="frame-corner d"></span><div className="perspective"><i></i><i></i><i></i><b>B</b></div><div className="camera-symbol"><i></i><strong>{currentCategory.key === CAPTURE_CATEGORY.ELEVATOR_INSIDE ? "열린 문·호출 버튼·출입 폭이 한 화면에" : "공간 전체가 프레임 안에 오도록"}</strong><small>{currentCategory.key === CAPTURE_CATEGORY.ELEVATOR_INSIDE ? "카 내부에서 승강장 방향으로 촬영해주세요." : "휴대폰을 가로로 돌리면 더 넓게 담을 수 있어요."}</small></div><div className="capture-guide-badge"><i></i>{currentCategory.name} 카메라 가이드</div></div>{currentCategory.guideSteps && <ol className="capture-guide-steps">{currentCategory.guideSteps.map((step, index) => <li key={step}><i>{index + 1}</i><span>{step}</span></li>)}</ol>}<div className="capture-tip"><span>TIP</span><p>{currentCategory.tip}</p></div></div>
            <div className="capture-controls">
              <div className="capture-stage-summary"><div><small>현재 촬영 항목</small><strong>{currentCategory.name}</strong></div><div><small>AI 승인 사진</small><strong>{approvedCategoryPhotos.length}장</strong></div><div><small>저장된 사진</small><strong>{activeCategoryPhotos.length}장</strong></div><span className={uploading ? "syncing" : "synced"}><i></i>{uploading ? "AI 확인 중" : "O/X AI 검증"}</span></div>
              <div className="required-photo"><div><h2>{currentCategory.name} 사진</h2><p>생성형 AI가 실제 사진이 ‘{currentCategory.name}’ 항목과 맞는지 확인한 뒤 승인된 사진만 저장합니다.</p></div><label className={`upload-button ${uploading ? "loading" : ""}`}>{uploading ? "AI 사진 확인 중…" : "▣ 사진 촬영하기 →"}<input disabled={uploading} type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} /></label></div>
              {photoAiReview.state !== "idle" && <div className={`photo-ai-review ${photoAiReview.state}`} aria-live="polite"><i>{photoAiReview.state === "accepted" ? "✓" : photoAiReview.state === "rejected" ? "!" : "AI"}</i><div><strong>{photoAiReview.state === "checking" ? "생성형 AI 사진 판독 중" : photoAiReview.state === "accepted" ? "AI 확인·Supabase 저장 완료" : "선택 항목과 불일치"}</strong><p>{photoAiReview.message}</p></div></div>}
              <div className="photo-list">{activeCategoryPhotos.map((photo, index) => <div className="photo-thumb" key={photo.url}><img src={photo.url} alt={`${currentCategory.name} 촬영사진 ${index + 1}`} /><span>{index + 1}</span><b>{currentCategory.name}</b><em>{photo.aiStatus === "VERIFIED" ? "O · 승인" : photo.aiStatus === "REJECTED" ? "X · 미승인" : photo.aiStatus === "UPLOADED" ? "분석 중" : "AI 재확인 대기"}</em></div>)}{activeCategoryPhotos.length === 0 && <div className="empty-photo-state"><span>AI</span><b>저장된 {currentCategory.name} 사진이 없습니다.</b><small>사진은 Supabase 저장 후 O/X 단일 AI 검증을 진행합니다.</small></div>}</div>
              {sessionError && <p className="inline-error">{sessionError}</p>}
              <button className="btn primary wide" onClick={() => setShowStageConfirm(true)}>{captureStage === 2 ? "Step 3 완료 및 분석 시작" : `Step ${captureStage + 1} 완료 · 다음 단계`} <span>→</span></button>
            </div>
          </div>
          {showStageConfirm && <div className="modal-backdrop"><div className="small-modal capture-confirm"><img src="/bring-mascot-v3.png" alt="" /><span className="notice-icon">!</span><h2>장애물 사진을 모두 확인하셨나요?</h2><p>Step {captureStage + 1} · {captureStages[captureStage]}에서 {completedCategoryCount}개 항목, 사진 {photos[captureStage].length}장을 기록했습니다. 사진을 찍지 않은 항목이 있어도 다음 단계로 넘어갈 수 있습니다.</p><div><button className="btn secondary" onClick={() => setShowStageConfirm(false)}>다시 확인하기</button><button className="btn primary" onClick={completeStage}>네, 넘어갈게요</button></div></div></div>}
          {slopeOpen && <div className="modal-backdrop slope-backdrop" role="dialog" aria-modal="true" aria-label="경사로 각도 측정"><div className="slope-meter"><button className="modal-close" onClick={() => setSlopeOpen(false)}>×</button><p className="eyebrow">GYRO INCLINOMETER</p><h2>휴대폰을 경사로에 놓아주세요.</h2>{slopeStatus === "ready" ? <><div className={`slope-stability ${slopeStable ? "stable" : ""}`}><i></i>{slopeStable ? "측정값 안정됨" : "휴대폰을 움직이지 마세요"}</div><div className="protractor"><div className="protractor-arc"><i style={{ transform: `rotate(${Math.max(-90, Math.min(0, slopeAngle - 90))}deg)` }}></i><span style={{ transform: `rotate(${Math.max(-90, Math.min(0, slopeAngle - 90))}deg)` }}></span></div><strong>{slopeAngle.toFixed(1)}<em>°</em></strong><small>실시간 기울기 · 자이로 자동 측정</small></div><div className="slope-scale"><span>0°</span><span>15°</span><span>30°</span><span>45°</span><span>90°</span></div><div className="slope-instructions"><span><i>1</i>케이스를 벗겨주세요</span><span><i>2</i>뒷면을 경사면에 밀착하세요</span><span><i>3</i>안정 표시 후 저장하세요</span></div><p>iPhone Safari와 Galaxy Chrome·Samsung Internet의 동작 센서를 함께 지원합니다. 저장한 측정값은 해당 경사로 항목으로 즉시 동기화됩니다.</p><div className="slope-actions"><button className="btn secondary" onClick={() => { setSlopeOffset(rawSlopeAngle.current); slopeSamples.current = []; setSlopeStable(false); setSlopeAngle(0); }}>0점 보정</button><button className="btn primary" disabled={!slopeStable} onClick={saveSlopeMeasurement}>{slopeStable ? `${slopeAngle.toFixed(1)}° 저장` : "측정값 안정화 중"}</button></div></> : <div className="sensor-fallback"><span>!</span><h3>{slopeStatus === "denied" ? "동작 센서 권한이 필요합니다." : "이 브라우저는 각도 센서를 지원하지 않습니다."}</h3><p>{slopeStatus === "denied" ? "iOS 설정에서 Safari의 동작 및 방향 접근을 허용한 뒤 다시 시도해주세요." : "Chrome 또는 Safari 최신 버전에서 접속하거나 아래에 측정값을 직접 입력하세요."}</p><label><input type="number" min="0" max="90" step="0.1" value={slopeAngle} onChange={(e) => setSlopeAngle(Number(e.target.value))} /> °</label><button className="btn primary" onClick={saveSlopeMeasurement}>측정값 저장</button></div>}</div></div>}
        </section>
      )}

      {step === 4.5 && (
        <section className="mobile-capture-complete">
          <div className="mobile-complete-card">
            <img src="/bring-mascot-v3.png" alt="촬영 완료를 안내하는 BRING 로봇" />
            <p className="eyebrow">ROUTE {String(captureRouteNumber).padStart(2, "0")} UPLOAD COMPLETE</p>
            <span className="mobile-complete-check">✓</span>
            <h1>경로 {captureRouteNumber} 촬영이<br />모두 업로드됐어요!</h1>
            <p>AI 확인을 통과한 사진 {Object.values(photos).flat().length}장이 PC 촬영 현황에 자동으로 동기화되었습니다.</p>
            <div className="mobile-route-summary"><span>{route.start}</span><i>→</i><span>{route.end}</span></div>
            <button className="btn primary wide" disabled={creatingNextRoute} onClick={startAnotherMobileRoute}>{creatingNextRoute ? "새 촬영 경로 준비 중…" : "＋ 경로 추가하기"}</button>
            <div className="mobile-pc-handoff"><strong>이제 PC로 이동해도 좋습니다!</strong><p>추가로 촬영할 경로가 없다면 휴대폰에서는 여기서 마치고, 처음 QR을 표시했던 PC로 돌아가 분석과 결과 확인을 계속해주세요.</p><span>휴대폰에서는 분석·결과 화면으로 이동하지 않습니다.</span></div>
            {sessionError && <p className="inline-error">{sessionError}</p>}
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="analysis-page workspace">
          <div className="result-hero"><p className="eyebrow">SPACE PRE-DIAGNOSIS</p><span className="result-orb">✓</span><h1>모든 경로 분석이<br /><em>완료되었습니다.</em></h1><p>경로별로 사진에서 관찰된 요소와 현장에서 추가 확인할 항목을 구분했어요.</p><div className="pc-route-help"><strong>경로별 진단 결과를 선택해서 확인하세요.</strong><span>경로가 여러 개라면 아래의 경로 탭을 눌러 각 경로의 출발지·목적지와 촬영 결과를 확인할 수 있습니다.</span></div><div><button className="btn primary" onClick={openResults}>종합 결과 저장하고 보기 <span>→</span></button></div></div>
          <div className="analysis-content"><div className="route-tabs">{captureRoutes.map((captureRoute) => <button key={captureRoute.id} className={Number(captureRoute.routeNumber) === Number(activeAnalysisRoute?.routeNumber) ? "active" : ""} onClick={() => setActiveAnalysisRouteNumber(Number(captureRoute.routeNumber))}>경로 {captureRoute.routeNumber} <span>{captureRoute.startPoint} → {captureRoute.endPoint}</span></button>)}</div>
            <div className="analysis-summary"><div><span>A</span><strong>{activeAnalysisRoute?.startPoint}</strong></div><i>→</i>{activeAnalysisRoute?.usesElevator && <><div><span>↕</span><strong>엘리베이터</strong></div><i>→</i></>}<div><span>B</span><strong>{activeAnalysisRoute?.endPoint}</strong></div></div>
            <div className="finding-grid">{activeRouteFindingNames.map((name, index) => { const categoryPhotos = Object.entries(photos).flatMap(([stage, items]) => items.filter((photo) => Number(photo.routeNumber || 1) === Number(activeAnalysisRoute?.routeNumber || 1) && photo.category === name).map(() => Number(stage))); const categoryObservations = activeRouteObservations.filter((item) => item.category === name); const measurement = categoryObservations.find((item) => item.slopeAngle != null); const steps = Array.from(new Set([...categoryPhotos, ...categoryObservations.map((item) => item.stage)])).map((stage) => `Step ${stage + 1}`).join(" · "); const recorded = categoryPhotos.length > 0 || categoryObservations.length > 0; const measured = measurement?.slopeAngle != null; return <article key={name} className={!recorded ? "muted" : ""}><div className="finding-top"><span className={`status ${recorded ? (measured ? "check" : "observed") : "none"}`}>{measured ? "측정됨" : recorded ? "촬영됨" : "기록 없음"}</span><small>{String(index + 1).padStart(2, "0")}</small></div><h3>{name}</h3>{recorded ? <><p>{measured ? `경사도 ${Number(measurement?.slopeAngle).toFixed(1)}°가 해당 항목에 저장되어 사진 여부와 관계없이 분석에 반영되었습니다.` : `${name} 사진 ${categoryPhotos.length}장이 촬영 당시 선택한 항목으로 자동 분류되어 분석에 반영되었습니다.`}</p><div className="action-line"><span>수집된 현장 기록</span><b>{measured ? `${steps} · 경사도 ${Number(measurement?.slopeAngle).toFixed(1)}°` : `${steps} · 사진 ${categoryPhotos.length}장`}</b></div></> : <p>사진이나 측정값이 없어 판단하지 않은 항목입니다. 현장에 없는 것으로 단정하지 않습니다.</p>}</article>; })}</div>
            <p className="disclaimer">사진 분석은 설치 가능 여부를 확정하지 않습니다. 정확한 치수, 안전 기준, 설비 연동은 전문 컨설턴트의 현장 실사에서 확인합니다.</p>
          </div>
        </section>
      )}

      {step === 6 && (
        <section className="results-page">
          <div className="results-nav"><div><p className="eyebrow">BRING PRE-MAP REPORT</p><h1>{facility?.name}</h1><span>{facility?.address}</span></div><div>{saveStatus === "error" && <button className="btn secondary" onClick={saveDiagnosisSnapshot}>다시 저장</button>}<button className="btn secondary" onClick={downloadReport}>↓ 리포트 다운로드</button><button className="btn primary" onClick={() => setConsultOpen(true)}>컨설턴트 연결 <span>→</span></button></div></div>
          <div className="results-layout">
            <aside className="report-index"><span>진단 요약</span>{["서비스 조합", "공간 분석", "예비 견적", "기대효과", "다음 단계"].map((item, index) => <a href={`#result-${index}`} key={item}><i>0{index + 1}</i>{item}</a>)}</aside>
            <div className="report-content">
              <section className="executive-summary"><div><p className="eyebrow">PRE-DIAGNOSIS SUMMARY</p><h2>작게 시작하고,<br />운영 데이터로 확장하세요.</h2><p>대표 경로는 BRING 운영을 검토할 수 있는 기본 조건을 갖추고 있습니다. 다만 엘리베이터 문턱과 자동문 연동은 현장 실사가 필요합니다.</p></div><div className="summary-metrics"><div><small>초기 조합</small><strong>2</strong><span>개 서비스</span></div><div><small>대표 경로</small><strong>{sessionData?.routeSessions?.length || 1}</strong><span>개 분석</span></div><div><small>실사 항목</small><strong>3</strong><span>개 확인</span></div></div></section>
              <section className="report-section" id="result-0"><div className="report-title"><span>01</span><div><p className="eyebrow">SERVICE ROADMAP</p><h2>초기 운영안과 확장 순서</h2></div></div><div className="best-pair"><span>{selected.length === 1 ? "SINGLE SERVICE START" : "CUSTOMER PRIORITY · INITIAL PAIR"}</span><h3>{(initialServiceNames || []).join(" + ")}</h3><p>AI 추천과 고객이 조정한 우선순위를 함께 기록했으며, 최종 운영안은 고객이 정한 순서를 우선합니다. 3개 이상 선택한 경우 1·2위는 초기 운영, 나머지는 확장 운영으로 구분합니다.</p><div><span>초기 운영 · {(initialServiceNames || []).join(" + ")}</span><i>→</i><span>{selected.length > 2 ? `확장 · ${selected.slice(2).join(" → ")}` : "운영 데이터 확보 후 확장 검토"}</span></div></div><div className="report-service-scope">{selected.map((name, index) => <article key={name}><span>{index + 1}순위 · {index < 2 ? "초기" : "확장"}</span><h3>{name}</h3><p><b>제공 범위</b>{hotelServicePolicy[name]?.range}</p><ul>{hotelServicePolicy[name]?.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></article>)}</div></section>
              <section className="report-section" id="result-1"><div className="report-title"><span>02</span><div><p className="eyebrow">SPACE FINDINGS</p><h2>공간 사전진단</h2></div></div><div className="space-cards"><article><span className="status observed">관찰됨</span><h3>자동문·보안문</h3><p>로봇 호출 연동 또는 상시 개방 운영 확인</p></article><article><span className="status check">현장 확인</span><h3>엘리베이터 문턱</h3><p>승강장 틈과 단차의 실제 치수 측정</p></article><article><span className="status check">현장 확인</span><h3>피크 시간 혼잡도</h3><p>고객 동선과 로봇 대기 위치 확인</p></article></div></section>
              <section className="report-section" id="result-2"><div className="report-title"><span>03</span><div><p className="eyebrow">PRELIMINARY QUOTE</p><h2>조건을 선택하면 견적이 바로 계산됩니다.</h2></div></div>
                <div className="quote-route-selector"><span>견적에 반영할 루트</span><div role="tablist" aria-label="견적에 반영할 루트 선택">{captureRoutes.map((captureRoute) => { const routeNumber = Number(captureRoute.routeNumber || 1); const active = routeNumber === Number(activeAnalysisRoute?.routeNumber || 1); return <button key={captureRoute.id || routeNumber} type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={() => setActiveAnalysisRouteNumber(routeNumber)}>루트 {routeNumber}</button>; })}</div></div>
                <div className="quote-calculator">
                  <div className="quote-steps">
                    <section className="quote-step"><header><i>01</i><div><strong>구매 방식과 대수</strong><span>임대형 또는 판매형을 선택하세요.</span></div></header><div className="quote-choice-grid"><button className={plan === "rental" ? "active" : ""} onClick={() => setPlan("rental")} aria-pressed={plan === "rental"}><b>임대형</b><small>기간별 월 90~130만원/대</small></button><button className={plan === "purchase" ? "active" : ""} onClick={() => setPlan("purchase")} aria-pressed={plan === "purchase"}><b>판매형</b><small>월 기본 이용료 11.5만원/대</small></button></div><div className="quote-inline-fields"><div className="calc-field"><span>도입 로봇 대수</span><div className="stepper"><button onClick={() => setRobots(Math.max(1, robots - 1))} aria-label="로봇 대수 줄이기">−</button><strong>{robots}</strong><button onClick={() => setRobots(Math.min(10, robots + 1))} aria-label="로봇 대수 늘리기">＋</button></div></div>{plan === "rental" ? <><div className="calc-field"><span>임대 기간</span><div className="term-selector">{([12, 24, 36] as const).map((term) => <button key={term} className={rentalTerm === term ? "active" : ""} onClick={() => setRentalTerm(term)}><b>{term}개월</b><small>{rentalMonthlyRates[term].toLocaleString("ko-KR")}원/대</small></button>)}</div></div><label><span>월 임대료 합계 <b>{robots}대 자동계산</b></span><div><input type="text" readOnly value={metrics.monthlyBase.toLocaleString("ko-KR")} /><em>원/월</em></div><small>{rentalTerm}개월 기준 대당 {rentalMonthlyFee.toLocaleString("ko-KR")}원 × {robots}대</small></label></> : <label><span>단말가 합계 <b>{robots}대 자동계산</b></span><div><input type="text" readOnly value={metrics.equipment.toLocaleString("ko-KR")} /><em>원</em></div></label>}</div></section>
                    <section className="quote-step"><header><i>02</i><div><strong>목적지 수</strong><span>기본 50개에서 실제 운영 환경에 맞게 직접 조정하세요.</span></div></header><label className="destination-input"><span>시설 내 목적지 개수</span><div><input type="number" min="0" value={destinations} onChange={(e) => setDestinations(Math.max(0, Number(e.target.value)))} /><em>개</em></div></label><p className="formula">목적지 {destinations}개 기준 설치비 <b>{formatWonExact(metrics.installation)}</b></p></section>
                    <section className="quote-step"><header><i>03</i><div><strong>현장 사진 검증과 개보수</strong><span>경사도는 7° 이상일 때 경사로 설치 비용이 기본 선택됩니다.</span></div></header><div className="verified-options"><label className={!manualDoorVerified ? "disabled" : manualDoorRepair ? "selected" : ""}><input type="checkbox" disabled={!manualDoorVerified} checked={manualDoorRepair && manualDoorVerified} onChange={(e) => setManualDoorRepair(e.target.checked)} /><span><b>수동문 수정</b><small>+5,000,000원</small></span><em>{manualDoorVerified ? manualDoorRepair ? "분석 결과 자동 선택" : "검증 PASS" : "사진 검증 필요"}</em></label><label className={!rampVerified ? "disabled" : rampRepair ? "selected" : ""}><input type="checkbox" disabled={!rampVerified} checked={rampRepair && rampVerified} onChange={(e) => setRampRepair(e.target.checked)} /><span><b>경사로 설치</b><small>+3,000,000원</small></span><em>{maxRampSlopeAngle != null ? rampRequiresRepair ? `경사도 ${maxRampSlopeAngle.toFixed(1)}° · 7° 이상 자동 선택` : rampRepair ? `경사도 ${maxRampSlopeAngle.toFixed(1)}° · 직접 선택` : `경사도 ${maxRampSlopeAngle.toFixed(1)}° · 7° 미만 기본 미선택` : rampVerified ? "경사도 측정 필요" : "사진·경사도 검증 필요"}</em></label></div></section>
                    <section className="quote-step"><header><i>04</i><div><strong>서비스와 시설 연동</strong><span>기존 주문 앱과 건물 설비 연동 조건을 선택하세요.</span></div></header><div className="app-choice"><span>기존 주문 앱</span><div className="segmented"><button className={hasExistingApp ? "active" : ""} onClick={() => setHasExistingApp(true)}>있음</button><button className={!hasExistingApp ? "active" : ""} onClick={() => setHasExistingApp(false)}>없음</button></div></div>{hasExistingApp ? <p className="auto-charge">기존 앱이 있으면 API 연동 비용이 발생할 수 있습니다. 실제 비용은 연동 범위를 확인한 후 안내합니다.</p> : <p className="auto-charge">기존 앱이 없으면 주문 서비스 비용 월 65,000원이 발생합니다.</p>}<div className="integration-options"><label className={elevatorIntegration ? "selected" : ""}><input type="checkbox" checked={elevatorIntegration} onChange={(e) => setElevatorIntegration(e.target.checked)} /><span>엘리베이터 연동</span><b>+500만원</b></label><label className={automaticDoorIntegration ? "selected" : ""}><input type="checkbox" checked={automaticDoorIntegration} onChange={(e) => setAutomaticDoorIntegration(e.target.checked)} /><span>자동문 연동</span><b>+180만원</b></label></div><p className="quote-condition-note">엘리베이터·자동문·수동문·경사로 비용은 기본 비용이며, 현장 실사 결과에 따라 달라질 수 있습니다.</p></section>
                  </div>
                  <aside className="quote-output"><p className="eyebrow">LIVE QUOTE</p><div className="quote-total"><small>초기 일시납 비용</small><strong>{formatWon(metrics.initial)}</strong><span>{formatWonExact(metrics.initial)} · 부가세 별도</span></div><div className="monthly-total"><span>월 고정 납부 비용</span><strong>{formatWon(metrics.monthly)}</strong></div><div className="quote-breakdown"><p><span>단말가</span><b>{formatWonExact(metrics.equipment)}</b></p><p><span>목적지 설치비</span><b>{formatWonExact(metrics.installation)}</b></p><p><span>시설 연동비</span><b>{formatWonExact(metrics.facilityIntegration)}</b></p><p><span>검증된 개보수비</span><b>{formatWonExact(metrics.repairs)}</b></p><hr /><p><span>{plan === "rental" ? `월 임대료 · ${rentalTerm}개월` : "월 기본 이용료"}</span><b>{formatWonExact(metrics.monthlyBase)}</b></p><p><span>주문 서비스 이용료</span><b>{formatWonExact(metrics.orderService)}</b></p></div><small className="quote-note">표시된 시설 연동·개보수 비용은 기본 비용이며 현장 실사에 따라 달라질 수 있습니다.</small></aside>
                </div>
              </section>
              <section className="report-section expected-impact" id="result-3"><div className="report-title"><span>04</span><div><p className="eyebrow">EXPECTED IMPACT</p><h2>BRING 도입으로 기대되는 변화</h2></div></div><div className="impact-grid">
                <article className="impact-card primary-impact"><header><i>1</i><span>QUANTITATIVE</span></header><h3>직원의 불필요한 배달 업무 대체를 통한 업무 시간 확보</h3><p>반복적인 물품 배송을 BRING이 수행해 직원이 고객 응대와 핵심 업무에 집중할 수 있습니다.</p><div className="impact-time"><small>하루 직원 배송 50건 기준</small>{expectedImpact.available ? <><strong>{formatSavedTime(expectedImpact.savedSecondsPerDay)}</strong><span>매일 확보 가능한 직원 업무 시간</span></> : <><strong>산출 대기</strong><span>건축물대장 연면적과 층수 확인 후 자동 계산</span></>}</div>{expectedImpact.available && <dl className="impact-source"><div><dt>건축물대장 연면적</dt><dd>{expectedImpact.totalArea.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}㎡</dd></div><div><dt>전체 층수</dt><dd>{expectedImpact.totalFloors}층</dd></div><div><dt>평균 층별 면적</dt><dd>{expectedImpact.averageFloorArea.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}㎡</dd></div></dl>}</article>
                <article className="impact-card"><header><i>2</i><span>NEW VALUE</span></header><h3>배달 업무 인력 재배치를 통한 새로운 수익 창출</h3><p>배달에 투입되던 시간을 컨시어지, 고객 맞춤 서비스, 부가상품 운영 등 더 높은 가치를 만드는 업무에 재배치할 수 있습니다.</p><ul><li>새로운 서비스 기획·운영 여력 확보</li><li>추가적인 수익 창출 기회 확대</li></ul></article>
                <article className="impact-card"><header><i>3</i><span>CUSTOMER EXPERIENCE</span></header><h3>고객 만족도 향상</h3><p>인력이 부족한 야간과 주문이 몰리는 시간에도 필요한 물품을 안정적으로 전달해 지연과 서비스 편차를 줄입니다.</p><ul><li>야간·피크시간 대응 품질 향상</li><li>빠르고 일관된 고객 경험 제공</li></ul></article>
              </div><p className="impact-disclaimer">기대효과는 국토교통부 건축물대장 정보와 하루 직원 배송 50건 가정을 적용한 사전 추정치이며, 실제 이동 경로·대기시간·운영 방식에 따라 달라질 수 있습니다.</p></section>
              <section className="final-cta" id="result-4"><p className="eyebrow">READY FOR THE NEXT STEP?</p><h2>현장 실사에서는<br />더 정확한 답을 드립니다.</h2><p>지금까지 입력한 시설, 서비스, 경로, 비용 가정과 기대효과를 다시 설명할 필요 없이 컨설턴트에게 그대로 전달하세요.</p><div><button className="btn secondary" onClick={downloadReport}>↓ 리포트 다운로드</button><button className="btn light" onClick={() => setConsultOpen(true)}>컨설턴트에게 전달 <span>→</span></button></div><small>본 결과는 사전진단이며 최종 설치 가능 여부, 견적 및 실제 운영효과를 의미하지 않습니다.</small></section>
            </div>
          </div>
        </section>
      )}

      {consultOpen && (
        <div className="modal-backdrop consult-backdrop" role="dialog" aria-modal="true">
          <div className="consult-modal">
            <button className="modal-close" onClick={() => setConsultOpen(false)}>×</button>
            {!submitted ? <><p className="eyebrow">CONSULTANT HAND-OFF</p><h2>이 정보를 컨설턴트와<br />연결하시겠습니까?</h2><p>입력하신 진단내용과 보고서가 담당 컨설턴트에게 함께 전달됩니다.</p><form onSubmit={submitConsultation}><div className="form-grid"><label><span>회사·기관명</span><input name="organization" required defaultValue={facility?.name} /></label><label><span>부서</span><input name="department" required placeholder="예: 호텔운영팀" /></label><label><span>담당자명</span><input name="contactName" required placeholder="이름" /></label><label><span>직책</span><input name="title" required placeholder="예: 매니저" /></label><label><span>회사 이메일</span><input name="email" required type="email" placeholder="name@company.com" /></label><label><span>연락처</span><input name="phone" required type="tel" placeholder="010-0000-0000" /></label><label><span>희망 연락방식</span><select name="preferredContactMethod"><option>전화</option><option>이메일</option><option>화상 미팅</option></select></label><label><span>희망 도입시기</span><select name="targetTiming"><option>3개월 이내</option><option>6개월 이내</option><option>올해 안</option><option>검토 중</option></select></label></div><label className="agree"><input name="consent" required type="checkbox" /><span>개인정보, 촬영자료 및 사전진단 보고서의 상담 목적 전달에 동의합니다.</span></label>{consultError && <p className="inline-error">{consultError}</p>}<button className="btn primary wide" type="submit" disabled={saveStatus === "saving"}>{saveStatus === "saving" ? "안전하게 저장 중…" : "상담 정보 전달하기 →"}</button></form></> : <div className="success-state"><span>✓</span><p className="eyebrow">REQUEST RECEIVED</p><h2>상담 요청이<br />안전하게 접수되었습니다.</h2><p>담당 컨설턴트가 진단 내용을 먼저 검토한 뒤 영업일 기준 1일 이내 연락드릴게요.</p><button className="btn primary" onClick={() => setConsultOpen(false)}>결과 화면으로 돌아가기</button></div>}
          </div>
        </div>
      )}
    </main>
  );
}
