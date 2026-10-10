# 공개 자료와 근거 데이터

`freedom-edge.json`은 2024년 6월 첫 프리덤 에지를 다룬 공개 문서 8개의 짧은 원문 발췌와 근거 22개를 포함한다. 실제 원문을 읽고 질문 범위에 맞춰 주장을 사전 구조화했다. 자동 추출 모델의 결과나 친구의 검토를 완료한 데이터로 표시하지 않는다.

원문 전체를 저장한 파일은 아니다. 각 문서의 `body`는 분석에 사용한 발췌와 일부 출처 귀속 문구를 이어 붙인 **발췌 스냅샷**이다. `Evidence.start`와 `end`는 이 스냅샷 내 문자 위치이며, 원래 웹페이지의 문자 위치를 뜻하지 않는다. 원문 전체의 맥락은 각 URL에서 확인한다.

| ID | 발행기관 | 자료 | 준비 시 확인 방식 |
| --- | --- | --- | --- |
| `japan-mod` | 일본 방위성 | [3국 공동발표 PDF](https://www.mod.go.jp/js/pdf/2024/p20240627_01e.pdf) | PDF 다운로드 후 텍스트에서 발췌 일치 확인 |
| `navy` | US Navy | [공동발표 재게시](https://www.navy.mil/Press-Office/News-Stories/Article/3819224/trilateral-statement-first-execution-of-multi-domain-japan-rok-us-exercise-free/) | HTML에서 발췌·귀속 문구 확인 |
| `global` | GlobalSecurity | [미 해군 공동발표 아카이브](https://www.globalsecurity.org/military/library/news/2024/06/mil-240627-usn02.htm) | HTML에서 발췌·귀속 문구 확인 |
| `kbs-start` | KBS WORLD | [개시 보도](https://world.kbs.co.kr/service/news_view.htm?Seq_Code=186330&lang=e) | HTML에서 발췌·합참 귀속 문구 확인 |
| `kbs-end` | KBS WORLD | [종료 보도](https://world.kbs.co.kr/service/news_view.htm?Seq_Code=186362&lang=e) | HTML에서 발췌·합참 귀속 문구 확인 |
| `yonhap` | 연합뉴스 | [종료에 관한 합참 발표 보도](https://www.yna.co.kr/view/AKR20240629020200504) | HTML에서 한국어 발췌·합참 귀속 문구 확인 |
| `usni` | USNI News | [공동발표에 따른 개시 보도](https://news.usni.org/2024/06/27/u-s-japan-and-korea-begin-freedom-edge-exercise-north-korea-attempts-ballistic-missile-test) | 웹 읽기 도구로 확인. 서버 HTTP 요청은 403을 반환할 수 있음 |
| `stripes` | Stars and Stripes | [한국 국방부 발표에 따른 개시 보도](https://www.stripes.com/branches/navy/2024-06-27/freedom-edge-us-navy-south-korea-japan-14312190.html) | 준비 시 웹 읽기 도구로 확인 |

## 원출처 관계

- 공동발표, 6월 27일 합참 발표, 6월 29일 합참 발표, 6월 27일 한국 국방부 발표를 구분해 기록했다.
- 공동발표를 재게시하거나 인용한 자료는 관련 주장에 대해 같은 근거 묶음으로 묶었다. 같은 사건을 보도했다는 이유만으로 묶은 것은 아니다.
- 발표 간 독립성을 확인한 데이터는 없으므로, 모든 묶음의 초기 독립성 상태는 `unconfirmed`다. 발행기관·문서 수가 늘어도 자동으로 독립성을 올리지 않는다.
- 수집한 원문 발췌의 범위가 제한되어 있으므로, 관계에 대한 분석가의 추가 검토가 필요하다. 분석 화면에서 수정할 수 있고 변경 이유가 기록된다.

## 인용 검증과 데이터 변경

- 각 발췌 스냅샷의 SHA-256 해시를 저장한다.
- 분석 시 해시와 원문 위치·발췌의 일치를 검사한다. 검증에 실패한 근거는 보고서에서 제외한다.
- 날짜·참가국·목적·형식의 `value`는 원문을 한국어로 정규화한 사전 주석이다. 인용 존재 검사는 해당 해석의 타당성을 자동으로 보증하지 않는다.
- 실제 데이터셋에는 합성 상충 사례를 넣지 않았다. 합성 자료는 `tests/analysis.test.ts` 안의 검증용 fixture로만 사용한다.
- 데이터 파일을 수정하면 `version`도 갱신해야 한다. 이미 저장된 보고서는 당시 사용한 자료를 자체 보존한다.

`scripts/prepare-dataset.ts`는 초기 자료 준비 과정을 기록한 개발용 스크립트다. PDF 처리에는 `pdftotext`가 필요하지만 앱 실행에는 필요하지 않다. 두 자료의 웹 도구 확인 발췌는 준비한 seed로 유지하므로 이 스크립트 재실행을 현재 웹 원문 전체의 재검증으로 간주하지 않는다.

현재 자료 접근 여부는 `npm run sources:verify` 또는 앱의 등록 원문 재확인 모드에서 확인한다. 실패한 HTTP 접근을 성공으로 바꾸거나 최신 자료로 표시하지 않는다.
