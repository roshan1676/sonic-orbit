#ifndef Payload
  #error Payload must point to the self-contained native distribution
#endif
#ifndef Output
  #error Output must point to the release output directory
#endif
[Setup]
AppId={{5BE7BC8A-863E-41EA-B773-FF9D1FE1B5CB}
AppName=SonicOrbit Native
AppVersion=0.2.0-alpha.1
AppPublisher=Roshan · SonicOrbit contributors
AppPublisherURL=https://github.com/roshan1676/sonic-orbit
DefaultDirName={localappdata}\Programs\SonicOrbit Native
DefaultGroupName=SonicOrbit Native
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir={#Output}
OutputBaseFilename=SonicOrbit-0.2.0-alpha.1-windows-x64-setup
SetupIconFile={#Payload}\SonicOrbit.ico
UninstallDisplayIcon={app}\SonicOrbit.Native.exe
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
AllowNoIcons=yes
CloseApplications=yes
AppMutex=SonicOrbit.Native.Player
VersionInfoDescription=SonicOrbit Native offline installer
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\SonicOrbit Native"; Filename: "{app}\SonicOrbit.Native.exe"
Name: "{autodesktop}\SonicOrbit Native"; Filename: "{app}\SonicOrbit.Native.exe"; Tasks: desktopicon
[Run]
Filename: "{app}\SonicOrbit.Native.exe"; Description: "Open SonicOrbit Native"; Flags: nowait postinstall skipifsilent
[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var Code: Integer;
begin
  if CurStep = ssPostInstall then begin
    WizardForm.StatusLabel.Caption := 'Verifying the offline player, audio profiles and bundled AI model…';
    if not Exec(ExpandConstant('{app}\SonicOrbit.Native.exe'), '--verify-install', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
      RaiseException('Offline verification failed. See %TEMP%\sonicorbit-install-error.txt and reinstall the complete package.');
  end;
end;
