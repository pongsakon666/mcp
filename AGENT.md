# AGENT.md

> ไฟล์นี้คือจุดเริ่มต้นของโปรเจกต์ `mcp` — **AI ทุกตัว** (Claude, Codex, Copilot, Cursor, Gemini ฯลฯ) ต้องอ่านไฟล์นี้ก่อนทำอะไรทั้งสิ้น และทำตามข้อกำหนดด้านล่าง ไม่ว่าผู้ใช้จะคุยด้วย AI ตัวไหน

## 0. ข้อกำหนดการทำงาน

<!-- เจ้าของโปรเจกต์จะระบุเพิ่มเติมที่นี่ -->

- ตอบเป็นภาษาไทย
- ทำตามขั้นตอนในไฟล์นี้ตามลำดับ ห้ามข้ามขั้น
- token และค่าลับเขียนได้ที่ `.env` เท่านั้น — ห้ามเขียนลงไฟล์อื่น ห้ามแสดงในแชท และห้ามแชร์ / commit `.env`

## 1. คำสั่ง

อ่าน `mcp.json` (โฟลเดอร์เดียวกับไฟล์นี้) ก่อนทุกคำสั่ง — แหล่งข้อมูลหลัก: `workspace`, `services`, `roles`, `ui`, `profiles`, `output`

| ผู้ใช้พิมพ์ | ทำอะไร | รัน (จากโฟลเดอร์ `mcp`) |
|---|---|---|
| **`run mcp`** | ตั้งค่าที่ใช้งานอยู่ (`.env`) — ครั้งแรกเริ่มที่นี่ | `node setup/server.js setup` |
| **`mcp profile`** | สร้าง / แก้ / ลบ โปรไฟล์ (ชุดโปรเจกต์ + บัญชี + Role เช่น "เคส A", "เคส B") เก็บใน `profiles/` แยกจาก `.env` | `node setup/server.js profile` |
| **`mcp swift`** หรือ **`mcp switch`** | สลับไปใช้โปรไฟล์อื่น → เปลี่ยน `.env`, Role, สิทธิ์ และลงทะเบียน MCP ใหม่ตามโปรไฟล์ | `node setup/server.js switch` |
| **`mcp reset`** | ล้างข้อมูลทั้งหมด: `.env`, `profiles/`, `chats/` และถอด MCP ที่ระบบนี้ลงทะเบียนไว้ในทุกโปรเจกต์ (ถามยืนยันก่อน · AI ที่รันแทนผู้ใช้ให้ใส่ `--yes` หลังผู้ใช้ยืนยันแล้ว) · หรือกดปุ่ม "ล้างข้อมูลทั้งหมด" ที่หน้าหลัก | `node setup/server.js reset` |
| **`mcp chat`** | แชทกับ AI แบบเรียลไทม์บนหน้าเว็บ (เลือกโปรไฟล์ → โปรเจกต์ → สิทธิ์) · session เก็บใน `.env` | `node setup/server.js chat` |

### แชทบนหน้าเว็บ
- **AI ของแชท = AI ที่สั่ง `run mcp`** — ระบบตรวจเองจาก process ที่เรียก (เช่น `D:\mcp>claude` → `run mcp` = Claude, `opencode` → OpenCode) · **AI ที่รันคำสั่งควรส่ง `--agent <id>` ของตัวเองด้วย** เช่น `node setup/server.js setup --agent codex` · ผู้ใช้กด "เปลี่ยน" ในหน้าแชทได้
- AI ที่รองรับ — ตัวไหนก็ได้ที่รันจาก CMD ได้ (กำหนดใน `mcp.json` → `agents`):

  | AI | ติดตั้ง / ล็อกอิน | session ต่อด้วย |
  |---|---|---|
  | Claude Code (Anthropic) | `npm i -g @anthropic-ai/claude-code` → `claude` แล้วล็อกอิน | `claude --resume <id>` · VS Code เปิดแชทเดิมได้เลย |
  | Codex (OpenAI / GPT) | `npm i -g @openai/codex` → `codex login` | `codex resume <id>` |
  | Gemini (Google) | `npm i -g @google/gemini-cli` → `gemini` แล้วล็อกอิน Google (หรือตั้ง `GEMINI_API_KEY`) | `gemini --resume <id>` |
  | OpenCode | `npm i -g opencode-ai` → `opencode` | `opencode -s <id>` · อ่านอย่างเดียว = agent `plan` · free tier: ใช้ MCP ที่ตั้งใน OpenCode เอง (ส่ง MCP ของโปรไฟล์ให้ไม่ได้) |
  | ตัวอื่น (`type: "text"`) | `command` + `args` ที่มี `{prompt}` เช่น `ollama run llama3.1 {prompt}` | ไม่มี session — ส่งบทสนทนาล่าสุดไปให้ทุกครั้ง |

