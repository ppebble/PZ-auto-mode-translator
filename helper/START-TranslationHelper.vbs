Option Explicit

' Starts the local worker without a visible PowerShell console.
Dim shell, fso, service, processes, process, root, watcher, command, commandLine, running
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
watcher = root & "\tools\watch-translation-jobs.ps1"

If Not fso.FileExists(watcher) Then
    MsgBox "The tools folder is missing. Extract the entire Helper ZIP before running it.", vbCritical, "PZ AI Translation Generator Helper"
    WScript.Quit 1
End If

Set service = GetObject("winmgmts:\\.\root\cimv2")
Set processes = service.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'powershell.exe'")
running = False
For Each process In processes
    commandLine = LCase(process.CommandLine & "")
    If InStr(commandLine, "\watch-translation-jobs.ps1") > 0 Then
        running = True
        Exit For
    End If
Next

If running Then
    MsgBox "Translation Helper is already running in the background.", vbInformation, "PZ AI Translation Generator"
    WScript.Quit 0
End If

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(watcher)
shell.Run command, 0, False
MsgBox "Translation Helper is now running in the background." & vbCrLf & vbCrLf & "Use STOP-TranslationHelper.vbs to stop it.", vbInformation, "PZ AI Translation Generator"

Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
