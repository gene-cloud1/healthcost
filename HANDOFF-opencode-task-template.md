# opencode 하청용 작업지시서 템플릿 (강남구 전체 재개용)

> `HANDOFF-2026-08-24.md`에서 참조하는 파일. opencode에 --all 강남구 수집을 맡길 때
> 이 내용을 스크래치패드에 파일로 저장한 뒤 `-f` 옵션으로 첨부해서 쓸 것.

## 실행 명령 패턴

```bash
opencode run "첨부한 스펙대로 강남구 전체(캡 없이) 실데이터를 수집해라. 스크립트에 안정성 패치가 이미 있다(resultCode 에러 감지, 병원 하나 끝날 때마다 즉시 저장 및 재실행 시 이어서 진행, ykiho 중복 제거) — 로직을 건드리지 말고 그대로 실행만 해라. 몇 시간 걸려도 정상이니 끝까지 진행해라. git commit/push, PLAN 문서 작성 금지." --dir "C:/Users/USER/Desktop/healthcost" -m opencode/nemotron-3-ultra-free --agent build -f "<스펙파일 경로>" --print-logs --log-level DEBUG
```

- `run_in_background: true`로 실행할 것.
- 실행 후 15~20초 뒤 로그를 한 번 확인해서 `stream error`(모델 자체 다운) 없이 정상
  연결됐는지부터 확인. 안 되면 다른 free 모델로 즉시 전환 (`opencode models` 로 목록
  확인 — 지난번 확인된 것: `opencode/big-pickle`, `opencode/hy3-free`,
  `opencode/mimo-v2.5-free`, `opencode/muse-spark-1.2-contributor-free`,
  `opencode/nemotron-3-ultra-free`, `opencode/nemotron-3.5-lightning-free`,
  `opencode/x-preview-f-free`).

## 스펙 파일 내용 (-f 로 첨부할 마크다운)

```markdown
# Task: 강남구 전체 병의원 실데이터 수집 (매우 오래 걸림)

작업 디렉터리: C:\Users\USER\Desktop\healthcost (이미 이 디렉터리에서 실행 중)

## 배경
지금 `data/nonbenefit-prices.ts`에는 강남구·서초구·송파구 실데이터가 있다. 강남구만
캡 없이 전체로 다시 받는다.

`scripts/fetch-hira-data.mjs`에 이미 다음이 구현되어 있다 — **로직을 건드리지 말고
그대로 실행만 해라**:
- `--all` 플래그로 구당 병원 수 캡 해제
- 병원 하나 끝날 때마다 `data/nonbenefit-prices.ts`에 즉시 저장
- `data/_progress-강남구.json`에 처리 완료 ykiho 기록 → 재실행하면 이어서 진행 (처음부터
  다시 안 함)
- 병원 목록 자체의 ykiho 중복 제거 (페이지네이션이 불안정해서 같은 병원이 여러 페이지에
  또 나올 수 있음)

## 실행할 명령

```
node scripts/fetch-hira-data.mjs --all 강남구
```

## 매우 중요
- 몇 시간 걸릴 수 있다 — 정상이다. 오래 걸린다고 멈추지 마라.
- **중간에 완전히 죽으면(예: 실행 환경 자체의 시간 제한) 겁먹지 말고 정확히 같은 명령을
  다시 실행해라.** progress 파일 덕분에 이미 끝낸 병원은 건너뛰고 이어서 진행된다 —
  처음부터 다시 하는 게 아니다.
- 진행 중 5분 이상 아무 로그도 안 찍히는 것처럼 보이면, 그건 단일 병원 조회가
  느려서(HIRA 서버가 원래 느림, 최대 60초+재시도) 그럴 수 있다. `data/_progress-강남구.json`
  파일의 수정 시각이 최근 몇 분 안이면 정상 진행 중인 것이다.
- 병원 목록 스캔 단계에서 "중복 제외" 누적 매칭 수가 계속 큰 폭으로 늘어나기만 하고
  안정되지 않으면(예: 페이지 15가 넘었는데도 계속 수백씩 늘어남) 이상 신호이니 로그를
  남기고 계속 진행하되, 완료 보고에 이 사실을 반드시 적어라.

## 완료 후
1. `npx tsc --noEmit`과 `npx vitest run`으로 검증 (8개 테스트 통과해야 함)
2. `data/_debug-hosp-page1.json`, `data/_debug-nonpay-sample.json` 디버그 파일 삭제
3. **PLAN 문서, 요약 문서 등 스펙에 없는 파일을 새로 만들지 마라.**
4. **git commit이나 git push는 하지 마라.** 결과는 내가 직접 검토하고 커밋한다.

## 완료 보고
아래 형식으로 요약해라:
- 강남구 최종 확보 건수, 실제 처리된 병원 수 (병원 목록 스캔에서 몇 개나 매칭됐는지 포함)
- tsc/vitest 결과
- 총 소요 시간, 중간에 재시작이 몇 번 필요했는지
- 건드린 파일 목록 (data/nonbenefit-prices.ts, data/_progress-강남구.json 외에 있으면 나열)
```