- AI รันในโฟลเดอร์หลัก ใช้ MCP + Role ของโปรไฟล์นั้น (MCP ถูกส่งให้แต่ละตัวในรูปแบบของมันเอง: Claude `--mcp-config`, Codex `-c mcp_servers.*`, Gemini settings file)
- เลือกโปรเจกต์ในแชทได้มากกว่า 1 (เช่น api + web) → อ่าน/แก้ได้ทุกโฟลเดอร์ และใช้ MCP ของทุกโปรเจกต์ที่เลือก (บัญชีเดียวกัน = ตัวเดียว เช่น `jira` · คนละบัญชี = แยกชื่อ เช่น `jira_vantive_web`)
- สิทธิ์: **อ่านอย่างเดียว** หรือ **แก้ไฟล์ได้** (หน้าเว็บไม่มีหน้าจอขออนุญาต)
  - Claude: ห้ามรันคำสั่ง shell ทั้งสองแบบ
  - Codex: รันคำสั่งได้ภายใน sandbox (`read-only` / `workspace-write`) — Windows ใช้ sandbox แบบ `unelevated`
  - Gemini: `default` / `auto_edit` — เครื่องมือที่ต้องขออนุญาต (เช่น shell) ถูกปฏิเสธ
- session ของแชทถูกเขียนลง `.env` และไฟล์โปรไฟล์:
  ```env
  MCP_CHAT_SESSION=<uuid>              # id ของแชทนี้บนหน้าเว็บ (ประวัติ: chats/<id>.json)
  MCP_CHAT_AGENT=codex                 # AI ที่ใช้: claude | codex | gemini | ...
  MCP_CHAT_AGENT_SESSION=<id>          # session ของ AI ตัวนั้น → ใช้ resume (Claude = MCP_CHAT_SESSION)
  MCP_CHAT_CWD=D:\vantive-api           # โฟลเดอร์หลัก — ต้องรันจากโฟลเดอร์นี้
  MCP_CHAT_DIRS=D:\vantive-api;D:\vantive-web   # ทุกโปรเจกต์ในแชท (คั่นด้วย ;)
  MCP_CHAT_MODE=read
  MCP_CHAT_UPDATED=<ISO time>
  ```
- พิมพ์ **"เปิดโปรเจค"** ในแชท (หรือกดปุ่ม) → ใช้ AI ตัวเดิมที่เลือกตอนเริ่มแชทอัตโนมัติ:
  - Claude → เปิด **VS Code** แล้วเปิด **Claude Code** ด้วย session เดิม (`vscode://anthropic.claude-code/open?session=<id>`)
  - ตัวอื่น → เปิด **VS Code** ที่โปรเจกต์ + เปิด **Terminal** ที่รันคำสั่ง resume ของ AI ตัวนั้น
- ปุ่ม **เปิดใน Terminal** → เปิด CMD ที่ `MCP_CHAT_CWD` แล้วรันคำสั่ง resume ของ AI ตัวนั้น
- ระบบอื่นที่จะเชื่อมต่อ: อ่าน `MCP_CHAT_AGENT` + `MCP_CHAT_AGENT_SESSION` + `MCP_CHAT_CWD` จาก `.env` แล้ว resume ได้เหมือนกัน
- ประวัติแชทที่แสดงบนหน้าเว็บเก็บใน `chats/<session>.json` (ห้ามแชร์)
ทั้งหมดทำผ่านหน้าเว็บ **`http://localhost/`** บนเครื่องผู้ใช้ (พอร์ต 80 — ถ้าไม่ว่างจะใช้ `ui.fallbackPort` เช่น `http://localhost:4610/`)

## 2. เปิดหน้าเว็บ — วิธีหลัก

1. รันคำสั่งตามตารางข้อ 1
   - ถ้าหน้าเว็บเปิดอยู่แล้ว คำสั่งจะเปิดเบราว์เซอร์ไปหน้าที่ต้องการแล้วจบทันที (ไม่เปิดซ้ำ)
   - ถ้ายังไม่เปิด เซิร์ฟเวอร์จะทำงานค้างไว้ (ปิดเองเมื่อไม่มีการใช้งาน `ui.idleMinutes` นาที หรือกดปุ่ม "ปิดระบบ") → **ต้องรันแบบ background** อย่ารอให้จบ
   - ทุกการบันทึก / สลับ จะพิมพ์บรรทัด `MCP_EVENT {...}` (ไม่มี token)
