# Team MCP — กำหนดการทำงานตาม Role

> **ไฟล์นี้คือกติกาหลัก** — skill ของทุก Role อ่านหัวข้อ "กติการ่วม", "การหา Role" และ "การหาโปรเจกต์" ในไฟล์นี้ก่อนทำงาน
> **หนึ่ง Role = หนึ่งไฟล์** ที่ `skills/<role>/SKILL.md` (`dev`, `tester`, `ux-ui`, `ba`) — ข้างในมีทุกคำสั่งของ Role นั้น
> **สิทธิ์** ของแต่ละ Role อยู่ที่ `mcp.json` → `roles.<Role>` (ความหมายของแต่ละสิทธิ์ที่ `permissions`) — skill อ่านเองทุกครั้ง
> ถ้าขัดกัน **ไฟล์นี้ชนะ** · แชทบนหน้าเว็บ (`mcp chat`) ก็ส่งไฟล์นี้ให้ AI ทุกตัวเป็นกติกาเหมือนกัน

เวอร์ชัน: **0.0.4** · ใช้กับโปรเจกต์ที่ตั้งค่าด้วย `run mcp` · Jira Cloud + Figma

---

## ภาพรวม: งานหนึ่ง ticket ไหลผ่าน Role ไหนบ้าง

```
 BA                    UX-UI                 Dev                         Tester              UX-UI
 ba review ─┐
 ba story ──┴──► ux-ui spec ───────► dev jira → dev edit → dev done ──► tester plan → tester run ──► ux-ui review
 (Story + AC)    (สเปกจาก Figma)      (branch)   (โค้ด+test) (ส่งงาน)    (test case)    │  ✔ done    (เทียบดีไซน์)
                                          ▲                                           │ ✘
                                          └─────────────── tester bug ◄───────────────┘  (เปิด Bug → กลับไป Dev)
 ทุก Role: <role> check = งานของฉันวันนี้ · Dev: dev pull = ดึงโค้ดล่าสุด
```

สถานะ Jira ที่ใช้ (ตั้งชื่อจริงได้ใน `mcp.json` → `jira.statuses`):
`new` = To Do → `doing` = In Progress → `testing` = In Review → `done` = Done

---

## คำสั่งตาม Role

พิมพ์ `/team:<role>` เฉย ๆ = แสดงเมนูคำสั่งของ Role นั้น

| Role (ไฟล์) | คำสั่ง | ใช้ทำอะไร | เปลี่ยนอะไรได้ (ต้องตอบ Y ก่อน) |
|---|---|---|---|
| **Dev** (`skills/dev`) | `/team:dev check` | งานของฉัน + แนะนำงานถัดไป | — |
| | `/team:dev jira KAN-12` | อ่าน ticket + Figma → สรุป → สร้าง branch → In Progress | branch · สถานะ |
| | `/team:dev pull` | `git pull` → สรุปสิ่งที่เปลี่ยน + ผลกระทบ | pull เท่านั้น |
| | `/team:dev edit KAN-12` | แผน → แก้โค้ด → unit + Robot test → commit | ไฟล์ · commit |
| | `/team:dev done KAN-12` | ตรวจ commit/test → คอมเมนต์ส่งงาน (วิธีทดสอบ) → Testing | คอมเมนต์ · สถานะ |
| | `/team:dev story <คำอธิบาย>` | เปิด Story งานเทคนิค (label `tech`) | สร้าง Story |
| **Tester** (`skills/tester`) | `/team:tester check` | ticket ที่รอทดสอบ + flow ที่ควรรันซ้ำ | — |
| | `/team:tester plan KAN-12` | AC → ตาราง test case → ร่าง `tests/robot/KAN-12.robot` | ไฟล์ test · คอมเมนต์ |
| | `/team:tester flow <ชื่อ>` · `flow list` | สร้าง / แก้ **Test Flow** การเดินระบบข้ามหน้าจอ / Role | ไฟล์ flow · .robot |
| | `/team:tester run KAN-12` · `run flow:<ชื่อ>` | รัน test / flow → **บันทึก Test Log** → เทียบรอบก่อน → ผ่าน = Done | คอมเมนต์ · สถานะ |
| | `/team:tester bug KAN-12 <อาการ>` | เปิด Bug (reproduce / คาด / จริง / env / Test Log) → ลิงก์ → ส่งกลับ Dev | สร้าง Bug · สถานะ |
| | `/team:tester log [KAN-12 \| flow:<ชื่อ>]` | ดู Test Log ล่าสุด / ย้อนหลัง / แนวโน้ม | — |
| **UX-UI** (`skills/ux-ui`) | `/team:ux-ui check` | งานดีไซน์ของฉัน + งานที่รอตรวจ | — |
| | `/team:ux-ui spec KAN-12 [ลิงก์ Figma]` | Figma → ตารางสเปก เทียบ design system | คอมเมนต์ |
| | `/team:ux-ui review KAN-12` | เทียบงานจริงกับ Figma → 🔴🟡🟢 → คอมเมนต์ / Bug UI | คอมเมนต์ · สร้าง Bug |
| | `/team:ux-ui story <คำอธิบาย> [ลิงก์ Figma]` | เปิด Story ด้าน UX/UI (label `design`) | สร้าง Story |
| **BA** (`skills/ba`) | `/team:ba check` | Story ของฉัน + ticket ที่ยังไม่พร้อม | — |
| | `/team:ba story <KEY หรือข้อความ>` | user story + AC (Given/When/Then) → สร้างหรือแก้ Story | สร้าง/แก้ Story |
| | `/team:ba review [PROJECT]` | ตรวจความพร้อมของ backlog 7 เกณฑ์ | คอมเมนต์ |
| | `/team:ba move KAN-12 <สถานะ>` | เปลี่ยนสถานะพร้อมเหตุผล (เลือกจาก transition ที่ Jira อนุญาต) | สถานะ · คอมเมนต์ |

