; SC-Dashboard installer, for Inno Setup 6. Build it with `npm run build`
; (scripts/build.js), which passes AppVersion, FileVersion and BuildDir.

#ifndef AppVersion
  #error Build the installer with "npm run build", not by compiling this file directly.
#endif

#define AppName "SC-Dashboard"
; The app window (native/launcher.cs), and the server it runs hidden (server.js).
#define AppExe "SC-Dashboard.exe"
#define ServerExe "SC-DashboardServer.exe"
#define RepoUrl "https://github.com/Aur1n/SC-Dashboard"
; The app's old name, so upgrades replace the rule older versions added.
#define FirewallRule "SC-Dashboard"

[Setup]
; Never change AppId: Windows uses it to recognize upgrades of the same app.
AppId={{A7A9440D-F358-4D02-81DE-04193AAA6A52}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Aur1n
AppPublisherURL={#RepoUrl}
AppSupportURL={#RepoUrl}/issues
AppUpdatesURL={#RepoUrl}/releases
VersionInfoVersion={#FileVersion}
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} Setup
VersionInfoCopyright=Copyright (c) 2026 nodieCode and xattribution. MIT License.
SourceDir=..
; Upgrades keep the folder picked at the first install (UsePreviousAppDir).
DefaultDirName={autopf}\SC-Dashboard
DisableProgramGroupPage=yes
DisableWelcomePage=no
; Program Files and the firewall rule need administrator rights.
PrivilegesRequired=admin
UsedUserAreasWarning=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=SC-Dashboard-Setup-{#AppVersion}
SetupIconFile={#BuildDir}\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
RestartApplications=no
; ---- Code signing ----
; scripts/build.js writes build\sign.iss (SignTool=... and SignedUninstaller=yes) only
; when SIGN_CMD is set, so unsigned builds skip this. See .github/workflows/release.yml.
#if FileExists(BuildDir + "\sign.iss")
  #include BuildDir + "\sign.iss"
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nSC-Dashboard turns a tablet or phone on your home network into a touch control panel for Star Citizen.%n%nFan project. Not affiliated with or endorsed by Cloud Imperium Games.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "scprofile"; Description: "Install the Star Citizen keybind profile (SC-Dashboard Keyboard)"; GroupDescription: "Star Citizen:"
; Off unless chosen: the game's local telemetry is unofficial. The app's Settings turn it on or off later.
Name: "telemetry"; Description: "Turn on the game's telemetry, so the lights show what the game says (read only; restart the RSI Launcher afterwards)"; GroupDescription: "Star Citizen:"; Flags: unchecked

[Files]
Source: "{#BuildDir}\app\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\app\{#ServerExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\app\native\*.exe"; DestDir: "{app}\native"; Flags: ignoreversion
Source: "{#BuildDir}\app\keybinds\SC-Dashboard-StarCitizen.xml"; DestDir: "{app}\keybinds"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "{#BuildDir}\app\THIRD-PARTY-NOTICES.txt"; DestDir: "{app}"; Flags: ignoreversion
; The copy in the game folder stays on uninstall: the player may have it loaded in-game.
Source: "{#BuildDir}\app\keybinds\SC-Dashboard-StarCitizen.xml"; DestDir: "{code:MappingsDir}"; Tasks: scprofile; Check: HasStarCitizen and ProfileAllowed; Flags: ignoreversion uninsneveruninstall

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[InstallDelete]
; The shortcuts older versions made, under the app's old name.
Type: files; Name: "{autoprograms}\Tablet Deck.lnk"
Type: files; Name: "{autodesktop}\Tablet Deck.lnk"
; The keybind profile under the old names, so the game's profile list keeps only
; "SC-Dashboard Keyboard". A profile the player already loaded stays in their binds.
Type: files; Name: "{code:MappingsDir}\TabletDeck-StarCitizen.xml"; Check: HasStarCitizen
Type: files; Name: "{code:MappingsDir}\SpoolUp-StarCitizen.xml"; Check: HasStarCitizen
; The old settings folder, once the app has copied it into %APPDATA%\SC-Dashboard.
Type: filesandordirs; Name: "{userappdata}\TabletDeck"; Check: SettingsMoved

[Run]
; Let tablets reach the server on private (home) networks only, so Windows doesn't ask.
; Deleting first keeps reinstalls and upgrades from adding a second rule.
; The rule older versions added under the app's old name.
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Tablet Deck"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRule}"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""{#FirewallRule}"" dir=in action=allow program=""{app}\{#ServerExe}"" enable=yes profile=private"; Flags: runhidden; StatusMsg: "Allowing SC-Dashboard through Windows Firewall on private networks..."
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: postinstall nowait skipifsilent runasoriginaluser
; Star Citizen serves its local telemetry (telemetry.js) only with this variable set for the
; player, so it's set as the user who started the setup, not the elevated one. It stays on
; uninstall; the app's Settings remove it.
Filename: "{sys}\setx.exe"; Parameters: "GRPC_CLIENT_SERVER_ENABLED true"; Flags: runhidden runasoriginaluser; Tasks: telemetry; StatusMsg: "Turning on the game's telemetry..."
; An update started from the app's Update now button runs quietly with /RELAUNCH=1: start it again.
Filename: "{app}\{#AppExe}"; Flags: nowait runasoriginaluser; Check: UpdatingFromApp

[Registry]
; The window's "Start with Windows" checkbox writes this value; uninstalling removes it.
; It and the key below keep the app's old name, as the window does.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "Tablet Deck"; Flags: uninsdeletevalue dontcreatekey
; The window remembers the last version it ran here, to show "What's new" after an update.
Root: HKCU; Subkey: "Software\Tablet Deck"; Flags: uninsdeletekey dontcreatekey

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRule}"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"

[Code]
var
  StarCitizenDir: String; // ...\StarCitizen\LIVE, or '' when not found
  TasksLabeled: Boolean;

// LIVE in the usual StarCitizen folders on drives C to Z, the ones findInstalls() in
// server.js looks in when no folder is picked.
function FindStarCitizen(): String;
var
  Drive, I: Integer;
  Roots: array[0..5] of String;
begin
  Result := '';
  Roots[0] := 'Program Files\Roberts Space Industries\StarCitizen';
  Roots[1] := 'Roberts Space Industries\StarCitizen';
  Roots[2] := 'RSI\StarCitizen';
  Roots[3] := 'Games\Roberts Space Industries\StarCitizen';
  Roots[4] := 'Games\StarCitizen';
  Roots[5] := 'StarCitizen';
  for Drive := Ord('C') to Ord('Z') do
    for I := 0 to 5 do
      if DirExists(Chr(Drive) + ':\' + Roots[I] + '\LIVE') then
      begin
        Result := Chr(Drive) + ':\' + Roots[I] + '\LIVE';
        Exit;
      end;
end;

function RegisterWindowMessage(Name: String): Cardinal;
  external 'RegisterWindowMessageW@user32.dll stdcall';

// Asks a running SC-Dashboard window to quit (it stops the server, which releases held
// keys), and waits up to 10 s for it. See Program.QuitMessage in native/launcher.cs.
procedure CloseRunningApp();
var
  I: Integer;
begin
  if not CheckForMutexes('Local\TabletDeck.Window') then Exit;
  PostBroadcastMessage(RegisterWindowMessage('TabletDeck.Quit'), 0, 0);
  for I := 1 to 100 do
  begin
    if not CheckForMutexes('Local\TabletDeck.Window') then Exit;
    Sleep(100);
  end;
end;

// True for a quiet update started from the app's Update now button (/RELAUNCH=1).
function UpdatingFromApp(): Boolean;
begin
  Result := ExpandConstant('{param:relaunch|0}') = '1';
end;

// For an update from the app, close it before its files are replaced. A normal setup
// leaves this to Windows' "close applications" step, which asks the player first.
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if UpdatingFromApp() then CloseRunningApp();
end;

function InitializeSetup(): Boolean;
begin
  StarCitizenDir := FindStarCitizen();
  Result := True;
end;

// True once the app has run since the rename and copied the old settings over, so
// %APPDATA%\TabletDeck is only a leftover. Before that first run it stays, as the copy's source.
function SettingsMoved(): Boolean;
begin
  Result := FileExists(ExpandConstant('{userappdata}\SC-Dashboard\config.json')) and
            DirExists(ExpandConstant('{userappdata}\TabletDeck'));
end;

function HasStarCitizen(): Boolean;
begin
  Result := StarCitizenDir <> '';
end;

// The keybind profile goes into the game only when the player asked for it. A silent
// install (winget, the Microsoft Store, the app's Update now) can't ask, so a first silent
// install never copies it; a silent upgrade keeps the task's answer from the last install.
function ProfileAllowed(): Boolean;
var
  Key: String;
begin
  Result := True;
  if not WizardSilent() then exit;
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{A7A9440D-F358-4D02-81DE-04193AAA6A52}_is1';
  Result := RegKeyExists(HKEY_LOCAL_MACHINE_32, Key) or (IsWin64() and RegKeyExists(HKEY_LOCAL_MACHINE_64, Key));
end;

function MappingsDir(Param: String): String;
begin
  if StarCitizenDir <> '' then
    Result := StarCitizenDir + '\user\client\0\Controls\Mappings'
  else
    Result := ExpandConstant('{app}\keybinds');
end;

// Shows where the keybind profile goes, or grays the option out without Star Citizen.
// Runs once: the page can be shown again with Back.
procedure CurPageChanged(CurPageID: Integer);
var
  I: Integer;
  Caption: String;
begin
  if (CurPageID <> wpSelectTasks) or TasksLabeled then Exit;
  TasksLabeled := True;
  for I := 0 to WizardForm.TasksList.Items.Count - 1 do
  begin
    Caption := WizardForm.TasksList.ItemCaption[I];
    if Pos('keybind profile', Caption) > 0 then
    begin
      if StarCitizenDir = '' then
      begin
        WizardForm.TasksList.Checked[I] := False;
        WizardForm.TasksList.ItemEnabled[I] := False;
        WizardForm.TasksList.ItemCaption[I] := Caption + ' (Star Citizen not found)';
      end else
        WizardForm.TasksList.ItemCaption[I] := Caption + ' (into ' + StarCitizenDir + ')';
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Settings: String;
  Code: Integer;
begin
  // Close a running copy (the window, the server, and the key sender, voice listener and
  // sound player it started) so its files can be removed: politely first, then by force (old versions had no window).
  if CurUninstallStep = usUninstall then
  begin
    CloseRunningApp();
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/f /t /im {#ServerExe} /im {#AppExe}', '', SW_HIDE, ewWaitUntilTerminated, Code);
    Sleep(500);
  end;
  // Settings stay unless the player says otherwise; silent uninstalls always keep them.
  if CurUninstallStep = usPostUninstall then
  begin
    Settings := ExpandConstant('{userappdata}\SC-Dashboard');
    if DirExists(Settings) and not UninstallSilent and
       (MsgBox('Also delete your SC-Dashboard settings (pairing code, port and any layouts you added)?' + #13#10#13#10 + Settings,
               mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES) then
      DelTree(Settings, True, True, True);
  end;
end;
