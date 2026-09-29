---
name: ba
description: "BA role - all business-analysis workflows in one command: check (my stories and unready tickets), story (write/refine a user story with Given/When/Then acceptance criteria and create/update it in Jira), review (backlog readiness check), move (change ticket status with a reason). Permissions are read from mcp.json roles.BA. Use when a business analyst works on Jira."
argument-hint: "<check | story | review | move> [TICKET-KEY | คำอธิบาย requirement] [สถานะ]"
disable-model-invocation: true
---

# /team:ba — งานของ BA

เขียน user story + acceptance criteria → ดูแล backlog ให้พร้อมทำ

| คำสั่ง | ใช้ทำอะไร | ต่อด้วย |
|---|---|---|
| `/team:ba check` | Story ของฉัน + ticket ที่ยังไม่พร้อม | `story <KEY>` |
| `/team:ba story <KEY หรือข้อความ>` | เขียน / ปรับ user story + AC → สร้างหรือแก้ Story | UX-UI `spec` · Dev `jira` · Tester `plan` |
| `/team:ba review [PROJECT]` | ตรวจความพร้อมของ backlog 7 เกณฑ์ | `story <KEY>` |
| `/team:ba move KAN-12 <สถานะ>` | เปลี่ยนสถานะ ticket (เช่น Reject, Wait For Tester Clarify, To Do) พร้อมเหตุผล | — |

Arguments: `$ARGUMENTS`

---

## 0. เริ่มต้น (ทำทุกครั้งก่อนคำสั่งย่อย)

1. **อ่านกติกา** — `${user_config.mcp_home}/README.md` หัวข้อ "กติการ่วม", "การหา Role"
2. **หา Role** ตาม "การหา Role" — ต้องเป็น `BA`
   ไม่ใช่ → หยุด แล้วบอกว่า Role นี้ใช้ `/team:<roles.<Role>.skill>` แทน
3. **อ่านสิทธิ์** — `${user_config.mcp_home}/mcp.json` → `roles.BA` และความหมายใน `permissions`
   แสดงหนึ่งบรรทัด: `Role: BA · สิทธิ์: jira(read, comment, create-story, edit-story, transition) · figma(read)`
4. **แยกคำสั่งย่อย** — คำแรกของ Arguments
   - ว่าง → แสดงตารางคำสั่งด้านบน แล้วถามว่าจะทำอะไร
   - ไม่อยู่ใน `roles.BA.commands` → หยุด แล้วแสดงคำสั่งที่ใช้ได้
   - project key: จาก ticket key / Arguments / `${user_config.jira_project}` / ถาม
5. **ก่อนทุกการกระทำ ตรวจสิทธิ์** — **BA ไม่แตะโค้ดและ git** · เปลี่ยนสถานะได้ (`jira.transition`) ผ่านคำสั่ง `move` เท่านั้น
6. การกระทำที่เปลี่ยนข้อมูล → **แสดงก่อน แล้วถาม Y** ทุกครั้ง

---

## check — Story ของฉัน
สิทธิ์ที่ใช้: `jira.read`
1. JQL (+ `project`):
   - ของฉัน: `reporter = currentUser() AND status != "<done>"`
   - ยังไม่พร้อม: `status = "<new>" AND (description is EMPTY OR text !~ "Given")`
2. ตาราง: **key · ชื่อ · สถานะ · ขาดอะไร** (AC / description / priority / Figma)
3. แนะนำ 1 ใบ + `/team:ba story <KEY>`

## story — เขียน user story + AC
สิทธิ์ที่ใช้: `jira.read` · `figma.read` · `jira.create-story` · `jira.edit-story` · `jira.comment`
1. เป็น ticket key → อ่าน ticket เดิม + คอมเมนต์ · เป็นข้อความ → ใช้เป็น requirement
2. ค้น ticket ซ้ำ / เกี่ยวข้อง (text search) → มี → แจ้ง และถามว่ารวมหรือแยก
3. ถามเฉพาะที่ขาด (ผู้ใช้เป้าหมาย / เป้าหมายธุรกิจ / ข้อจำกัด) ไม่เกิน 3 คำถาม
4. ร่าง:
   ```
   Summary: <กริยา + สิ่งที่ได้> (≤ 80 ตัวอักษร)
   User story: ในฐานะ <ผู้ใช้> ฉันต้องการ <สิ่งที่ทำ> เพื่อ <ประโยชน์>
   Acceptance criteria:
     AC1 — Given <สถานะเริ่มต้น> When <การกระทำ> Then <ผลที่ตรวจได้>
     AC2 — ... (validation / error / สิทธิ์ผู้ใช้)
   อยู่นอกขอบเขต: - ...
   Dependency / ดีไซน์: <ticket / ลิงก์ Figma>
   คำถามที่ยังเปิด: - ...
   ```
   AC ทุกข้อต้อง**ตรวจสอบได้** (ตัวเลข / ข้อความ / สถานะชัด) — ห้ามใช้ "เร็ว", "สวย", "ใช้ง่าย" ลอย ๆ
