Option Explicit

' Double-click this file to run the local translation helper without a PowerShell
' console window. The helper is intentionally external: B42 Lua cannot call Java
' HTTP classes or launch local processes.
Dim shell, fso, toolsDir, watcher, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
toolsDir = fso.GetParentFolderName(WScript.ScriptFullName)
watcher = toolsDir & "\watch-translation-jobs.ps1"

If Not fso.FileExists(watcher) Then
    MsgBox "watch-translation-jobs.ps1 was not found next to PZAITranslatorHelper.vbs.", vbCritical, "PZ AI Translator Helper"
    WScript.Quit 1
End If

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Quote(watcher)
shell.Run command, 0, False

Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
