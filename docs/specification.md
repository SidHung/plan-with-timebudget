# Plan with TimeBudget v0.3 規格

> v0.3.2 streamlined-experience addendum: new plans collect only window, task titles/estimates, and protected time. The fixed offline HTML uses a week strip and central time ring, and does not expose priority, buffer, raw slack, or safe slack. `scripts/create_timebudget_plan.py` expands a minimal draft into the unchanged portable plan 1.0.0 contract; older priority and buffer requirements below remain compatibility rules for imported files, not normal user-facing steps.

- 狀態：實作規格草案
- 版本：0.3.0
- Skill 名稱：`plan-with-timebudget`
- Canonical repository：`https://github.com/SidHung/plan-with-timebudget`
- 規格語言：繁體中文
- 最終產出語言：repository、Skill 指令、UI 與 README 維持英文
- 相容性：延續 v0.2 的核心規劃行為與 portable plan 1.0.0 契約

本文件中的規範詞彙定義如下：

- **必須（MUST）**與**不得（MUST NOT）**：相容實作不可違反的要求。
- **應（SHOULD）**與**不應（SHOULD NOT）**：預設要求，只有具體且可說明的原因才能偏離。
- **可（MAY）**：選擇性功能。

## 1. 產品決策

v0.3 在既有的對話式每日規劃流程上，增加一個 self-contained 的互動式每日計畫頁面。

計畫確認後，Skill 必須產生兩個互補的 artifact：

1. `timebudget-YYYY-MM-DD.timebudget.json`：canonical portable plan。
2. `timebudget-YYYY-MM-DD.html`：該計畫的互動式檢視與編輯頁面。

JSON artifact 仍是跨 agent session、資料驗證與未來 App 匯入時的 machine-readable source of truth。HTML artifact 是本機操作介面，可以更新相同資料模型並匯出新的 JSON revision。

互動頁面不是未來的 TimeBudget App。它必須可離線使用，且不得要求帳號、backend、hosted service 或自動同步。

## 2. 目標

### 2.1 使用者目標

- 在清楚、聚焦的頁面查看當日待辦事項。
- 不必每次回到 agent 對話，也能勾選完成任務。
- 完成任務時，可選擇填寫實際花費分鐘數。
- 任務狀態改變後，立即看到剩餘容量更新。
- 設定並保存可重複使用的規劃預設值。
- 匯出更新後的計畫，並在之後的 agent session 繼續使用。

### 2.2 產品與行銷目標

- 透過立即可用的互動產出，讓 TimeBudget 的核心理念更具體。
- 不依賴完整 App，也能示範 capacity-first planning 的價值。
- 建立從免費 Skill 到未來 TimeBudget 產品的自然銜接。
- 讓 Skill 擁有獨立 repository、README、release 與安裝入口。
- 降低一般規劃請求需要載入的流程文字與對話負擔。

### 2.3 工程目標

- 維持 portable plan schema 1.0.0 相容性。
- 產生的頁面在 runtime 不需要任何 dependency。
- 所有使用者輸入文字皆視為 inert data 並安全顯示。
- Validator 與互動頁面測試共用 fixtures 與容量邊界案例。

## 3. 非目標

v0.3 不包含：

- 以 HTML 或 browser storage 取代 canonical JSON artifact。
- Cloud synchronization、帳號、協作或跨裝置自動同步。
- 頁面關閉後的提醒或背景監控。
- 修改 calendar 或外部 task system。
- Multi-day history、analytics、估時學習或 routine automation。
- 通用 project-management application。
- 為了使用匯出頁面而要求安裝 frontend framework、套件或啟動 development server。
- 為了減少檔案數量而刪除必要的驗證與資料一致性規則。

## 4. 現況評估

截至 2026-08-18：

- `SidHung/plan-with-timebudget` 已存在，但目前是 private、empty repository，尚無 default branch。
- 現有 Skill 位於 `SidHung/timebudget-landing` 的 `plan-with-timebudget/` 子目錄。
- Prompt-facing instructions 包含 116 行 `SKILL.md` 與三份共 332 行的 Markdown references。
- Deterministic validator 為 649 行，但它以 script 執行，不會自動載入 model context。

因此，目前感受到的龐大主要是互動流程與 reference routing 問題，不只是 repository 的實體大小。v0.3 應簡化預設操作路徑，同時把嚴格 schema 與 semantic validation 保留在一般 prompt context 之外。