5. **Y** →
   - สร้างใหม่ → issue type **Story** (`jira.create-story`)
   - แก้ของเดิม → แสดง ก่อน → หลัง แล้วอัปเดต description (`jira.edit-story`) + คอมเมนต์ว่าแก้อะไร
6. ลิงก์ ticket ที่เกี่ยวข้อง → **Y**
7. บอกคนถัดไป: มี UI → UX-UI `/team:ux-ui spec <KEY>` · พร้อมทำ → Dev `/team:dev jira <KEY>` · Tester `/team:tester plan <KEY>`

## review — ตรวจความพร้อมของ backlog
สิทธิ์ที่ใช้: `jira.read` · `jira.comment`
1. `project = <KEY> AND status = "<new>" ORDER BY priority DESC, created ASC` (สูงสุด 50)
2. เกณฑ์ **"พร้อมทำ"**:

   | เกณฑ์ | ตรวจอะไร |
   |---|---|
   | Description | ไม่ว่าง บอกว่าใคร / ทำอะไร / ทำไม |
   | Acceptance criteria | ตรวจสอบได้ (Given/When/Then หรือ checklist) |
   | Priority | ตั้งแล้ว |
   | ดีไซน์ | งานที่มี UI มีลิงก์ Figma |
   | ขนาด | AC > 8 ข้อ / หลายหน้าจอ → ควรแตก |
   | ซ้ำ | summary ใกล้เคียงกับ ticket อื่น |
   | ค้างนาน | ไม่อัปเดตเกิน 30 วัน |

3. ตาราง: **key · ชื่อ · ✔ พร้อม / ⚠ ขาด … · ข้อแนะนำ** + ภาพรวม (พร้อม X / ต้องแก้ Y / ควรปิดหรือรวม Z)
4. ขาด AC → `/team:ba story <KEY>` · ต้องถามคนอื่น → ร่างคอมเมนต์ → **Y** (ทีละใบหรือรวม)
5. ticket ที่ควรปิด / ตีกลับ → แนะนำ `/team:ba move <KEY> <สถานะ>`

## move — เปลี่ยนสถานะ ticket
สิทธิ์ที่ใช้: `jira.read` · `jira.transition` · `jira.comment`
1. อ่าน ticket + สถานะปัจจุบัน + **transition ที่ Jira อนุญาตจากสถานะนี้** (`/rest/api/3/issue/<KEY>/transitions`)
2. สถานะปลายทาง: จาก Arguments (จับคู่กับชื่อจริงใน Jira แบบไม่สนตัวพิมพ์) · ไม่ใส่ / ไม่เจอ → แสดงรายการ transition ที่ทำได้ให้เลือก
3. ถามเหตุผลสั้น ๆ (ถ้าไม่ได้ให้มา) — จำเป็นเสมอเมื่อย้ายไป Reject / ถอยสถานะ
4. แสดง: **<KEY> · <สถานะเดิม> → <สถานะใหม่> · เหตุผล** → **Y** → เปลี่ยนสถานะ + คอมเมนต์ "🔀 BA เปลี่ยนสถานะ: <เดิม> → <ใหม่> — <เหตุผล>"
5. หลายใบพร้อมกัน (เช่น `move KAN-12,KAN-15 Reject`) → แสดงตารางทั้งหมดก่อน แล้วถาม **Y** ครั้งเดียว

---

## ห้าม (ทุกคำสั่ง)
แตะโค้ด / git · เปลี่ยนสถานะโดยไม่มีเหตุผล / ไม่ผ่านคำสั่ง `move` · ลบ ticket · เปลี่ยน priority หรือ assignee เองโดยไม่ถาม · ทำสิ่งที่ไม่อยู่ใน `roles.BA`

## ปิดท้าย (ทุกคำสั่ง)
สรุป: ทำอะไรไปแล้ว / อะไรยังไม่ได้ทำ / คำสั่งถัดไป
