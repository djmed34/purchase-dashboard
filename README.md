# 협력사 의존도 대시보드

5년간(2021~2025) 매입현황을 근거로 **의존도가 높은 협력사의 대체 업체(이원화) 발굴 여부**를 판단하는 분석 대시보드.
설계: [`../dashboard-prd.md`](../dashboard-prd.md)

> ⚠️ 협력사명·매입액·단가 등 사내 기밀 데이터 포함. **royalnco 조직 Private 저장소 + Private Pages**로만 게시한다.

## 화면

| View | 결정 질문 |
|------|-----------|
| 의존도 리스크 개요 | 어느 협력사를 먼저 검토할 것인가 |
| 협력사 상세 | 이 업체를 이원화해야 하는가 (대체 후보·품번 단가 포함) |
| 품목군 집중도 | 어느 품목군이 공급 구조상 취약한가 |

필터(연도·분기·대분류·품목군·공급 형태·거래 상태)를 바꾸면 모든 지표가 브라우저에서 다시 계산된다.
협력사 상세는 `#view=supplier&s=<구매처코드>` 링크로 바로 열 수 있다.

## 구조

```
data/raw/            연도별 매입 원본 (2021매입.xlsx …)  ← 새 연도 파일을 여기에 추가
data/config/
  category-map.csv        품번 접두어 → 대분류/품목군 매핑 (초안, 실무 확인 필요)
  supplier-exceptions.csv 구매처코드 재사용 예외 (50631 분리)
  dependency-rules.json   의존도 기준치·가중치·인사이트 조건
scripts/build_data.py  정제·분류·집계 → public/data/{purchase,meta}.json (원본 합계 불일치 시 실패)
app/, components/, lib/  Next.js 정적 앱 (shadcn/ui 스타일 + Tailwind + Recharts)
```

## 로그인

GitHub Pages는 서버가 없어 일반 로그인(서버 세션)을 쓸 수 없다. 대신 **데이터 자체를 암호화**한다.

- `build_data.py`가 집계 데이터를 AES-256-GCM으로 암호화해 `public/data/secure.json`만 게시(평문 미게시)
- 사용자별 비밀번호 → PBKDF2(SHA-256, 60만 회)로 키 파생 → 데이터키 복호화 → 브라우저에서만 데이터 열람
- 계정은 `DASHBOARD_USERS`(`아이디:비밀번호;…`, 비밀번호 12자 이상) — 로컬 `.env`, CI는 GitHub Secrets
- 세션은 브라우저 탭 단위(sessionStorage), 8시간 후 만료. 계정 추가·변경 = `.env`/Secret 수정 후 재배포
  (재배포 시 데이터키가 바뀌어 기존 세션은 자동 로그아웃)
- 한계: 서버가 없으므로 로그인 시도 횟수 제한·감사 로그는 불가. **강한 비밀번호 필수, Private Pages 병행 권장**

## 로컬 실행

```bash
pip install -r scripts/requirements.txt
cp .env.example .env              # 계정 입력
python scripts/build_data.py      # 집계 + 암호화 → public/data/secure.json
npm ci
npm run preview                   # GitHub Pages와 동일 방식: http://localhost:8080/purchase-dashboard/
npm run dev                       # 개발 서버(핫리로드): http://localhost:3000
```

`npm run preview`는 CI와 같은 `BASE_PATH=/<repo>` 정적 빌드 후, `/<repo>/` 하위 경로에서만 파일을 내주는 서버로 띄운다(그 외 404).
평문 개발 모드(`build_data.py --no-auth`)는 로그인 없이 열리며 화면에 "게시 금지" 표시가 뜬다.

## 데이터 갱신

1. 새 연도 파일(`2026매입.xlsx`, 동일 컬럼 구조)을 `data/raw/`에 추가하거나 `data/config/*`를 수정
2. main 브랜치에 push → GitHub Actions가 집계·빌드·배포

## 배포 (GitHub Pages)

1. royalnco 조직에 **Private** 저장소 생성 후 이 폴더 내용을 push
2. Settings → Pages → Source: **GitHub Actions**
3. Settings → Pages → Visibility: **Private** (GitHub Enterprise Cloud 필요 — 정보관리팀 확인)
   - Private Pages를 쓸 수 없으면 **배포하지 말 것**. 대안: Supabase(로그인+RLS) 데이터 레이어 전환 또는 사내 로컬 열람
4. `.github/workflows/deploy.yml`이 basePath(`/<repo>`)를 자동 주입한다

## 의존도 판단 기준 (v1)

- 대표 품목군(매입액 최대) 내 비중 ≥ 50%
- 단독 공급(기간 내 공급사 1곳인 품번) 매입 비중 ≥ 30%
- 대표 품목군 비중 3년 연속 상승 (최근 비중 20% 이상일 때만 인정)
- 위 3개 중 2개 이상 충족 + 기간 매입 1억 원 이상 → **고의존**
- 의존도 점수 = 비중×0.5 + 단독 비중×0.3 + 추세×0.2 (×100)
