---
name: tester
description: "Tester role - all testing workflows in one command: check (tickets to test), plan (acceptance criteria to test cases + Robot draft), flow (define an end-to-end test flow through the system), run (run ticket tests or a flow, write a test log, report, mark done), bug (open a well-formed Jira Bug), log (show test logs). Permissions are read from mcp.json roles.Tester. Use when a tester works on Jira tickets or system test flows."
argument-hint: "<check | plan | flow | run | bug | log> [TICKET-KEY | flow:<ชื่อ>] [อาการ]"
disable-model-invocation: true
---

# /team:tester — งานของ Tester

วางแผน test → กำหนด Test Flow การเดินระบบ → รัน test / flow → บันทึก Test Log → รายงานผล / เปิด Bug

| คำสั่ง | ใช้ทำอะไร | ต่อด้วย |
|---|---|---|
| `/team:tester check` | ticket ที่รอทดสอบ + flow ที่ควรรันซ้ำ | `plan` / `run` |
| `/team:tester plan KAN-12` | AC → ตาราง test case → ร่าง `tests/robot/KAN-12.robot` | `run` |
| `/team:tester flow <ชื่อ หรือ KAN-12>` | สร้าง / แก้ **Test Flow** — ลำดับการเดินระบบข้ามหน้าจอ / Role | `run flow:<ชื่อ>` |
| `/team:tester flow list` | รายการ flow ทั้งหมดของโปรเจกต์ + ผลรันล่าสุด | — |
| `/team:tester run KAN-12` | pull branch → รัน test ของ ticket → **บันทึก Test Log** → ผ่าน = Done | ไม่ผ่าน → `bug` |
| `/team:tester run flow:<ชื่อ>` | รัน flow ทั้งเส้น (Robot + ขั้น manual) → **บันทึก Test Log** | ไม่ผ่าน → `bug` |
| `/team:tester bug KAN-12 <อาการ>` | เปิด Bug → ลิงก์ → ส่งกลับ Dev | — |
| `/team:tester log [KAN-12 \| flow:<ชื่อ>]` | ดู Test Log ล่าสุด / ย้อนหลัง / เทียบผลระหว่างรอบ | — |

Arguments: `$ARGUMENTS`

---

## 0. เริ่มต้น (ทำทุกครั้งก่อนคำสั่งย่อย)

1. **อ่านกติกา** — `${user_config.mcp_home}/README.md` หัวข้อ "กติการ่วม", "การหา Role", "การหาโปรเจกต์", "Test Flow และ Test Log"
2. **หา Role** ตาม "การหา Role" — ต้องเป็น `Tester`
   ไม่ใช่ → หยุด แล้วบอกว่า Role นี้ใช้ `/team:<roles.<Role>.skill>` แทน
3. **อ่านสิทธิ์** — `${user_config.mcp_home}/mcp.json` → `roles.Tester` (`commands`, `jira`, `figma`, `git`, `files`, `run`, `logs`) ความหมายใน `permissions` และตำแหน่งไฟล์ใน `tests`
   แสดงหนึ่งบรรทัด: `Role: Tester · โปรเจกต์: <ชื่อ> · สิทธิ์: jira(...) · git(pull) · files(edit-tests, edit-flows) · run(..., flow-test) · logs(write, read)`
4. **แยกคำสั่งย่อย** — คำแรกของ Arguments
   - ว่าง → แสดงตารางคำสั่งด้านบน (เฉพาะที่อยู่ใน `roles.Tester.commands`) แล้วถามว่าจะทำอะไร
   - ไม่อยู่ใน `roles.Tester.commands` → หยุด แล้วแสดงคำสั่งที่ใช้ได้
   - เป้าหมาย = คำถัดไป: ticket key (`KAN-12`) หรือ flow (`flow:<ชื่อ>`) · ไม่ใส่ → ถาม
5. **ก่อนทุกการกระทำ ตรวจสิทธิ์** — ต้องอยู่ในหมวดของ `roles.Tester`
   **Tester แก้ได้เฉพาะไฟล์ test และ flow** (`files.edit-tests`, `files.edit-flows`) ห้ามแก้โค้ดของระบบ
6. การกระทำที่เปลี่ยนข้อมูล → **แสดงก่อน แล้วถาม Y** ทุกครั้ง (ยกเว้นการเขียน Test Log ซึ่งทำทุกครั้งที่รัน)

สถานะ Jira ใช้ชื่อจาก `mcp.json` → `jira.statuses` · ตำแหน่งไฟล์จาก `mcp.json` → `tests`

---