## สิทธิ์ของแต่ละ Role (จาก `mcp.json` → `roles`)

> รายละเอียดเต็ม (สิทธิ์ 3 ชั้น, ความหมายของสิทธิ์, คำสั่งใช้สิทธิ์อะไร, โหมดของ AI, วิธีแก้) → [`ROLES.md`](ROLES.md)

| สิทธิ์ | Dev | Tester | UX-UI | BA |
|---|---|---|---|---|
| **Jira** | read · comment · transition · create-story | read · comment · transition · create-bug | read · comment · create-bug · create-story | read · comment · create-story · edit-story · transition |
| **Figma** | read | read | read | read |
| **git** | pull · branch · commit | pull | pull | — |
| **ไฟล์** | read · edit-code · edit-tests | read · edit-tests · edit-flows | read | — |
| **รัน** | unit-test · robot-test | unit-test · robot-test · flow-test | — | — |
| **Test Log** | read | write · read | read | read |

แก้สิทธิ์ = แก้ `mcp.json` → `roles.<Role>` ได้เลย skill อ่านใหม่ทุกครั้ง (ไม่ต้องแก้ไฟล์ skill) · เพิ่ม / ตัดคำสั่งย่อย = แก้ `roles.<Role>.commands`

---

## กติการ่วม (ทุกคำสั่ง ทุก Role)

1. อ่านไฟล์นี้ และ `roles` ใน `mcp.json` ก่อนเสมอ
2. หา Role ตาม "การหา Role" — ถ้าคำสั่งไม่อยู่ใน `roles.<Role>.commands` ให้**หยุด**และบอกคำสั่งที่ Role นั้นใช้ได้
3. ใช้ Jira / Figma / git / แก้ไฟล์ ได้เฉพาะที่ `roles.<Role>` อนุญาต
4. **ต้องถามยืนยัน (Y/N) ก่อนทุกครั้ง** ที่จะ: แก้ไฟล์, commit, เปลี่ยนสถานะ Jira, คอมเมนต์ Jira, สร้าง/แก้ ticket
   - แสดงให้ดูก่อนว่าจะทำอะไร (ไฟล์ไหน / ข้อความอะไร / สถานะจากอะไรเป็นอะไร)
   - ตอบ `Y` เท่านั้นถึงทำ — อย่างอื่น = ไม่ทำ
5. **ห้าม** push, merge, ลบ branch, force, reset, แก้ `.env*`, แสดง token — ให้ผู้ใช้ทำเอง
6. ตอบภาษาไทย · อ้าง ticket เป็น key เต็ม (`KAN-12`) · อ้างไฟล์เป็น path จริง
7. ข้อมูลไม่พอ → ถามเฉพาะที่จำเป็น (ไม่เกิน 3 คำถาม) · ไม่แน่ใจ → บอกว่าไม่แน่ใจ ห้ามเดา
8. **สรุปท้ายงานทุกครั้ง**: ทำอะไรไปแล้ว / อะไรยังไม่ได้ทำ / คำสั่งถัดไป

