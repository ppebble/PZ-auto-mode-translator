# Helper 배포 구조

## 배포물 분리

| 배포물 | 배포 위치 | 역할 | 포함하지 않는 것 |
| --- | --- | --- | --- |
| `PZ AI Translator` | Steam Workshop | 게임 설정, 대상 모드 선택, 작업 요청 작성, 생성팩 로딩 | API Key, API 호출 코드, Node worker |
| `PZ-AI-Translator-Helper-<version>.zip` | GitHub Release | 로컬 API 요청, 스캔, 검증, 생성팩 설치 | API Key, 사용자 번역 결과, Steam 모드 |

Workshop Lua는 B42에서 Java/HTTP/프로세스 실행 권한이 없으므로 Helper를 Workshop에 넣어 자동 실행하는 구조는 채택하지 않는다.

## ZIP 내용

```text
PZ-AI-Translator-Helper-<version>/
  START-PZAITranslatorHelper.vbs
  STOP-PZAITranslatorHelper.vbs
  README-KO.md
  VERSION.txt
  SHA256SUMS.txt
  config/rules.example.json
  tools/
    PZAITranslatorHelper.vbs
    Stop-PZAITranslatorHelper.vbs
    watch-translation-jobs.ps1
    run-translation.ps1
    worker/*.cjs
```

`package-helper.ps1`는 위 파일만 staging directory에 복사해 ZIP을 만들고, API Key·runtime·생성된 번역팩은 절대 포함하지 않는다.

## 사용자 의존성

초기 beta 배포는 Node.js 20 LTS 이상을 전제한다. 이유는 worker가 Node 내장 `fetch`와 `AbortSignal.timeout`를 사용하며, 외부 패키지나 설치 권한을 추가로 요구하지 않기 때문이다.

후속 릴리스에서 Node SEA 또는 서명된 Windows 실행 파일을 평가해 Node 설치 의존성을 제거한다. 이 변경은 바이너리 보안 검토와 업데이트/서명 정책이 필요하므로 beta의 범위에서 분리한다.

## 릴리스 절차

```powershell
.\tools\package-helper.ps1 -Version 0.1.0-beta.1
```

생성된 `dist\PZ-AI-Translator-Helper-0.1.0-beta.1.zip`을 GitHub Release asset으로 올린다. Steam Workshop 설명에는 해당 Release 링크와 Node.js 요구사항을 함께 표시한다.
