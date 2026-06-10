' Double-click: dev from source (venv API + Vite + browser).
' Uses start.ps1 -Source (not Forma backend.exe).
' Opens "Health API" and "Health Frontend" windows; browser -> http://127.0.0.1:5173

Option Explicit
Dim shell, fso, root, bat, ps1, pws, cmd, exitCode
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

bat = root & "\start.bat"
ps1 = root & "\start.ps1"
If fso.FileExists(ps1) Then
  pws = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
  If Not fso.FileExists(pws) Then pws = "powershell.exe"
  ' Visible window; wait until start.ps1 finishes (API ready + Vite launched).
  cmd = """" & pws & """ -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """ -Source"
  exitCode = shell.Run(cmd, 1, True)
ElseIf fso.FileExists(bat) Then
  exitCode = shell.Run("cmd.exe /c """ & bat & """ -Source", 1, True)
Else
  MsgBox "start.ps1 and start.bat not found in:" & vbCrLf & root, vbCritical, "Health Dashboard"
  WScript.Quit 1
End If

If exitCode <> 0 Then
  Dim msg
  msg = "Launch failed (exit code " & exitCode & ")." & vbCrLf & vbCrLf
  msg = msg & "First clone? Run once:" & vbCrLf
  msg = msg & "  cd " & root & vbCrLf
  msg = msg & "  .\start.ps1 -Install" & vbCrLf & vbCrLf
  msg = msg & "Then double-click start.vbs again, or:" & vbCrLf
  msg = msg & "  .\start.ps1 -Source" & vbCrLf & vbCrLf
  msg = msg & "Stop services:" & vbCrLf
  msg = msg & "  .\start.ps1 -Stop" & vbCrLf & vbCrLf
  msg = msg & "API log: backend\logs\api.log"
  MsgBox msg, vbExclamation, "Health Dashboard"
  WScript.Quit exitCode
End If
