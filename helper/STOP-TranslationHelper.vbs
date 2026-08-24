Option Explicit

' Stops only the hidden translation watcher, never other PowerShell sessions.
Dim service, processes, process, commandLine, stopped
Set service = GetObject("winmgmts:\\.\root\cimv2")
Set processes = service.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'powershell.exe'")
stopped = 0

For Each process In processes
    commandLine = LCase(process.CommandLine & "")
    If InStr(commandLine, "\watch-translation-jobs.ps1") > 0 Then
        process.Terminate
        stopped = stopped + 1
    End If
Next

If stopped > 0 Then
    MsgBox "Translation Helper stopped.", vbInformation, "PZ AI Translation Generator"
Else
    MsgBox "Translation Helper is not running.", vbInformation, "PZ AI Translation Generator"
End If