2. บอกผู้ใช้: **"เปิดหน้าเว็บแล้ว — ทำต่อในเบราว์เซอร์"** พร้อมลิงก์ที่พิมพ์ออกมา (กรณีเบราว์เซอร์ไม่เด้งเอง)
3. หน้าเว็บมี 4 หน้า:
   - **หน้าหลัก** — โปรไฟล์ที่ใช้อยู่, โปรเจกต์ + Role + รูปแบบ, ปุ่มบันทึกค่าปัจจุบันเป็นโปรไฟล์
   - **ตั้งค่า** — **เลือกโปรเจกต์** (เลือกได้มากกว่า 1) → ทีละโปรเจกต์ **"โปรเจกต์ที่เลือกอันที่ N : <path>"** → **เลือกรูปแบบ** jira / figma (เลือกได้มากกว่า 1) → **เลือก Role** → กรอก email / url / token → **ทดสอบการเชื่อมต่อ** → บันทึก (เลือก "บันทึกเป็นโปรไฟล์ด้วย" ได้)
   - **โปรไฟล์** — สร้างใหม่ / สร้างจากค่าที่ใช้อยู่ / แก้ไข / เปลี่ยนชื่อ / ลบ / ใช้โปรไฟล์นี้
   - **สลับโปรไฟล์** — เลือกโปรไฟล์ → สลับ (MCP ของโปรเจกต์ที่ไม่อยู่ในโปรไฟล์ใหม่จะถูกถอดออก)
4. ถ้ารัน `node` ไม่ได้ / เปิดเบราว์เซอร์ไม่ได้ / ผู้ใช้ขอคุยในแชท → ใช้ขั้นที่ 3 แทน (เฉพาะ `run mcp`)

## 3. ตั้งค่าในแชท — วิธีสำรอง

ใช้รูปแบบเดียวกันทุกข้อ: **เช็กบ็อกซ์เลือกได้มากกว่า 1** (ถ้า AI มี UI เลือกหลายข้อ ใช้ได้ — ถ้า UI จำกัดจำนวนตัวเลือก ให้แบ่งเป็นหลายกลุ่ม หรือให้พิมพ์เลขคั่นด้วย `,`)

**3.1 เลือกโปรเจกต์ (เลือกได้มากกว่า 1)** — โฟลเดอร์ใน `workspace.root` ที่มีไฟล์ใน `workspace.detect` และไม่อยู่ใน `workspace.exclude`
```
[ ] vantive-api      D:\vantive-api
[ ] vantive-web      D:\vantive-web
[ ] อื่น ๆ (พิมพ์ path เอง)
```

**3.2 ทีละโปรเจกต์** — `โปรเจกต์ที่เลือกอันที่ 1 : D:\vantive-api`
- **เลือกรูปแบบที่ต้องการใช้งาน (เลือกได้มากกว่า 1)**: `[ ] jira  [ ] figma`
- **เลือก Role** (เลือก 1): `( ) Dev  ( ) Tester  ( ) UX-UI  ( ) BA`
- **กรอกข้อมูล** ตาม `services.<ชื่อ>.fields` — ช่อง `required` ห้ามว่าง, มี `default` → Enter ใช้ค่าเริ่มต้น, email ต้องมี `@`, url ต้องขึ้นต้น `https://`
- **token**: แจ้งผู้ใช้ก่อนว่า token ที่พิมพ์ในแชทจะถูกส่งไปที่ผู้ให้บริการ AI — ถ้าไม่ต้องการ ให้เว้นว่าง แล้วให้ผู้ใช้เปิด `.env` ใส่เอง
- โปรเจกต์ที่ 2 เป็นต้นไป → ถาม **"ใช้ค่าเดียวกับโปรเจกต์ก่อนหน้าไหม (Y/N)"**
- ทดสอบ: jira `GET <url>/rest/api/3/myself` (Basic `email:token`) · figma มี token → `GET https://api.figma.com/v1/me` (header `X-Figma-Token`)

**3.3 สรุป** (ซ่อน token) → ถาม **"บันทึกและลงทะเบียน MCP ไหม (Y/N)"**

