---
name: dev
description: "Dev role - all developer workflows in one command: check (my tickets), jira (start a ticket), pull (sync and review changes), edit (implement + test + commit), done (hand off to testers), story (open a technical Story). Permissions are read from mcp.json roles.Dev. Use when a developer works on Jira tickets."
argument-hint: "<check | jira | pull | edit | done | story> [TICKET-KEY | คำอธิบาย]"
disable-model-invocation: true
---

# /team:dev — งานของ Dev

รับงานจาก ticket → เขียนโค้ด → test → ส่งต่อให้ Tester

| คำสั่ง | ใช้ทำอะไร | ต่อด้วย |
|---|---|---|
| `/team:dev check` | งานของฉัน + แนะนำงานถัดไป | `jira <KEY>` |
| `/team:dev jira KAN-12` | อ่าน ticket + Figma → สรุป → สร้าง branch → In Progress | `edit` |
| `/team:dev pull` | `git pull` → สรุปสิ่งที่เปลี่ยน + ผลกระทบ | — |
| `/team:dev edit KAN-12` | แผน → แก้โค้ด → unit + Robot test → commit | `done` |
| `/team:dev done KAN-12` | ตรวจความพร้อม → คอมเมนต์ส่งงาน → Testing | Tester `plan` / `run` |
| `/team:dev story <คำอธิบาย>` | เปิด Story งานเทคนิค (refactor, หนี้เทคนิค, performance, งานที่เจอระหว่างแก้) | BA ตรวจ AC |

Arguments: `$ARGUMENTS`

---

## 0. เริ่มต้น (ทำทุกครั้งก่อนคำสั่งย่อย)

1. **อ่านกติกา** — `${user_config.mcp_home}/README.md` หัวข้อ "กติการ่วม", "การหา Role", "การหาโปรเจกต์"
2. **หา Role** ตาม "การหา Role" — ต้องเป็น `Dev`
   ไม่ใช่ → หยุด แล้วบอกว่า Role นี้ใช้ `/team:<roles.<Role>.skill>` แทน
3. **อ่านสิทธิ์** — `${user_config.mcp_home}/mcp.json` → `roles.Dev` (`commands`, `jira`, `figma`, `git`, `files`, `run`) และความหมายใน `permissions`
   แสดงหนึ่งบรรทัด: `Role: Dev · โปรเจกต์: <ชื่อ> · สิทธิ์: jira(read, comment, transition) · git(pull, branch, commit) · files(edit-code, edit-tests)`
4. **แยกคำสั่งย่อย** — คำแรกของ Arguments
   - ว่าง → แสดงตารางคำสั่งด้านบน (เฉพาะที่อยู่ใน `roles.Dev.commands`) แล้วถามว่าจะทำอะไร
   - ไม่อยู่ใน `roles.Dev.commands` → หยุด แล้วแสดงคำสั่งที่ใช้ได้
   - ticket key = คำถัดไป · ไม่ใส่ → ใช้ key จากชื่อ branch `feature/<KEY>-*` · ยังไม่ได้ → ถาม
5. **ก่อนทุกการกระทำ ตรวจสิทธิ์** — การกระทำต้องอยู่ในหมวดของ `roles.Dev` (เช่น เปลี่ยนสถานะ = `jira.transition`, สร้าง branch = `git.branch`) ไม่อยู่ → ไม่ทำ และบอกว่าขาดสิทธิ์อะไร
6. การกระทำที่เปลี่ยนข้อมูล → **แสดงก่อน แล้วถาม Y** ทุกครั้ง (กติการ่วมข้อ 4)

สถานะ Jira ใช้ชื่อจาก `mcp.json` → `jira.statuses` (`<new>`, `<doing>`, `<testing>`, `<done>`)

---

## check — งานของฉัน
สิทธิ์ที่ใช้: `jira.read`
1. JQL: `assignee = currentUser() AND status in ("<new>", "<doing>")` (+ `project = <KEY>` ถ้าระบุ / `${user_config.jira_project}`) `ORDER BY priority DESC, updated DESC` สูงสุด 30
2. ตาราง: **key · ชื่อ · สถานะ · priority · อัปเดตล่าสุด · หมายเหตุ** (เช่น "ไม่มี AC", "ถูกส่งกลับจาก Tester")
3. แนะนำ 1 ใบที่ควรทำก่อน + เหตุผล + `/team:dev jira <KEY>`

## jira — รับงานจาก ticket
สิทธิ์ที่ใช้: `jira.read` · `figma.read` · `files.read` · `git.branch` · `jira.transition`
1. อ่าน ticket: summary, description, **acceptance criteria**, คอมเมนต์, ไฟล์แนบ, ticket ที่ลิงก์, ลิงก์ Figma → มี Figma → อ่าน frame
2. ค้นโค้ดหาไฟล์ที่เกี่ยวข้อง
3. สรุป: **ต้องทำอะไร** (ตาม AC) · **ไฟล์ที่น่าจะแก้/สร้าง** · **สิ่งที่ยังไม่ชัด** (เสนอคำถามถึง BA / UX-UI)
4. ถาม **"เริ่มทำ <KEY> ไหม (Y/N)"** — ไม่ใช่ Y → จบ
5. `git status` ต้องสะอาด → สร้าง branch `feature/<KEY>-<ชื่อสั้น-kebab>` จาก branch หลัก (มีแล้ว → checkout)
6. เสนอเปลี่ยนสถานะ → `<doing>` → **Y**
7. แสดงแผนการแก้เป็นขั้น ๆ → แนะนำ `/team:dev edit <KEY>`