## check — งานที่รอทดสอบ
สิทธิ์ที่ใช้: `jira.read` · `logs.read`
1. JQL: `status = "<testing>"` (ของทีม) + `assignee = currentUser() AND status != "<done>"` (+ `project` ถ้าระบุ) `ORDER BY priority DESC, updated ASC`
2. ตาราง: **key · ชื่อ · สถานะ · priority · ส่งมาเมื่อ · มี test plan แล้วไหม · ผลรันล่าสุด** (จาก Test Log)
3. flow ที่ครอบคลุม ticket เหล่านั้น (ดูจาก "ticket ที่เกี่ยวข้อง" ใน `tests/flows/*.md`) → แนะนำให้รันซ้ำ
4. แนะนำ 1 ใบ + คำสั่งถัดไป

## plan — วางแผน test ของ ticket
สิทธิ์ที่ใช้: `jira.read` · `figma.read` · `files.edit-tests` · `jira.comment`
1. อ่าน ticket: AC, คอมเมนต์ส่งงานของ Dev ("วิธีทดสอบ"), ลิงก์ Figma
2. ไม่มี AC / กำกวม → ลิสต์ข้อสงสัย → ร่างคอมเมนต์ถาม BA → **Y** · ทำต่อได้ด้วยสมมติฐานที่เขียนไว้ชัด
3. ตาราง test case — อย่างน้อย 1 positive ต่อ AC + negative / validation + edge (ค่าว่าง, ยาวเกิน, สิทธิ์ไม่พอ) + UI เทียบ Figma

   | ID | AC | Scenario | ขั้นตอน | ผลที่คาด | ประเภท | Auto? |
   |---|---|---|---|---|---|---|
4. ร่าง `tests/robot/<KEY>.robot` สำหรับ case ที่ Auto ได้ (ใช้ library ที่โปรเจกต์มี · ไม่มี → `RequestsLibrary` / `Browser` / `SeleniumLibrary` · ใส่ `[Tags]  <KEY>`) → แสดง → **Y** → สร้างไฟล์
5. ticket นี้กระทบ flow ไหน → เสนอเพิ่มขั้นใน flow นั้น (`/team:tester flow <ชื่อ>`)
6. เสนอโพสต์คอมเมนต์ "🧪 Test plan" + ตาราง → **Y**

## flow — กำหนด Test Flow การเดินระบบ
สิทธิ์ที่ใช้: `files.read` · `files.edit-flows` · `files.edit-tests` · `jira.read` · `figma.read`
- `flow list` → ตาราง flow ทั้งหมดใน `tests/flows/` : **ชื่อ · เป้าหมาย · จำนวนขั้น (auto / manual) · ticket ที่เกี่ยวข้อง · ผลรันล่าสุด** (จาก Test Log) แล้วจบ
- `flow <ชื่อ>` (มีอยู่แล้ว → แก้ · ยังไม่มี → สร้าง) หรือ `flow KAN-12` (สร้าง flow จาก ticket)
1. หาข้อมูลตั้งต้น: ticket / AC ที่เกี่ยวข้อง, หน้าจอ / API / Role ในโค้ด (อ่านอย่างเดียว), ลิงก์ Figma
2. ร่าง flow ตามรูปแบบใน README ("Test Flow และ Test Log"):
   - **เป้าหมาย** · **ticket ที่เกี่ยวข้อง** · **ข้อมูลตั้งต้น** (user / role / ข้อมูลทดสอบ)
   - ตารางขั้น: **# · Role · หน้าจอ / API · การกระทำ · ผลที่คาด · Auto (Robot / manual)**
   - ครอบคลุมเส้นหลัก + ทางแยกสำคัญ (ตีกลับ, ยกเลิก, Save Draft, Recall, สิทธิ์ไม่พอ)
3. แสดงร่าง → **Y** → บันทึก `tests/flows/<ชื่อ-flow>.md` (ชื่อไฟล์ภาษาอังกฤษ kebab-case)
4. ขั้นที่ Auto ได้ → ร่าง `tests/robot/flows/<ชื่อ-flow>.robot` (หนึ่ง test case ต่อหนึ่งขั้น เรียงตามลำดับ · `[Tags]  flow:<ชื่อ>`) → **Y** → บันทึก
5. แนะนำ `/team:tester run flow:<ชื่อ>`

## run — รัน test / flow และบันทึก Test Log
สิทธิ์ที่ใช้: `git.pull` · `run.robot-test` · `run.unit-test` · `run.flow-test` · `logs.write` · `jira.comment` · `jira.transition`
1. `git status` สะอาด → `git fetch` →
   - ticket → checkout `feature/<KEY>-*` (ไม่มี → branch หลัก และแจ้ง) → `git pull --ff-only`
   - flow → อยู่บน branch ที่ผู้ใช้ต้องการทดสอบ (ถาม ถ้าไม่ชัด) → `git pull --ff-only`
2. หา test:
   - ticket → `tests/robot/<KEY>.robot` หรือ tag `<KEY>` — ไม่มี → แนะนำ `/team:tester plan <KEY>` แล้วหยุด
   - flow → `tests/flows/<ชื่อ>.md` (+ `tests/robot/flows/<ชื่อ>.robot`) — ไม่มี → แนะนำ `/team:tester flow <ชื่อ>` แล้วหยุด