## 5. Canonical repository 與搬移策略

### 5.1 Repository 決策

`SidHung/plan-with-timebudget` 必須成為以下內容的 canonical source：

- Skill instructions 與 UI metadata。
- Portable schemas。
- 互動頁面的 assets 與 renderer。
- Validators 與 tests。
- 對外 README 與行銷內容。
- Versioned releases。

Repository root 必須可以直接作為 Skill package 安裝，不得再包一層 `plan-with-timebudget/` 子目錄。

### 5.2 建議 repository 結構

```text
plan-with-timebudget/
├── README.md
├── SKILL.md
├── agents/
│   └── openai.yaml
├── assets/
│   └── interactive-plan/
│       ├── template.html
│       ├── app.js
│       └── styles.css
├── references/
│   ├── workflow.md
│   ├── portable-plan.schema.json
│   └── defaults.schema.json
├── scripts/
│   ├── render_interactive_plan.py
│   └── validate_portable_plan.py
├── tests/
│   ├── fixtures/
│   ├── test_contract.py
│   └── test_interactive_plan.py
└── docs/
    └── specification.md
```

不應加入獨立 installation guide、changelog、複製的 roadmap 或重複 quick reference。因本規格明確要求 README，所以 `README.md` 是正式交付物，不屬於多餘文件。

### 5.3 搬移順序

1. 在空的目標 repository 建立 `main` default branch 與 root-level package 結構。
2. 搬入目前 authoritative 的 Skill、schema、validator、fixture、tests 與本規格。
3. 在目標 repository 完成 v0.3 瘦身與互動 artifact。
4. 驗證從目標 repository 安裝 Skill，並執行所有 contract 與 browser tests。
5. 在新舊 repository 明確標記新的 canonical location。
6. 只有在新 repository 通過 release checks 後，才透過另一個 pull request 移除 `timebudget-landing` 中重複的 Skill package 與 Skill-specific tests。
7. `timebudget-landing` 應回歸 TimeBudget marketing website，並可連到新的 Skill repository。

在目標 repository 擁有已驗證的 default branch 與可回復的 commit history 之前，不得刪除 `timebudget-landing` 中可運作的版本。

### 5.4 Visibility 要求

目標 repository 目前是 private。公開 release 前必須改為 public，否則公開安裝說明、行銷連結與 release 無法正常使用。

更改 repository visibility 需要明確授權，不包含在本規格的實作授權中。

## 6. Artifact 契約

### 6.1 必要產出

計畫進入 `active` 後，只要 host 支援建立檔案，Skill 就必須同時產生 JSON 與 HTML artifact。

若 host 無法建立檔案：

- 必須依 v0.2 規格提供 portable JSON。
- 應說明互動頁面需要支援檔案產出的 host。
- 不得把大型手寫 HTML 當作 chat fallback 全文輸出。

### 6.2 Canonical state

- Portable JSON 在頁面之外仍是 authoritative state。
- HTML 必須嵌入一份通過驗證的 portable plan 作為 initial state。
- Browser interaction 可在 memory 與 local storage 維護 working copy。
- 頁面必須提供 `Export updated plan`，下載 schema-valid JSON artifact。
- Agent 必須從已匯出的 JSON 恢復，不得把尚未匯出的 browser state 當成已保存事實。
- 未發生 authoritative state change 的重複匯出，不得增加 `revision`。

### 6.3 檔名

```text
timebudget-YYYY-MM-DD.timebudget.json
timebudget-YYYY-MM-DD.html
timebudget-defaults.json
```

### 6.4 Runtime 模型

產生的 HTML 必須：

- 可直接從本機磁碟於主流桌面瀏覽器開啟。
- 使用 vanilla HTML、CSS 與 JavaScript。
- Render 完成後，所有 runtime CSS、JavaScript 與 initial plan data 都包含在單一 HTML 檔案內。
- 不發出任何 network request。
- 不使用 analytics、remote font、CDN 或 third-party script。
- JavaScript 不可用時，仍能顯示可閱讀的 static tasks 與 capacity summary。

Source template 可拆成 `template.html`、`app.js` 與 `styles.css`；`render_interactive_plan.py` 必須將它們 bundle 成單一輸出檔。

## 7. 互動頁面需求

