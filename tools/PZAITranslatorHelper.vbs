Option Explicit

' Double-click this file to run the local translation helper without a PowerShell
' console window. The helper is intentionally external: B42 Lua cannot call Java
' HTTP classes or launch local processes.
Dim shell, fso, service, processes, process, toolsDir, watcher, command, commandLine, running
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
toolsDir = fso.GetParentFolderName(WScript.ScriptFullName)
watcher = toolsDir & "\watch-translation-jobs.ps1"

If Not fso.FileExists(watcher) Then
    MsgBox "watch-translation-jobs.ps1 was not found next to PZAITranslatorHelper.vbs.", vbCritical, "PZ AI Translator Helper"
    WScript.Quit 1
End If

Set service = GetObject("winmgmts:\\.\root\cimv2")
Set processes = service.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'powershell.exe'")
running = False
For Each process In processes
    commandLine = LCase(process.CommandLine & "")
    If InStr(commandLine, "\\watch-translation-jobs.ps1") > 0 Then
        running = True
        Exit For
    End If
Next

If running Then
    MsgBox "PZ AI Translator Helper is already running in the background.", vbInformation, "PZ AI Translator Helper"
    WScript.Quit 0
End If

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(watcher)
shell.Run command, 0, False
MsgBox "PZ AI Translator Helper is now running in the background." & vbCrLf & vbCrLf & "Use Stop-PZAITranslatorHelper.vbs to stop it.", vbInformation, "PZ AI Translator Helper"

Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
