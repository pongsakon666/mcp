# Role และสิทธิ์ — Team MCP

> เอกสารอ้างอิงว่าแต่ละ Role ทำอะไรได้บ้าง และระบบควบคุมสิทธิ์อย่างไร
> ค่าจริงอยู่ที่ `mcp.json` → `roles` (ความหมายของสิทธิ์อยู่ที่ `permissions`) · กติกาหลักอยู่ที่ `README.md`
> เวอร์ชัน: 0.0.4

---

## 1. สิทธิ์ 3 ชั้น

การกระทำหนึ่งอย่างต้องผ่านครบทั้ง 3 ชั้น

| ชั้น | กำหนดที่ | ควบคุมอะไร | บังคับแบบไหน |
|---|---|---|---|
| **① Role** (Dev / Tester / UX-UI / BA) | `mcp.json` → `roles` | Role นี้ **ควร** ทำอะไรได้ (คำสั่ง / Jira / Figma / git / ไฟล์ / รัน test / log) | AI อ่านแล้วทำตามกติกา |
| **② โหมดของ AI** (อ่าน / แก้ไฟล์ / เต็มรูปแบบ) | เลือกตอนเริ่มแชทบนหน้าเว็บ | AI **ใช้เครื่องมืออะไรได้จริง** | บังคับทางเทคนิคโดย Claude Code / Codex |
| **③ กติกาเสมอ** | `README.md` ข้อ 4–5 | ถาม **Y** ก่อนเปลี่ยนข้อมูล · ห้าม push / merge / reset / แก้ `.env` | ถาม Y = AI ทำตามกติกา · ห้าม push ฯลฯ = บังคับทางเทคนิคในโหมดเต็มรูปแบบ |

> ⚠ สิทธิ์ใน **ชั้น ①** บังคับด้วยการที่ AI ทำตามกติกา ไม่ได้ล็อกทางเทคนิค และ token ของ Jira / GitLab มีสิทธิ์เท่าบัญชีเจ้าของ
> ถ้าต้องการล็อกจริง ให้คุมที่ **ชั้น ② (โหมด)** และที่ **สิทธิ์ของบัญชี Jira / GitLab** เอง

---

## 2. ความหมายของแต่ละสิทธิ์

| หมวด | สิทธิ์ | ทำอะไรได้ |
|---|---|---|
| **jira** | `read` | อ่าน ticket, ค้นหา, อ่านคอมเมนต์ |
| | `comment` | โพสต์คอมเมนต์ |
| | `transition` | เปลี่ยนสถานะ ticket |
| | `create-bug` | สร้าง Bug + ลิงก์กับ ticket |
| | `create-story` | สร้าง Story |
| | `edit-story` | แก้ summary / description / AC ของ Story |
| **figma** | `read` | อ่าน frame / component / สไตล์ |
| **git** | `pull` | fetch / pull / checkout branch ที่มีอยู่ |
| | `branch` | สร้าง branch ใหม่ |
| | `commit` | commit (ไม่ push) |
| **files** | `read` | อ่านโค้ดในโปรเจกต์ |
| | `edit-code` | แก้ / สร้างไฟล์โค้ดของระบบ |
| | `edit-tests` | แก้ / สร้างไฟล์ test (`tests/`, `*.test.*`, `*.robot`) |
| | `edit-flows` 🆕 | สร้าง / แก้ **Test Flow** — ลำดับการเดินระบบข้ามหน้าจอ / Role (`tests/flows/`) |
| **run** | `unit-test` | รัน unit test ของโปรเจกต์ |
| | `robot-test` | รัน Robot Framework |
| | `flow-test` 🆕 | รัน Test Flow ทั้งเส้น (อัตโนมัติด้วย Robot + ขั้นที่ต้องทำมือ) |
| **logs** 🆕 | `write` | บันทึก **Test Log** ทุกครั้งที่รัน test / flow (`logs/tests/`) |
| | `read` | ดู Test Log ย้อนหลัง |

---

## 3. สิทธิ์ของแต่ละ Role

| | **Dev** | **Tester** | **UX-UI** | **BA** |
|---|---|---|---|---|
| **หน้าที่** | รับงาน → เขียนโค้ด → test → ส่ง Tester · เปิด Story งานเทคนิค | วางแผน test → กำหนด Test Flow → รัน → บันทึก Log → รายงาน / เปิด Bug | สเปกดีไซน์ → ตรวจงานเทียบดีไซน์ · เปิด Story ด้าน UX/UI | เขียน Story + AC → ดูแล backlog · เปลี่ยนสถานะ |
| **Jira** | read · comment · transition · **create-story** 🆕 | read · comment · transition · create-bug | read · comment · create-bug · **create-story** 🆕 | read · comment · create-story · edit-story · **transition** 🆕 |
| **Figma** | read | read | read | read |
| **git** | pull · branch · commit | pull | pull | — |
| **ไฟล์** | read · edit-code · edit-tests | read · edit-tests · **edit-flows** 🆕 | read | — |
| **รัน** | unit-test · robot-test | unit-test · robot-test · **flow-test** 🆕 | — | — |
| **Test Log** | read | **write · read** 🆕 | read | read |
| **คำสั่ง** | check · jira · pull · edit · done · **story** | check · plan · **flow** · run · bug · **log** | check · spec · review · **story** | check · story · review · **move** |
| **skill** | `/team:dev` | `/team:tester` | `/team:ux-ui` | `/team:ba` |