3. รัน:
   - ส่วน Auto → Robot (`project.robotTest` จำกัดที่ไฟล์ / `--include <KEY>` / `--include flow:<ชื่อ>`) + unit test (ticket)
   - ส่วน manual (flow) → แสดงทีละขั้น (Role · หน้าจอ · การกระทำ · ผลที่คาด) ให้ผู้ใช้ทำแล้วตอบ ✔ / ✘ + หมายเหตุ
   - flow: ขั้นก่อนหน้าล้ม → ถามว่าจะทดสอบขั้นถัดไปต่อไหม
4. **บันทึก Test Log ทุกครั้ง** ที่ `${user_config.mcp_home}/logs/tests/<project>/<YYYY-MM-DD_HHmm>_<KEY หรือ flow-ชื่อ>.md` ตามรูปแบบใน README (สรุปผล x/y · เวลา · ผู้ทดสอบ · branch · commit · คำสั่งที่รัน · ตารางทีละขั้น / test case พร้อมเวลาและ error · path รายงาน Robot · Bug ที่เปิด) — ห้ามมี token
5. แสดงตารางผล + path ของ Test Log + `results/robot/report.html`
6. เทียบกับ log รอบก่อนของเป้าหมายเดียวกัน → บอกว่าอะไร **เพิ่งผ่าน / เพิ่งล้ม / ยังล้มเหมือนเดิม**
7. ticket:
   - **ผ่านทั้งหมด** → คอมเมนต์ "✅ ทดสอบผ่าน" + ตาราง + branch/commit + ชื่อไฟล์ log → **Y** → เสนอเปลี่ยน → `<done>` → **Y**
   - **มีไม่ผ่าน** → คอมเมนต์ "❌ ไม่ผ่าน" + case ที่ล้ม → **Y** → แนะนำ `/team:tester bug <KEY>`
   flow: มีไม่ผ่าน → แนะนำ `/team:tester bug <KEY ที่เกี่ยวข้อง>` · ผ่าน → เสนอคอมเมนต์ผลใน ticket ที่เกี่ยวข้อง → **Y**

## bug — เปิด Bug
สิทธิ์ที่ใช้: `jira.read` · `jira.create-bug` · `jira.comment` · `jira.transition` · `logs.read`
1. รวบรวม (ถามเฉพาะที่ขาด): อาการ · ขั้นตอน reproduce (ถ้ามาจาก flow → ใช้ขั้นใน flow ถึงขั้นที่ล้ม) · ผลที่คาด · ผลจริง · env (branch + commit, browser/OS) · TC / ขั้นที่ล้ม + error จาก Test Log ล่าสุด
2. หา Bug ซ้ำ: `issuetype = Bug AND issue in linkedIssues(<KEY>)` + text ใกล้เคียง → เจอ → เสนอคอมเมนต์ใน Bug เดิมแทน
3. ร่าง → **Y** → สร้างในโปรเจกต์เดียวกัน + ลิงก์ "relates to" กับ `<KEY>`
   ```
   Summary: [<KEY>] <อาการสั้น ๆ>
   ขั้นตอน: 1. ... 2. ...   (flow: <ชื่อ> ขั้น 1–n)
   ผลที่คาด: ...   ผลจริง: ...
   Environment: branch ... · commit ... · ...
   Severity: Blocker / Major / Minor / Trivial (เหตุผล)
   หลักฐาน: TC-xx / ขั้นที่ n · Test Log: <ชื่อไฟล์>
   ```
4. เสนอเปลี่ยน `<KEY>` กลับเป็น `<doing>` + คอมเมนต์ลิงก์ Bug → **Y**
5. เพิ่มเลข Bug ลงใน Test Log ของรอบนั้น

## log — ดู Test Log
สิทธิ์ที่ใช้: `logs.read`
- ไม่ใส่เป้าหมาย → 10 log ล่าสุดของโปรเจกต์: **วันเวลา · เป้าหมาย · ผล x/y · ผู้ทดสอบ · branch**
- `log KAN-12` / `log flow:<ชื่อ>` → ประวัติทุกรอบของเป้าหมายนั้น + แนวโน้ม (ขั้นที่ล้มบ่อย, รอบล่าสุดที่ผ่าน, เวลาที่ใช้)
- แสดง path ของไฟล์ log ทุกครั้ง เพื่อเปิดดูฉบับเต็มหรือแนบใน Jira ได้

---

## ห้าม (ทุกคำสั่ง)
แก้โค้ดของระบบ · ข้าม / ลบ test หรือขั้นใน flow ที่ล้มโดยไม่รายงาน · แก้ / ลบ Test Log ย้อนหลัง · ปิด Bug เอง · push / merge · ทำสิ่งที่ไม่อยู่ใน `roles.Tester`

## ปิดท้าย (ทุกคำสั่ง)
สรุป: ทำอะไรไปแล้ว / อะไรยังไม่ได้ทำ / คำสั่งถัดไป