## การหา Role

1. หา git root ของโฟลเดอร์ที่เปิดอยู่ (`git rev-parse --show-toplevel`)
2. เปิด `.env` ในโฟลเดอร์ MCP (ค่า `mcp_home` ของ plugin เช่น `D:\mcp`) → หาโปรเจกต์ที่ `<KEY>_PATH` ตรงกับ git root → ใช้ `<KEY>_ROLE`
   - อ่านเฉพาะบรรทัด `_PATH` / `_ROLE` / `_SERVICES` — **ห้ามอ่านหรือแสดง token**
3. ไม่เจอ → ใช้ Role สำรองของ plugin (`/plugin configure team@team-mcp`)
4. ยังไม่มี → ถามผู้ใช้ และแนะนำให้ตั้งค่าด้วย `run mcp`
5. แจ้งผู้ใช้หนึ่งบรรทัด: `Role: Dev · โปรเจกต์: vantive-api`

## การหาโปรเจกต์

ใช้กับคำสั่งที่แตะโค้ด / git

1. **โปรเจกต์** = git repo ของโฟลเดอร์ที่เปิดอยู่ — ไม่ใช่ git repo → หยุด และบอกให้เปิดในโฟลเดอร์โปรเจกต์
2. **branch หลัก** — `git symbolic-ref refs/remotes/origin/HEAD` → ไม่ได้ → ดู `developer` / `develop` / `main` / `master` → ยังไม่แน่ใจ → ถาม
3. **branch ของ ticket** — `feature/<KEY>-<ชื่อสั้น>`
4. **unit test** — `package.json` → script `test:run` หรือ `test` (`npm run …`) · `pyproject.toml` / `pytest.ini` → `pytest` · ไม่มี → แจ้งว่าข้าม
5. **Robot test** — ใช้ `project.robotTest` ใน `mcp.json` เฉพาะเมื่อมี `tests/robot` · ไฟล์ของ ticket = `tests/robot/<KEY>.robot`
6. แจ้งผู้ใช้หนึ่งบรรทัด: โปรเจกต์ / branch หลัก / คำสั่ง test ที่ตรวจเจอ

---

## การเปิด Story (ใช้ร่วมกัน: BA · Dev · UX-UI)

ต้องมีสิทธิ์ `jira.create-story` · ถาม **Y** ก่อนสร้างทุกครั้ง · ค้น ticket ซ้ำก่อนสร้าง

```
Summary: <กริยา + สิ่งที่ได้> (≤ 80 ตัวอักษร)
User story: ในฐานะ <ผู้ใช้> ฉันต้องการ <สิ่งที่ทำ> เพื่อ <ประโยชน์>
Acceptance criteria:
  AC1 — Given <สถานะเริ่มต้น> When <การกระทำ> Then <ผลที่ตรวจได้>
อยู่นอกขอบเขต: - ...
Dependency / ดีไซน์: <ticket / ลิงก์ Figma>
คำถามที่ยังเปิด: - ...
เปิดโดย: <Role> (<เหตุผล เช่น งานเทคนิค / ปรับ UX>)
```

- **Dev** เปิดได้สำหรับงานเทคนิค (refactor, หนี้เทคนิค, performance, งานที่เจอระหว่างแก้) — ใส่ label `tech`
- **UX-UI** เปิดได้สำหรับงานปรับ UX/UI — ใส่ label `design` + ลิงก์ Figma
- **BA** เป็นเจ้าของ Story — ตรวจ / ปรับ AC ของ Story ที่ Dev / UX-UI เปิดด้วย `/team:ba story <KEY>`

## Test Flow และ Test Log (Tester)

**Test Flow** = ลำดับการเดินระบบจริงข้ามหน้าจอ / Role เพื่อทดสอบทั้งเส้น เช่น "Return Machine: Sale สร้าง → SM อนุมัติ → CS รับเครื่อง"

| เก็บที่ | ไฟล์ |
|---|---|
| ขั้นตอน (คนอ่าน) | `tests/flows/<ชื่อ-flow>.md` ในโปรเจกต์ |
| อัตโนมัติ (ถ้ามี) | `tests/robot/flows/<ชื่อ-flow>.robot` |

