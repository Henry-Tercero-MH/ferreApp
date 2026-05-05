; Script NSIS personalizado para matar procesos de la aplicación

!macro customInit
  ; Las comillas simples en NSIS permiten usar comillas dobles adentro (necesario para nombres con espacios en Windows)
  nsExec::Exec 'taskkill /F /IM "Mangueras del sur POS.exe" /T'
  Pop $0
  Sleep 2000
!macroend

!macro customUnInstall
  nsExec::Exec 'taskkill /F /IM "Mangueras del sur POS.exe" /T'
  Pop $0
  Sleep 1000
!macroend