### 7.1 頁面結構

頁面必須包含：

1. Header
   - 計畫本地日期。
   - Planning window。
   - Current capacity status。
2. Capacity summary
   - Clock time remaining。
   - Unfinished work。
   - Pending reserves。
   - Buffer target。
   - Safe slack。
3. Today's tasks
   - 依 `must`、`should`、`could` 分組或標記。
   - 每項任務都有完成 checkbox。
   - 可用時顯示 estimate、reported actual 與 remaining estimate。
4. Reserves
   - 顯示 meal、break、fixed commitment 與目前狀態。
5. Settings
   - Current plan settings。
   - Reusable defaults。
6. Export actions
   - Export updated portable plan。
   - Export defaults。
   - 經確認後，將 local working copy 重設為 embedded plan。

預設畫面應優先呈現 tasks 與 status。Advanced metadata、IDs、provenance 與 raw JSON 應隱藏在 details 區域，除非使用者主動展開。

### 7.2 勾選完成任務

使用者勾選任務時，頁面必須：

1. 將 `status` 設為 `completed`。
2. 將 `remaining_estimate_minutes` 設為 `0`。
3. 將 `completed_at` 設為目前 timestamp。
4. 提供選填的 whole-minute actual duration 欄位。
5. 未填 actual 時，保持 `actual_minutes: null` 與 `actual_source: null`。
6. 只有使用者填入 actual minutes 時，才設定 `actual_source: user_reported`。
7. 每次完成操作只增加一次 plan revision。
8. 依目前 wall clock 重新計算 snapshot。
9. 只有 actual 存在時才顯示 estimate-versus-actual variance。
10. 依 Skill 的相同規則觸發 `at_risk` 或 `replan_required` 提示。

頁面不得把 estimate 複製成 actual minutes。

取消已完成任務的勾選屬於明確的 undo 操作。頁面必須要求確認：

- 已有 reported actual 時，狀態恢復為 `in_progress`。
- 沒有 reported actual 時，狀態恢復為 `planned`。
- 清除 `completed_at`。
- 恢復或詢問 remaining estimate。
- 整個 undo 只增加一次 revision。

### 7.3 其他任務變更

v0.3 可允許修改 remaining estimate 與 priority，但只有 completion toggle 是必要的 task mutation。

從頁面新增、刪除、defer 或 cancel 任務不屬於 v0.3 必要範圍，這些操作仍由對話式 Skill 處理。

### 7.4 Capacity calculation

頁面必須實作與 portable-plan validator 相同的 live capacity 公式與邊界行為：

```text
clock_minutes_remaining = floor(end_at - max(now, start_at))
raw_live_slack_minutes = clock_minutes_remaining - unfinished_work - pending_reserves
safe_live_slack_minutes = raw_live_slack_minutes - buffer_target_minutes
```

- `healthy`：raw slack 大於或等於 buffer target。
- `at_risk`：raw slack 非負，但低於 buffer target。
- `replan_required`：raw slack 為負。
- `not_evaluated`：計畫已關閉、已過期但尚未處理，或存在未確認的 elapsed reserve。

Completed actual time 不得再次從 remaining clock capacity 扣除。

### 7.5 Persistence 與 conflict

- 頁面應以包含 `plan.id` 的 versioned key 快取 current working copy。
- Browser storage 只是 convenience cache，不是 portable truth。
- Reload 時，只有 cached copy 與 embedded copy 的 plan ID 相同，且 revision 較高，才能自動採用 cached copy。
- Revision 相同但 authoritative content 不同時，必須讓使用者選擇採用哪一份。
- `Reset to embedded plan` 必須要求確認。
- 頁面必須提醒使用者：切換 browser 或 agent session 前要先匯出 JSON。

## 8. 可重複使用的預設值

### 8.1 Defaults 範圍

至少必須支援以下 defaults：

- Planning start time。
- Planning end time。
- Buffer mode：`recommended` 或 `fixed`。
- Fixed mode 使用的 buffer minutes。
- Default break duration，使用 whole minutes。
- Default task priority。

Timezone 應以目前 environment 為預設，並可選擇保存。

### 8.2 Defaults artifact

Reusable defaults 必須使用獨立 portable artifact，不修改 portable plan schema 1.0.0：

