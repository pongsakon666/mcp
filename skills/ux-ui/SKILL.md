---
name: ux-ui
description: "UX-UI role - all design workflows in one command: check (design tickets), spec (Figma frame to developer handoff spec mapped to design tokens), review (compare implementation with Figma, rate differences, comment or open UI bugs), story (open a UX/UI Story linked to Figma). Permissions are read from mcp.json roles.UX-UI. Use when a designer works on Jira tickets."
argument-hint: "<check | spec | review | story> [TICKET-KEY | คำอธิบาย] [Figma link]"
disable-model-invocation: true
---

# /team:ux-ui — งานของ UX-UI

ส่งต่อสเปกดีไซน์จาก Figma ให้ Dev → ตรวจงานจริงเทียบกับดีไซน์

| คำสั่ง | ใช้ทำอะไร | ต่อด้วย |
|---|---|---|
| `/team:ux-ui check` | งานดีไซน์ของฉัน + งานที่รอตรวจ | `spec` / `review` |
| `/team:ux-ui spec KAN-12 [ลิงก์ Figma]` | Figma → ตารางสเปก เทียบ design system ในโค้ด → คอมเมนต์ | Dev `jira` |
| `/team:ux-ui review KAN-12` | เทียบงานจริงกับ Figma → 🔴🟡🟢 → คอมเมนต์ / เปิด Bug UI | — |
| `/team:ux-ui story <คำอธิบาย> [ลิงก์ Figma]` | เปิด Story ด้าน UX/UI (ปรับหน้าจอ / flow การใช้งาน) พร้อมลิงก์ Figma | BA ตรวจ AC · `spec` |

Arguments: `$ARGUMENTS`

---

## 0. เริ่มต้น (ทำทุกครั้งก่อนคำสั่งย่อย)

1. **อ่านกติกา** — `${user_config.mcp_home}/README.md` หัวข้อ "กติการ่วม", "การหา Role", "การหาโปรเจกต์"
2. **หา Role** ตาม "การหา Role" — ต้องเป็น `UX-UI`
   ไม่ใช่ → หยุด แล้วบอกว่า Role นี้ใช้ `/team:<roles.<Role>.skill>` แทน
3. **อ่านสิทธิ์** — `${user_config.mcp_home}/mcp.json` → `roles.UX-UI` และความหมายใน `permissions`
   แสดงหนึ่งบรรทัด: `Role: UX-UI · โปรเจกต์: <ชื่อ> · สิทธิ์: jira(read, comment, create-bug) · figma(read) · git(pull) · files(read)`
4. **แยกคำสั่งย่อย** — คำแรกของ Arguments
   - ว่าง → แสดงตารางคำสั่งด้านบน แล้วถามว่าจะทำอะไร
   - ไม่อยู่ใน `roles.UX-UI.commands` → หยุด แล้วแสดงคำสั่งที่ใช้ได้
   - ticket key = คำถัดไป · ลิงก์ Figma = คำที่ขึ้นต้น `https://www.figma.com/` · ไม่มีลิงก์ → หาใน ticket → ไม่เจอ → ถาม (Figma: คลิกขวาที่ frame → Copy link to selection)
5. **ก่อนทุกการกระทำ ตรวจสิทธิ์** — **UX-UI อ่านโค้ดได้อย่างเดียว** (`files.read`) ห้ามแก้ไฟล์ · ห้ามแก้ Figma
6. การกระทำที่เปลี่ยนข้อมูล → **แสดงก่อน แล้วถาม Y** ทุกครั้ง

---

## check — งานดีไซน์ของฉัน
สิทธิ์ที่ใช้: `jira.read`
1. JQL สองชุด (+ `project` ถ้าระบุ):
   - ต้องทำสเปก: `assignee = currentUser() AND (labels in (design, ux, ui) OR text ~ "figma.com") AND status != "<done>"`
   - รอตรวจดีไซน์: `status = "<testing>" AND text ~ "figma.com"`
2. สองตาราง: **key · ชื่อ · สถานะ · มีสเปกแล้วไหม** (คอมเมนต์ "🎨 สเปกดีไซน์") / **key · ชื่อ · ส่งมาเมื่อ · ตรวจแล้วไหม** (คอมเมนต์ "🎨 ตรวจดีไซน์")
3. แนะนำ 1 ใบ + คำสั่งถัดไป