รูปแบบ `tests/flows/<ชื่อ-flow>.md`:
```markdown
# Flow: <ชื่อ>
เป้าหมาย: <ทดสอบอะไร> · ticket ที่เกี่ยวข้อง: KAN-..
ข้อมูลตั้งต้น: <user / role / ข้อมูลทดสอบ ที่ต้องมี>

| # | Role | หน้าจอ / API | การกระทำ | ผลที่คาด | Auto |
|---|---|---|---|---|---|
| 1 | Sale | New Return Machine | สร้างเคสจาก Demo | ไม่แสดง Customer Data | Robot |
| 2 | SM | Approve | ตีกลับ | Sale เห็นปุ่ม Save Draft / Cancel | manual |
```

**Test Log** = บันทึกผลทุกครั้งที่รัน test หรือ flow → `logs/tests/<project>/<YYYY-MM-DD_HHmm>_<KEY หรือ flow-ชื่อ>.md` (ในโฟลเดอร์ MCP, ไม่อยู่ใน repo)
```markdown
# Test Log: <KEY หรือ flow> — ✔ ผ่าน / ✘ ไม่ผ่าน (x/y)
เวลา: <วันเวลา> · ผู้ทดสอบ: <ชื่อ> · Role: Tester
โปรเจกต์: <path> · branch: <branch> · commit: <sha>
คำสั่งที่รัน: <คำสั่ง>

| # | ขั้น / Test case | ผล | เวลา | หมายเหตุ / error |
|---|---|---|---|---|

Bug ที่เปิด: KAN-.. · รายงาน Robot: <path>/report.html
```
ห้ามมี token / รหัสผ่านใน log

---

## การติดตั้ง (ทำครั้งเดียว)

ต้องมี: Node.js 18+ · Claude Code · (Dev / Tester) Python + `pip install robotframework`

1. ตั้งค่า Jira / Figma / Role ของแต่ละโปรเจกต์ด้วย **`run mcp`** (ดู `AGENT.md`)
2. ติดตั้ง plugin:
   ```
   claude plugin marketplace add D:\mcp
   claude plugin install team@team-mcp
   ```
3. `/plugin configure team@team-mcp` → **MCP folder** = `D:\mcp` (ค่าเริ่มต้น) · Role สำรอง / project key (ไม่บังคับ)
4. เปิดโฟลเดอร์โปรเจกต์ แล้วลอง `/team:<role> check` เช่น `/team:dev check`

อัปเดตหลังแก้ไฟล์: `claude plugin marketplace update team-mcp` แล้ว `claude plugin update team@team-mcp`

## การออกเวอร์ชัน (คนดูแล)

1. แก้ `README.md` / `mcp.json` / `skills/`
2. เพิ่ม version ให้ตรงกันใน `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `mcp.json` และหัวไฟล์นี้
3. ทีมรันคำสั่งอัปเดตด้านบน

## Changelog
- **0.0.4** — Dev / UX-UI เปิด Story ได้ (`story`) · BA เปลี่ยนสถานะได้ (`move`) · Tester: กำหนด Test Flow (`flow`), รัน flow, บันทึก Test Log ทุกรอบ + เทียบรอบก่อน (`log`) · สิทธิ์ใหม่ `files.edit-flows`, `run.flow-test`, `logs.write/read`
- **0.0.3** — หนึ่ง Role หนึ่งไฟล์: `/team:dev`, `/team:tester`, `/team:ux-ui`, `/team:ba` พร้อมคำสั่งย่อย · skill อ่านสิทธิ์จาก `mcp.json` → `roles` และตรวจก่อนทุกการกระทำ · เพิ่ม `permissions` (ความหมายของสิทธิ์) และสิทธิ์ `run`
- **0.0.2** — skill แยกตาม Role 12 คำสั่ง: เพิ่ม `dev-done`, `test-plan`, `test-run`, `test-bug` (แทน `test`), `ux-spec`, `ux-review`, `ba-story`, `ba-review` · Role อ่านจาก `.env` ของโปรเจกต์ (ตั้งด้วย `run mcp`) · plugin ไม่ลงทะเบียน MCP เองแล้ว (ใช้ของ `run mcp`)
- **0.0.1** — เริ่มต้น: check, dev-jira, dev-check, dev-edit, test