```json
{
  "format": "timebudget-defaults",
  "schema_version": "1.0.0",
  "timezone": "Asia/Taipei",
  "planning_start": "09:00",
  "planning_end": "18:00",
  "buffer": {
    "mode": "recommended",
    "minutes": null
  },
  "default_break_minutes": 15,
  "default_task_priority": "should"
}
```

`references/defaults.schema.json` 必須以 `additionalProperties: false` 定義完整契約。

### 8.3 Defaults 行為

- 頁面必須允許 edit、save、export 與 import defaults。
- Local storage 可作為 cache，但不得是唯一匯出方式，因為不同 browser 或 `file://` 檔案間的 storage 行為不可靠。
- Skill 應接受未來 planning request 附上的 `timebudget-defaults.json`，並預先填入對應問題。
- Saved default 與使用者明確要求、local date boundary 或 timezone reality 衝突時，Skill 仍必須要求確認。
- 將 defaults 套用到新計畫屬於一次 authoritative initialization，不得每個欄位各增加一次 revision。

## 9. Skill 瘦身策略

### 9.1 瘦身決策

v0.3 必須降低 prompt 與對話複雜度，但不得弱化 deterministic validation。

實作應符合以下目標：

- `SKILL.md`：不含 frontmatter 時不超過 80 行。
- 只保留一份主要 Markdown workflow reference，目標不超過 180 行。
- 不保留獨立 examples reference，除非 forward testing 證明它確實改善行為。
- 一般 new-plan request 只載入 `SKILL.md` 與 `workflow.md` 中 basic planning 相關段落。
- Schema 與 validator 只在 import、export 或 debugging 時讀取或執行。

以上是設計目標，不得用來刪除必要的安全或狀態規則。

### 9.2 預設對話路徑

一般使用流程應為：

1. 確認 planning window。
2. 收集 task title、estimate 與 priority。
3. 確認 meals、breaks 與 buffer。
4. 回報工作是否可容納。
5. 產生 JSON 與互動 HTML artifacts。

除非使用者主動提供，或目前操作確實需要，Skill 不應主動詢問 deadlines、not-before constraints、estimate ranges、rollover provenance 或 advanced reserve states。

Optional fields 必須安全地預設為 `null` 或規格定義的初始值。

### 9.3 Advanced routing

單一 workflow reference 應包含簡短且明確標示的以下段落：

- Progress updates。
- Re-planning。
- Import and resume。
- Expired-plan rollover。
- Closure。
- Interactive artifact generation。

Skill 應只讀取當前操作需要的段落，不應每次載入所有程序。

### 9.4 不可被瘦身移除的部分

即使實作檔案較大，以下行為仍必須 deterministic：

- Duplicate JSON key 與 duplicate ID rejection。
- Timestamp、timezone 與 duration validation。
- Contradictory task/reserve state rejection。
- Snapshot recalculation。
- Revision semantics。
- Safe text rendering。
- Interactive export compatibility。

## 10. README 要求

目標 repository 必須包含英文 README，主要讀者是使用者，而不只是 contributor。

### 10.1 定位

README 應以簡潔 value proposition 開頭，例如：

> Plan what actually fits today. Protect meals, breaks, and uncertainty, then update the plan as real work happens.

README 必須說明：這個 Skill 是體驗 TimeBudget 方法的輕量入口，即使沒有未來 App 也能獨立使用。

### 10.2 必要 README 章節

1. Product name 與一句 value proposition。
2. What the Skill does。
3. Example output，包含互動頁面。
4. Installation。
5. How to use it。
6. Example prompts。
7. Files the Skill creates。
8. Privacy and local-data behavior。
9. TimeBudget product link。
10. Development and test commands。

### 10.3 使用範例

README 必須包含以下 invocation example：

```text
Use $plan-with-timebudget to plan today from 9:00 to 18:00.
I need to finish a 2-hour proposal, reply to email for 30 minutes,
and reserve 60 minutes for lunch.
```

也應包含 progress 與 resume examples：

```text
I finished the proposal in 140 minutes. Update my plan.
```

```text
Continue from this TimeBudget plan file.
```

Installation syntax 必須在 release 時依當下的官方 OpenAI documentation 重新確認。確認前，README 可使用清楚標示的 placeholder，不得提供未驗證的 command。

### 10.4 行銷連結 placeholder