## spec — ส่งสเปกให้ Dev
สิทธิ์ที่ใช้: `figma.read` · `files.read` · `jira.read` · `jira.comment`
1. อ่าน frame: layout, component, ข้อความ, สถานะ (hover / focus / disabled / error / empty / loading), breakpoints
2. อ่าน design system ในโค้ด (อ่านอย่างเดียว): theme, tailwind config, CSS variables, component library
3. ตารางสเปก:

   | ส่วน | ค่าจาก Figma | ใช้ของเดิมในโปรเจกต์ | หมายเหตุ |
   |---|---|---|---|
   | สี | `#2F6FED` | `--accent` / `primary-600` | |
   | ตัวอักษร | 16/24 Semibold | `text-base font-semibold` | |
   | ระยะห่าง | 16 / 24 | `p-4` / `gap-6` | |
   | component | Button / Primary | `<Button variant="primary">` | ไม่มี → ต้องสร้าง |

   + สถานะที่ต้องทำ · responsive · asset ที่ต้อง export · **ค่าที่ไม่ตรงกับ design system** (ใช้ค่าใกล้สุด หรือเพิ่ม token)
4. ร่างคอมเมนต์ "🎨 สเปกดีไซน์" + ตาราง + ลิงก์ Figma → **Y** → โพสต์

## review — ตรวจงานจริงเทียบดีไซน์
สิทธิ์ที่ใช้: `git.pull` · `files.read` · `figma.read` · `jira.comment` · `jira.create-bug`
1. อ่าน ticket + คอมเมนต์ส่งงานของ Dev (branch) + ลิงก์ Figma
2. `git status` สะอาด → checkout branch ของ ticket → `git pull --ff-only`
3. อ่าน frame + หา component / หน้าในโค้ด (+ screenshot ถ้าผู้ใช้แนบ)
4. เทียบ:

   | หัวข้อ | Figma | งานจริง | ระดับ |
   |---|---|---|---|
   | Layout / ลำดับ | | | 🔴 ต้องแก้ / 🟡 ควรแก้ / 🟢 ตรง |
   | สี · ตัวอักษร · ระยะห่าง · มุมโค้ง · เงา | | | |
   | ข้อความ / คำสะกด | | | |
   | สถานะ: hover / focus / disabled / error / empty / loading | | | |
   | Responsive | | | |
   | Accessibility: contrast, focus, alt, label | | | |

   ดูจากโค้ดแล้วไม่แน่ใจ → เขียนว่า "ต้องดูจากหน้าจอจริง" ห้ามเดา
5. สรุป: ผ่าน / ผ่านแบบมีข้อแก้เล็ก / ไม่ผ่าน → คอมเมนต์ "🎨 ตรวจดีไซน์" → **Y**
6. ข้อ 🔴 → เสนอเปิด Bug UI (ขั้นตอน · ผลที่คาดตาม Figma · ผลจริง · ลิงก์ frame) ลิงก์กับ ticket → **Y** (ทีละข้อ หรือรวมเป็น Bug เดียว)

## story — เปิด Story ด้าน UX/UI
สิทธิ์ที่ใช้: `jira.read` · `jira.create-story` · `figma.read`
1. รับคำอธิบาย + ลิงก์ Figma (ไม่มี → ถาม · ไม่มีดีไซน์จริง ๆ → ระบุ "ยังไม่มีดีไซน์")
2. อ่าน frame ใน Figma → สรุปสิ่งที่เปลี่ยนจากของเดิม (หน้าจอ · component · สถานะ · responsive)
3. ค้น ticket ซ้ำ → มี → แจ้ง และถามว่าจะคอมเมนต์ในใบเดิมแทนไหม
4. ร่าง Story ตามรูปแบบใน README "การเปิด Story" — AC ต้องตรวจได้จากหน้าจอ (เช่น "ปุ่ม Save Draft แสดงทุกสถานะ Draft / Recall / Return") · ลิงก์ Figma · label `design` · `เปิดโดย: UX-UI`
5. แสดงร่าง → **Y** → สร้าง issue type **Story**
6. บอกต่อ: BA ตรวจ AC (`/team:ba story <KEY>`) · ส่งสเปกให้ Dev ด้วย `/team:ux-ui spec <KEY>`

---

## ห้าม (ทุกคำสั่ง)
แก้โค้ด · แก้ Figma · เปลี่ยนสถานะ ticket (ให้ Dev / Tester) · ทำสิ่งที่ไม่อยู่ใน `roles.UX-UI`

## ปิดท้าย (ทุกคำสั่ง)
สรุป: ทำอะไรไปแล้ว / อะไรยังไม่ได้ทำ / คำสั่งถัดไป