### สิ่งที่แต่ละ Role ทำไม่ได้

- **Dev** — สร้าง Bug ไม่ได้ · เปลี่ยนสถานะเป็น Done เองไม่ได้ (ให้ Tester) · เขียน Test Log ไม่ได้
- **Tester** — แก้โค้ดของระบบไม่ได้ (แก้ได้เฉพาะไฟล์ test / flow) · สร้าง branch / commit ไม่ได้ · แก้ / ลบ Test Log ย้อนหลังไม่ได้
- **UX-UI** — แก้ไฟล์ไม่ได้ · เปลี่ยนสถานะไม่ได้
- **BA** — ใช้ git / โค้ดไม่ได้ · เปลี่ยนสถานะได้เฉพาะผ่าน `move` พร้อมเหตุผล

---

## 4. คำสั่งแต่ละตัวใช้สิทธิ์อะไร

| Role | คำสั่ง | สิทธิ์ที่ใช้ | ถาม Y ก่อน |
|---|---|---|---|
| Dev | `check` | jira.read | — |
| | `jira KAN-12` | jira.read · figma.read · files.read · git.branch · jira.transition | เริ่มงาน · เปลี่ยนสถานะ |
| | `pull` | git.pull · jira.read | — |
| | `edit KAN-12` | files.edit-code · files.edit-tests · run.* · git.commit | แผน · แก้รอบถัดไป · commit |
| | `done KAN-12` | run.unit-test · jira.comment · jira.transition | คอมเมนต์ · สถานะ |
| | `story …` 🆕 | jira.read · jira.create-story · files.read | สร้าง Story |
| Tester | `check` | jira.read · logs.read | — |
| | `plan KAN-12` | jira.read · figma.read · files.edit-tests · jira.comment | สร้างไฟล์ .robot · คอมเมนต์ |
| | `flow <ชื่อ>` / `flow list` 🆕 | files.read · files.edit-flows · files.edit-tests · jira.read · figma.read | บันทึก flow · ไฟล์ .robot |
| | `run KAN-12` / `run flow:<ชื่อ>` | git.pull · run.* · **logs.write** · jira.comment · jira.transition | คอมเมนต์ · เปลี่ยนเป็น Done |
| | `bug KAN-12` | jira.create-bug · jira.comment · jira.transition · logs.read | สร้าง Bug · สถานะ |
| | `log [KAN-12 \| flow:<ชื่อ>]` 🆕 | logs.read | — |
| UX-UI | `check` | jira.read | — |
| | `spec KAN-12` | figma.read · files.read · jira.comment | คอมเมนต์ |
| | `review KAN-12` | git.pull · files.read · figma.read · jira.comment · jira.create-bug | คอมเมนต์ · เปิด Bug |
| | `story …` 🆕 | jira.read · jira.create-story · figma.read | สร้าง Story |
| BA | `check` | jira.read | — |
| | `story …` | jira.read · figma.read · jira.create-story · jira.edit-story | สร้าง/แก้ Story · ลิงก์ |
| | `review` | jira.read · jira.comment | คอมเมนต์ |
| | `move KAN-12 <สถานะ>` 🆕 | jira.read · jira.transition · jira.comment | เปลี่ยนสถานะ (+ เหตุผล) |

พิมพ์ `/team:<role>` เฉย ๆ เพื่อดูเมนูคำสั่งของ Role นั้น

---

## 5. Test Flow และ Test Log (Tester)

| | เก็บที่ | ใครเห็น |
|---|---|---|
| **Test Flow** (ขั้นตอน) | `tests/flows/<ชื่อ-flow>.md` ในโปรเจกต์ | ทั้งทีม (อยู่ใน repo) |
| **Test Flow** (อัตโนมัติ) | `tests/robot/flows/<ชื่อ-flow>.robot` | ทั้งทีม |
| **Test Log** | `D:\mcp\logs\tests\<project>\<YYYY-MM-DD_HHmm>_<KEY หรือ flow-ชื่อ>.md` | เครื่องที่รัน · ชื่อไฟล์ log แนบในคอมเมนต์ Jira |

