# 토플메이트 (TOEFL Mate) - PRD

## 제품 개요
2026년 개정 TOEFL iBT의 Speaking(Interview)과 Writing(Email, Discussion) 섹션을 실전처럼 연습할 수 있는 웹앱.

## 목표 사용자
- TOEFL 2026 준비 수험생
- 학원에서 받은 문제/템플릿을 체계적으로 연습하고 싶은 사람

## 핵심 기능

### 1. 사용자 인증
- 회원가입: 닉네임(자유 텍스트) + 비밀번호
- 로그인/로그아웃
- 사용자별 문제 데이터 분리

### 2. 문제 관리
- Excel(.xlsx), Word(.docx) 파일 업로드로 문제 일괄 등록
- 수동 문제 추가/삭제
- 문제 유형: Speaking Interview / Writing Email / Writing Discussion

### 3. Speaking Interview 연습
- TTS로 문제 음성 출력 (텍스트 숨김, TOEFL 실전 화면)
- 45초 응답 타이머 (원형 프로그레스)
- 선택적 녹음 + STT 자동 전사
- 리뷰: 문제 텍스트 + 템플릿 + STT 결과

### 4. Writing Email 연습
- 시나리오 + bullet points 제시
- 7분 타이머 + 실시간 단어 수 (TOEFL 기준)
- 제출 후 양옆 비교 (내 답변 vs 템플릿)
- diff 하이라이트로 차이점 표시
- 걸린 시간 + 단어 수 통계

### 5. Writing Discussion 연습
- 교수 프롬프트 + 학생 응답 2개 제시
- 10분 타이머 + 실시간 단어 수
- 나머지 Email과 동일

### 6. 암기 모드
- 카드 형태: 문제 → 답변(탭하면 표시)
- 좌우 스와이프/화살표 키 내비게이션
- 모든 유형(Speaking, Email, Discussion) 지원

### 7. 스마트 랜덤 출제
- 덜 노출된 문제 우선 출제
- 같은 세션 내 중복 방지
- 출제 이력 추적

## 기술 사양
- **Backend**: FastAPI (Python 3.13)
- **Frontend**: Vanilla JS + CSS (빌드 도구 없음)
- **Database**: SQLite
- **TTS/STT**: Web Speech API
- **Diff**: diff-match-patch
- **PWA**: Service Worker + manifest.json

## 2026 TOEFL 형식 반영

### Speaking Interview Task
- 인터뷰어가 같은 주제 4문제 순차 출제
- 난이도: Personal Recall → Preference → Opinion → Prediction/Policy
- 응답 45초, 준비 시간 없음

### Writing Email Task
- 캠퍼스/일상 상황 + 3 bullet points
- 7분 제한, 120-180단어 목표
- Subject, greeting, body, closing 포함

### Writing Discussion Task
- 교수 프롬프트 + 학생 응답 2개
- 자기 입장 + 근거 작성
- 10분 제한, 최소 100단어

### TOEFL 단어 수 기준
- 공백 기준 분리
- 하이픈 단어 = 1개 (well-known)
- 축약형 = 1개 (don't)
- 숫자 = 1개 (2026)
- 순수 기호 제외

## 실행 방법
```bash
cd 토플메이트
pip3 install fastapi uvicorn openpyxl aiofiles bcrypt python-multipart
python3 server.py
# http://localhost:8000 접속
```

또는 macOS에서 `start.command` 더블클릭으로 실행.

## 플랫폼 지원
- **랩탑**: Chrome, Safari, Edge (localhost:8000)
- **모바일**: PWA로 홈 화면에 추가 가능 (Chrome, Safari)
