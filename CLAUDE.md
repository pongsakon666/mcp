# CLAUDE.md

## Instructions

ก่อนดำเนินการใด ๆ ในโปรเจกต์ `mcp`:

1. อ่าน `AGENT.md` ในโฟลเดอร์นี้ และทำตามทุกขั้นตอนในนั้น — `AGENT.md` เป็นข้อกำหนดหลัก
2. `AGENT.md` จะสั่งให้อ่าน `mcp.json` ต่อ — ใช้เป็นข้อมูลอ้างอิงหลัก
3. คำสั่ง `run mcp` / `mcp profile` / `mcp swift` (`mcp switch`) / `mcp chat` → รัน `node setup/server.js <setup|profile|switch|chat> --agent claude` ด้วย Bash/PowerShell แบบ `run_in_background` แล้วบอกลิงก์ให้ผู้ใช้ — เซิร์ฟเวอร์ทำงานค้างไว้ ไม่ต้องรอให้จบ และไม่ต้อง poll
4. วิธีสำรองในแชท: ใช้ AskUserQuestion แบบ `multiSelect` — ถ้าตัวเลือกเกิน 4 ข้อ ให้แบ่งเป็นหลายคำถามในครั้งเดียว (สูงสุด 4 คำถาม × 4 ตัวเลือก)
