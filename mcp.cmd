@echo off
rem Shortcut: mcp | mcp setup | mcp profile | mcp swift (switch) | mcp chat | mcp reset
rem CMD: run from this folder, or add this folder to PATH to use from anywhere
node "%~dp0setup\server.js" %*