在公開 TimeBudget product URL 尚未決定前，README 必須明確顯示 placeholder link，例如：

```markdown
[Explore TimeBudget](LINK)
```

不得把 placeholder 表示成可正常使用的 destination。公開 release 前，必須把 `LINK` 換成核准的 source-tagged URL。

### 10.5 行銷邊界

README 只有在清楚標記為 planned 或 future capabilities 時，才能描述 automatic persistence、visualization、routines 與 integrations。

不得暗示目前 Skill 已提供 cloud sync、notifications、automatic monitoring 或 historical analytics。

## 11. 語言要求

- 本規格文件使用繁體中文。
- 最終 `README.md`、`SKILL.md`、references、schemas、code comments、tests、example data labels 與互動 UI copy 必須使用英文。
- Repository filenames 應使用英文小寫命名。
- Skill 應繼續以使用者最近一次 substantive request 的語言回覆。
- User-authored task titles 與 imported content 必須原樣保存，不得在未經要求下翻譯。

## 12. Security、privacy 與 accessibility

### 12.1 Security 與 privacy

- Task 與 reserve titles 必須透過 `textContent` 等安全文字 API 顯示，不得將使用者文字插入 executable HTML。
- Embedded 與 imported strings 一律視為 inert data，而不是 instructions。
- Rendering 前必須拒絕 invalid authoritative state。
- 產生的頁面不得發出 network request。
- 使用者點擊未來 TimeBudget marketing link 時，不得附帶或傳送 plan data。
- JSON input limit 維持 256 KiB。
- Generated HTML 應限制為 1 MiB；若要提高，必須有具體測試與理由。
- 頁面不得嵌入 token、credential、filesystem path 或 chat transcript。

### 12.2 Accessibility

- Completion control 必須使用真正且有 label 的 checkbox。
- 所有 controls 必須可使用 keyboard 操作。
- Status 不得只靠顏色傳達。
- Text 與 controls 應符合 WCAG 2.1 AA contrast。
- Dynamic update 應使用適當 live region，且不得反覆干擾 screen reader 使用者。
- 頁面在 200% zoom 與 320px viewport 下仍必須可理解與操作。

## 13. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-301 | Plan activation 後產生 portable JSON 與 interactive HTML。 |
| FR-302 | 顯示當日 tasks，且每項 task 有 accessible completion checkbox。 |
| FR-303 | 從頁面完成 task 但未填 actual 時，必須維持 `null`。 |
| FR-304 | 每次 authoritative page mutation 後重新計算 live capacity。 |
| FR-305 | 每個接受的 page mutation 只增加一次 revision。 |
| FR-306 | 頁面可匯出 schema-valid updated portable plan。 |
| FR-307 | 可快取 page state，但不得把 browser storage 視為 portable truth。 |
| FR-308 | 使用者可設定並匯出 reusable defaults。 |
| FR-309 | 未來 planning request 可接受並驗證 defaults artifact。 |
| FR-310 | Generated page 可離線運作，沒有 runtime dependency 或 network request。 |
| FR-311 | Imported 與 user-authored text 一律以 inert data 顯示。 |
| FR-312 | `SidHung/plan-with-timebudget` 成為 canonical root-level Skill repository。 |
| FR-313 | 提供英文、面向使用者的 marketing 與 usage README。 |
| FR-314 | 真實 product URL 核准前，顯示 `[Explore TimeBudget](LINK)`。 |
| FR-315 | 一般 Skill instructions 符合瘦身目標。 |
| FR-316 | 維持 portable plan schema 1.0.0 相容性。 |
| FR-317 | 保留既有 capacity、reserve、actual-time、closure 與 rollover invariants。 |
| FR-318 | 所有最終 maintained repository 與 UI content 使用英文。 |

## 14. Acceptance criteria

### 14.1 互動頁面

- Valid active plan 能正確顯示 date、window、status、tasks、reserves 與 capacity values。
- 每個 task 都有 keyboard-accessible labeled checkbox。
- 勾選 task 後會完成該任務、將 remaining work 歸零並更新 capacity。
- 未填 actual time 時，`actual_minutes` 與 `actual_source` 維持 null。
- 填入 actual time 時，儲存 cumulative user-reported minutes 並顯示 variance。
- Completed actual time 不會再次從 remaining clock capacity 扣除。
- Reload 同一 artifact 時，可以恢復較新的 compatible cached revision。
- Exported JSON 通過 schema 與 semantic validation。
- Network disabled 且直接從磁碟開啟時，頁面仍可運作。
- 惡意 task title 無法產生 HTML、執行 JavaScript 或觸發 network request。
- No-JavaScript fallback 仍顯示可閱讀的 plan。

