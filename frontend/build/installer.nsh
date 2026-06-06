!macro customInit
  DetailPrint "Stopping running Forma processes..."
  nsExec::ExecToLog 'taskkill /IM Forma.exe /T /F'
  nsExec::ExecToLog 'taskkill /IM backend.exe /T /F'
  Sleep 700
!macroend

!macro customInstall
  DetailPrint "Final check for lingering backend process..."
  nsExec::ExecToLog 'taskkill /IM backend.exe /T /F'
!macroend
