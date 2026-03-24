; Check for Visual C++ Redistributable and install if missing.
; Bundled vc_redist.x64.exe must be placed in desktop/vcredist/

!include "MUI2.nsh"

Section "VC++ Redistributable"
  ; Check registry for VC++ 2015-2022 redistributable (x64)
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  ${If} $0 != "1"
    DetailPrint "Installing Visual C++ Redistributable..."
    SetOutPath "$INSTDIR\vcredist"
    ExecWait '"$INSTDIR\vcredist\vc_redist.x64.exe" /install /quiet /norestart' $1
    ${If} $1 != 0
      DetailPrint "VC++ Redistributable install returned code $1"
    ${EndIf}
  ${Else}
    DetailPrint "Visual C++ Redistributable already installed."
  ${EndIf}
SectionEnd