**ใน Test Log มี:** ผลรวม ✔/✘ (x/y) · เวลา · ผู้ทดสอบ · branch · commit · คำสั่งที่รัน · ตารางทีละขั้น / test case พร้อมเวลาและ error · Bug ที่เปิด · path รายงาน Robot
ทุกครั้งที่รัน ระบบเทียบกับรอบก่อน → บอกว่าอะไร **เพิ่งผ่าน / เพิ่งล้ม / ยังล้มเหมือนเดิม**

รูปแบบไฟล์ทั้งสองแบบอยู่ใน `README.md` หัวข้อ "Test Flow และ Test Log"

---

## 6. โหมดของ AI ในแชทบนหน้าเว็บ

| โหมด | Claude Code | Codex | OpenCode | Gemini |
|---|---|---|---|---|
| **อ่านอย่างเดียว** | อ่าน / ค้นหา / MCP · ห้าม shell | sandbox `read-only` | agent `plan` | `default` |
| **แก้ไฟล์ได้** | + แก้ไฟล์ · ห้าม shell | sandbox `workspace-write` | agent ปกติ | `auto_edit` |
| **เต็มรูปแบบ (auto)** | + รันคำสั่งได้ (ระบบ auto กรองคำสั่งอันตราย) · ห้าม push / reset / merge / rebase / clean | `workspace-write` | agent ปกติ | `auto_edit` (ไม่รันคำสั่ง) |

- ทุกโหมดห้าม `Monitor` (รันคำสั่งเบื้องหลัง) และ AI ต้องถาม **Y** ก่อนเปลี่ยนข้อมูล
- โหมดเลือกตอนเริ่มแชท — เปลี่ยนโหมด = "เปลี่ยน / เริ่มใหม่"
- Tester ที่จะ **รัน test / flow** ต้องใช้โหมด **เต็มรูปแบบ**

**ตัวอย่าง:** Role = **Dev** แต่เริ่มแชทด้วยโหมด **อ่านอย่างเดียว** → แก้โค้ด / `git pull` ไม่ได้ แม้ Role จะมีสิทธิ์ เพราะโหมดล็อกไว้

---

## 7. Role มาจากไหน

1. `run mcp` → ตั้ง **Role ต่อโปรเจกต์** เก็บใน `.env` เป็น `<PROJECT>_ROLE` (เช่น `VANTIVE_API_ROLE=Dev`)
2. แชทที่เลือกหลายโปรเจกต์ → ใช้ Role ของโปรเจกต์ที่กำลังทำงานอยู่
3. คำสั่ง `/team:*` ใน Claude Code → หา Role จากโปรเจกต์ที่เปิดอยู่ → ไม่เจอ → Role สำรองของ plugin (`/plugin configure team@team-mcp`) → ยังไม่มี → ถามผู้ใช้

---

## 8. สถานะ Jira (`mcp.json` → `jira.statuses`)

| ในระบบ | ใน Jira KAN | ใครย้าย |
|---|---|---|
| `new` | To Do | BA / Dev / UX-UI สร้าง Story · BA `move` |
| `doing` | In Progress | Dev (`jira`) · Tester ส่งกลับ (`bug`) · BA `move` |
| `testing` | Testing | Dev (`done`) · BA `move` |
| `done` | Done | Tester (`run` เมื่อผ่านทั้งหมด) · BA `move` |

BA ใช้ `move` ย้ายไปสถานะอื่นของ KAN ได้ด้วย: `Wait For Test`, `Wait For Tester Clarify`, `Wait for Deploy`, `Reject` (ระบบดึงรายการที่ Jira อนุญาตจากสถานะปัจจุบันมาให้เลือก)

---

## 9. วิธีแก้สิทธิ์

แก้ `mcp.json` → `roles.<Role>` แล้วบันทึก — **มีผลทันที** (หน้าเว็บโหลดใหม่เองภายใน 1 วินาที · คำสั่ง `/team:*` อ่านใหม่ทุกครั้ง)

```json
"Dev": {
  "commands": ["check", "jira", "pull", "edit", "done", "story"],
  "jira": ["read", "comment", "transition", "create-story"]
}
```

- เพิ่ม / ตัดสิทธิ์ในแต่ละหมวด → Role นั้นทำได้ / ไม่ได้ทันที
- ตัดคำสั่งออกจาก `commands` → Role นั้นใช้คำสั่งนั้นไม่ได้
- ชื่อสิทธิ์ต้องตรงกับใน `permissions` (ข้อ 2)
- JSON ผิดรูปแบบ → ระบบใช้ค่าเดิมต่อ (ไม่พัง)
- ถ้าเพิ่ม **คำสั่งใหม่** ที่ยังไม่มีขั้นตอน → ต้องเพิ่มหัวข้อคำสั่งนั้นในไฟล์ `skills/<role>/SKILL.md` ด้วย