## pull — ดึงโค้ดล่าสุด
สิทธิ์ที่ใช้: `git.pull` · `jira.read`
1. `git status` มีไฟล์ค้าง → แสดงรายการแล้ว**หยุด** (ไม่ stash ให้)
2. จำ `HEAD` เดิม → `git pull --ff-only` — ไม่ได้ (conflict / diverged) → แจ้งสาเหตุแล้วหยุด
3. `git log --oneline <เดิม>..HEAD` + `git diff --stat <เดิม>..HEAD` · branch ไม่ใช่ branch หลัก → ดู `git log HEAD..origin/<หลัก>` ด้วย
4. ticket key ใน commit → อ่านชื่อจาก Jira
5. สรุป: **มีอะไรเปลี่ยน** (ตาม ticket / โมดูล) · **กระทบงานฉันไหม** (ไฟล์ซ้อน / migration / dependency / env ใหม่) · **ต้องทำต่อ** (`npm install`, migration, rebase — ให้ผู้ใช้รันเอง)

## edit — แก้โค้ดและรัน test
สิทธิ์ที่ใช้: `files.edit-code` · `files.edit-tests` · `run.unit-test` · `run.robot-test` · `git.commit`
1. ต้องอยู่บน `feature/<KEY>-*` — ไม่ใช่ → แนะนำ `/team:dev jira <KEY>` แล้วหยุด
2. อ่าน ticket + AC (+ Figma) → เสนอ **แผน**: ไฟล์ที่จะแก้/สร้าง + สิ่งที่เปลี่ยน → **Y**
3. แก้โค้ดตามแผน — ต้องแก้เกินแผน → บอกและถามก่อน
4. เพิ่ม / แก้ unit test ให้ครอบคลุม AC
5. รัน unit test + Robot (`project.robotTest`, ไฟล์ที่มี `<KEY>` ก่อน) ตาม "การหาโปรเจกต์"
6. ไม่ผ่าน → สาเหตุ + วิธีแก้ → **Y** ก่อนแก้รอบถัดไป (สูงสุด 3 รอบ แล้วรายงาน)
7. ผ่าน → `git diff --stat` + ข้อความ commit `<KEY>: <สรุปภาษาอังกฤษ>` → **Y** → commit
8. แนะนำ `/team:dev done <KEY>`

## done — ส่งงานให้ Tester
สิทธิ์ที่ใช้: `git.pull`(อ่าน log) · `run.unit-test` · `jira.comment` · `jira.transition`
1. ตรวจ: `git status` สะอาด · มี commit ของ `<KEY>` (`git log <หลัก>..HEAD`) · unit test ผ่าน — ข้อไหนไม่ผ่าน → แจ้งและหยุด
2. เทียบ AC กับงาน → ตาราง ✔/✘ — มี ✘ → ถามว่าจะส่งต่อไหม
3. ร่างคอมเมนต์ → **Y** → โพสต์
   ```
   ✅ พร้อมทดสอบ
   Branch: feature/<KEY>-...  ·  Commit: <short sha>
   สิ่งที่เปลี่ยน: - ...
   วิธีทดสอบ: 1. ... 2. ...
   Acceptance criteria: ✔ AC1 · ✘ AC3 (เหตุผล)
   ผล test: unit ✔ · Robot ✔ / ข้าม
   ```
4. เสนอเปลี่ยนสถานะ → `<testing>` → **Y**
5. บอกให้ผู้ใช้ **push + เปิด Merge Request เอง**: `git push -u origin <branch>`

---

## story — เปิด Story งานเทคนิค
สิทธิ์ที่ใช้: `jira.read` · `jira.create-story` · `files.read`
1. รับคำอธิบาย (หรือ ticket ต้นทางที่เจอปัญหา) → อ่านโค้ดที่เกี่ยวข้องเพื่อระบุขอบเขต / ไฟล์ / ความเสี่ยง
2. ค้น ticket ซ้ำ (text search ในโปรเจกต์) → มี → แจ้ง และถามว่าจะคอมเมนต์ในใบเดิมแทนไหม
3. ร่าง Story ตามรูปแบบใน README "การเปิด Story" — ใส่ **เหตุผลทางเทคนิค** · **ผลกระทบถ้าไม่ทำ** · **ไฟล์ / โมดูลที่เกี่ยว** · label `tech` · `เปิดโดย: Dev`
4. แสดงร่าง → **Y** → สร้าง issue type **Story** · ลิงก์กับ ticket ต้นทาง (ถ้ามี)
5. บอกว่าให้ BA ตรวจ AC ด้วย `/team:ba story <KEY>`

---

## ห้าม (ทุกคำสั่ง)
push · merge · ลบ branch · reset / force · แก้ `.env*` · ลบหรือปิด test ให้ผ่าน · เปลี่ยนสถานะเป็น `<done>` · ทำสิ่งที่ไม่อยู่ใน `roles.Dev`

## ปิดท้าย (ทุกคำสั่ง)
สรุป: ทำอะไรไปแล้ว / อะไรยังไม่ได้ทำ / คำสั่งถัดไป