**3.4 สร้าง `.env`** — รูปแบบเดียวกับที่ `setup/server.js` เขียน:
```env
# ===== D:\vantive-api =====
VANTIVE_API_PATH=D:\vantive-api
VANTIVE_API_ROLE=Dev
VANTIVE_API_SERVICES=jira,figma
VANTIVE_API_JIRA_EMAIL=name@company.com
VANTIVE_API_JIRA_URL=https://mycompany.atlassian.net
VANTIVE_API_JIRA_TOKEN=...
VANTIVE_API_FIGMA_EMAIL=
VANTIVE_API_FIGMA_URL=https://mcp.figma.com/mcp
VANTIVE_API_FIGMA_TOKEN=
```
- ชื่อตัวแปร `<PROJECT>_<SERVICE>_<FIELD>` · `<PROJECT>` = ชื่อโฟลเดอร์ตัวพิมพ์ใหญ่ อักขระอื่นเป็น `_`
- ค่าที่มีช่องว่าง / `#` / `=` → ครอบด้วย `"..."` · โปรเจกต์อื่นใน `.env` เก็บไว้เหมือนเดิม
- อัปเดต `.env.example` ให้ชื่อตัวแปรเดียวกัน ค่าว่างทั้งหมด

**3.5 ลงทะเบียน MCP** — ไปขั้นที่ 5

## 4. หลังบันทึก

สรุปให้ผู้ใช้ (ห้ามแสดง token):
```
1. D:\vantive-api   Role: Dev     jira ✔  figma ✔
2. D:\vantive-web   Role: Tester  jira ✔
```
แล้วบอกขั้นต่อไป:
- figma แบบไม่มี token → เปิด AI ในโปรเจกต์นั้น → Claude Code พิมพ์ `/mcp` → figma → Authenticate
- เปิดโปรเจกต์แล้วเริ่มทำงานตาม `README.md`

## 5. ลงทะเบียน MCP จาก `.env`

ใช้เมื่อ: ตั้งค่าในแชท (ขั้นที่ 3), ผู้ใช้แก้ `.env` เอง, หรือผู้ใช้สั่ง **"ลงทะเบียนใหม่จาก .env"**

สร้างค่าจาก `services.<ชื่อ>.server` ใน `mcp.json` โดยแทน `{{email}}`, `{{url}}`, `{{token}}` ด้วยค่าใน `.env` และ `{{url:site}}` = ชื่อ site จาก url (`https://mycompany.atlassian.net` → `mycompany`) · figma: token ว่าง → `whenNoToken`, มี token → `whenToken`

| AI | วิธีลงทะเบียน (ต่อโปรเจกต์ ไม่เขียนไฟล์ลงใน repo) |
|---|---|
| **Claude Code** | รันในโฟลเดอร์โปรเจกต์: ลบของเดิม `claude mcp remove <ชื่อ> -s local` แล้ว `claude mcp add <ชื่อ> -s local -e KEY=VALUE ... '--' <command> <args...>` หรือ `claude mcp add <ชื่อ> -s local --transport http <url>` (PowerShell ต้องใส่ `'--'` ในเครื่องหมายคำพูด) |
| **ตัวอื่น** | ใช้วิธีตั้งค่า MCP ต่อโปรเจกต์ของเครื่องมือนั้น — ถ้าต้องเขียนไฟล์ในโปรเจกต์ ให้ถามผู้ใช้ก่อน และเตือนให้ใส่ไฟล์นั้นใน `.gitignore` |

## 6. หลังตั้งค่า

- การทำงานประจำวัน (คำสั่ง, ขั้นตอนตาม role, การถามยืนยันก่อนแก้) → `README.md`
- Role ของแต่ละโปรเจกต์ → `<PROJECT>_ROLE` ใน `.env` · โปรไฟล์ที่ใช้อยู่ → `MCP_PROFILE` ใน `.env`
- แก้ค่า / เพิ่มโปรเจกต์ → `run mcp` (หน้าเว็บโหลดค่าเดิมมาให้ token เว้นว่างได้ถ้าไม่เปลี่ยน)
- เปลี่ยนงาน (เช่น วันนี้เคส A พรุ่งนี้เคส B) → `mcp swift`
- ไฟล์โปรไฟล์ `profiles/<ชื่อ>.env` ใช้รูปแบบเดียวกับ `.env` และมี token — ห้ามแชร์ / commit เหมือน `.env`
- สลับโปรไฟล์แล้ว ให้ปิดแล้วเปิด AI ในโปรเจกต์ใหม่ เพื่อให้โหลด MCP ชุดใหม่