### 14.2 Defaults

- 使用者可修改所有最低必要 default fields。
- Exported defaults 通過 `defaults.schema.json`。
- Imported defaults 可 prefill 新 plan，但不覆蓋使用者明確輸入。
- Invalid、過大或含未知欄位的 defaults 會被拒絕。
- 使用者可透過 exported defaults file 在另一個 browser 使用相同設定。

### 14.3 瘦身

- 一般「plan my day」request 不需載入 schema、examples、rollover 或 import details。
- Advanced imports 與 rollovers 仍遵守全部 v0.2 invariants。
- Forward tests 顯示 capacity boundaries、actual-time honesty、reserve handling 與 prompt-injection resistance 沒有 regression。
- Skill 符合目標行數；若超過，必須記錄具體原因。

### 14.4 Repository 與 README

- Repository root 包含 `SKILL.md`，安裝時不需選擇 nested subdirectory。
- Default branch 包含完整 Skill package、tests、README 與 specification。
- README examples 正確使用 `$plan-with-timebudget`。
- README 說明兩種 generated artifacts 與 local-only privacy model。
- README 包含清楚可辨識的 TimeBudget placeholder link，且沒有虛假 capability claim。
- 所有最終 maintained content 使用英文。
- 搬移完成後，舊 landing repository 不再被視為 canonical source。

## 15. Test strategy

### 15.1 Contract tests

保留 v0.2 validator test suite，並增加以下案例：

- HTML export input validation。
- Defaults schema validation。
- UI completion 與 undo 的 revision change。
- JSON export round trip。
- Cached-state revision conflict。
- HTML size 與 escaping limits。

### 15.2 Browser tests

至少自動化以下 browser flows：

1. Offline 載入 generated plan。
2. 不填 actual time 完成 task。
3. 填入 actual time 完成 task。
4. 確認 live capacity 與 status update。
5. Reload 並恢復 cached revision。
6. Export JSON 並驗證 download。
7. Import 與 export defaults。
8. 安全顯示 instruction-like 與 HTML-like task titles。
9. 使用 keyboard 操作所有 controls。

Browser tests 可使用 development dependency，但 generated artifact 必須維持 zero runtime dependency。

### 15.3 Skill behavior tests

至少 forward-test：

- 使用 defaults 的 simple plan。
- Missing estimates。
- Overloaded plan。
- 透過 chat 回報 completion。
- 在 HTML 完成 task，並從 exported JSON resume。
- Expired imported plan。
- Malicious imported title。

## 16. Implementation sequence

### Phase 1：Repository migration

- 建立目標 repository default branch。
- 將目前 package 搬到 repository root。
- 加入 README 與 specification。
- 保留 tests 與 executable permissions。
- 驗證 root-level installation。

### Phase 2：Simplification

- 將 `SKILL.md` 縮減為 default decision path 與 reference routing。
- 將 methodology 與 session workflow 合併成一份 focused workflow reference。
- 移除不影響行為的 examples。
- 重新執行既有 contract 與 forward tests。

### Phase 3：Interactive artifact

- 加入 templates 與 renderer。
- 實作 completion、persistence、capacity、export 與 defaults。
- 加入 browser 與 security tests。
- UI 穩定後，才為 README 產生代表性 screenshot 或 GIF。

### Phase 4：Release 與 marketing

- 依當下官方 OpenAI documentation 驗證 Codex Skill 安裝說明。
- 核准 public product URL 後替換 `LINK` placeholder。
- 選擇 license。
- 決定是否將 repository 設為 public。
- 建立第一個 repository release tag。
- 移除或 redirect 舊 canonical copy。

## 17. Release gates 與未決事項

公開 release 前仍需決定：

- Public TimeBudget product URL 與 source-tagging parameters。
- Repository 從 private 改為 public。
- Skill、schemas 與 interactive artifact 的 license。
- 互動頁面的 final visual branding。
- README media 使用 static screenshot 或 short GIF。

以上事項不阻擋在 private target repository 內進行實作與測試。
