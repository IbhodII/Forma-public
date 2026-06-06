' Двойной клик или Планировщик заданий — запуск без консольных окон.
' Действие: wscript.exe "C:\Users\brett\Desktop\MyHealthDashboard\start_headless.vbs"

Option Explicit
Dim shell, fso, root, ps1
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = root & "\scripts\start_headless.ps1"
shell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & ps1 & """", 0, False
