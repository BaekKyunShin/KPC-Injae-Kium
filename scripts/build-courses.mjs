#!/usr/bin/env node
// data/*.xlsx → courses_grouped.json
//
// 사내 시스템에서 추출한 엑셀(헤더명 기반)을 읽어 사이트가 사용하는
// courses_grouped.json을 생성한다. 컬럼 순서는 무관, 헤더명만 맞으면 된다.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as XLSX from 'xlsx';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DATA_DIR = join(ROOT, 'data');
const OUTPUT = join(ROOT, 'courses_grouped.json');

// 엑셀 헤더 → 내부 키
const HEADER_MAP = {
  과정명: '과정명',
  대분류: '대분류',
  중분류: '중분류',
  과정유형: '유형',
  교육구분: '구분',
  기준단가: '교육비',
  일반회원: '회원가',
  교육일수: '일수',
  총교육시간: '시간',
  No: 'no',
  시작일: '시작일',
  종료일: '종료일',
  지역구분: '지역',
  '주소(URL)': '링크',
  웹공개: '웹공개',
};

const REQUIRED_HEADERS = Object.keys(HEADER_MAP);

function pickLatestXlsx(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => {
      const full = join(dir, f);
      return { full, name: f, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    throw new Error(`data/ 폴더에 .xlsx 파일이 없습니다. 엑셀을 data/ 에 저장해 주세요.`);
  }
  return files[0];
}

function toIsoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  // 이미 YYYY-MM-DD 형태면 그대로
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return s; // 알 수 없는 형식은 그대로 두고 검증 단계에서 잡음
}

function toNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function validateHeaders(rows, source) {
  if (rows.length === 0) {
    throw new Error(`엑셀(${source})에 행이 없습니다.`);
  }
  const present = new Set(Object.keys(rows[0]));
  const missing = REQUIRED_HEADERS.filter((h) => !present.has(h));
  if (missing.length > 0) {
    throw new Error(
      `엑셀(${source})에 필수 헤더가 없습니다: ${missing.join(', ')}\n` +
        `확인된 헤더: ${[...present].join(', ')}`
    );
  }
}

function normalizeRow(raw) {
  const r = {};
  for (const [excelKey, internalKey] of Object.entries(HEADER_MAP)) {
    r[internalKey] = raw[excelKey];
  }
  return r;
}

function buildGrouped(rawRows) {
  const errors = [];
  const grouped = new Map();

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2; // 헤더가 1행
    const r = normalizeRow(raw);

    // 웹공개 = 'Y'만 사용
    if (String(r.웹공개 ?? '').trim().toUpperCase() !== 'Y') return;

    const 과정명 = String(r.과정명 ?? '').trim();
    if (!과정명) {
      errors.push(`행 ${rowNum}: 과정명 누락`);
      return;
    }
    const 시작일 = toIsoDate(r.시작일);
    const 종료일 = toIsoDate(r.종료일);
    if (!시작일 || !/^\d{4}-\d{2}-\d{2}$/.test(시작일)) {
      errors.push(`행 ${rowNum} (${과정명}): 시작일 형식 오류 → ${r.시작일}`);
      return;
    }
    if (!종료일 || !/^\d{4}-\d{2}-\d{2}$/.test(종료일)) {
      errors.push(`행 ${rowNum} (${과정명}): 종료일 형식 오류 → ${r.종료일}`);
      return;
    }

    const session = {
      no: toNumber(r.no),
      시작일,
      종료일,
      지역: String(r.지역 ?? '').trim(),
      교육비: toNumber(r.교육비),
      회원가: toNumber(r.회원가),
      링크: String(r.링크 ?? '').trim(),
      일수: toNumber(r.일수),
      시간: toNumber(r.시간),
    };

    if (!grouped.has(과정명)) {
      grouped.set(과정명, {
        과정명,
        대분류: String(r.대분류 ?? '').trim(),
        중분류: String(r.중분류 ?? '').trim(),
        유형: String(r.유형 ?? '').trim(),
        구분: String(r.구분 ?? '').trim(),
        교육비: session.교육비,
        회원가: session.회원가,
        일수: session.일수,
        시간: session.시간,
        차수: [],
      });
    }
    grouped.get(과정명).차수.push(session);
  });

  if (errors.length > 0) {
    console.warn(`\n[경고] 건너뛴 행 ${errors.length}개:`);
    errors.slice(0, 10).forEach((e) => console.warn('  ' + e));
    if (errors.length > 10) console.warn(`  ... 외 ${errors.length - 10}개`);
  }

  // 정렬 및 파생값
  const result = [...grouped.values()].map((g) => {
    g.차수.sort((a, b) => a.시작일.localeCompare(b.시작일));
    const regions = [...new Set(g.차수.map((s) => s.지역).filter(Boolean))].sort();
    const months = [...new Set(g.차수.map((s) => s.시작일.slice(0, 7)))].sort();
    const starts = g.차수.map((s) => s.시작일);
    const prices = g.차수.map((s) => s.교육비).filter((n) => n > 0);
    return {
      ...g,
      regions,
      months,
      minStart: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
      maxStart: starts.length ? starts.reduce((a, b) => (a > b ? a : b)) : null,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
    };
  });

  result.sort((a, b) => a.과정명.localeCompare(b.과정명, 'ko'));
  return result;
}

function patchHtmlCounts(filename, courseCount, sessionCount) {
  const full = join(ROOT, filename);
  let html;
  try {
    html = readFileSync(full, 'utf8');
  } catch {
    return; // 파일 없으면 무시
  }
  const before = html;
  const cMatches = (html.match(/<!--C-->[^<]*<!--\/C-->/g) || []).length;
  const sMatches = (html.match(/<!--S-->[^<]*<!--\/S-->/g) || []).length;
  html = html.replace(/<!--C-->[^<]*<!--\/C-->/g, `<!--C-->${courseCount}<!--/C-->`);
  html = html.replace(/<!--S-->[^<]*<!--\/S-->/g, `<!--S-->${sessionCount}<!--/S-->`);
  if (html !== before) writeFileSync(full, html, 'utf8');
  console.log(
    `[build-courses] ${filename}: 과정 마커 ${cMatches}개 / 차수 마커 ${sMatches}개 갱신`
  );
}

function main() {
  const file = pickLatestXlsx(DATA_DIR);
  console.log(`[build-courses] 읽는 파일: data/${file.name}`);

  const wb = XLSX.read(readFileSync(file.full), { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`[build-courses] 엑셀 행 수: ${rows.length}`);

  validateHeaders(rows, file.name);
  const grouped = buildGrouped(rows);

  const totalSessions = grouped.reduce((acc, g) => acc + g.차수.length, 0);
  console.log(
    `[build-courses] 과정 ${grouped.length}개 / 차수 ${totalSessions}개 → courses_grouped.json`
  );

  writeFileSync(OUTPUT, JSON.stringify(grouped, null, 0) + '\n', 'utf8');
  console.log(`[build-courses] 완료: ${OUTPUT}`);

  // HTML 정적 카운트 자동 갱신
  patchHtmlCounts('index.html', grouped.length, totalSessions);
  patchHtmlCounts('courses.html', grouped.length, totalSessions);
}

main();
