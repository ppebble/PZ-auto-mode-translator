Option Explicit

' Stops only the hidden PZ AI Translator watcher started by
' PZAITranslatorHelper.vbs. It never terminates unrelated PowerShell sessions.
Dim service, processes, process, commandLine, stopped
Set service = GetObject("winmgmts:\\.\root\cimv2")
Set processes = service.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'powershell.exe'")
stopped = 0

For Each process In processes
    commandLine = LCase(process.CommandLine & "")
    If InStr(commandLine, "\\watch-translation-jobs.ps1") > 0 Then
        process.Terminate
        stopped = stopped + 1
    End If
Next

If stopped > 0 Then
    MsgBox "PZ AI Translator Helper stopped.", vbInformation, "PZ AI Translator Helper"
Else
    MsgBox "PZ AI Translator Helper is not running.", vbInformation, "PZ AI Translator Helper"
End If
