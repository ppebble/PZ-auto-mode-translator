Option Explicit

' Public entry point for stopping the Helper from the release ZIP.
Dim shell, fso, root, launcher
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = root & "\tools\Stop-PZAITranslatorHelper.vbs"

If Not fso.FileExists(launcher) Then
    MsgBox "The tools folder is missing. Extract the entire Helper ZIP before running it.", vbCritical, "PZ AI Translator Helper"
    WScript.Quit 1
End If

shell.Run "wscript.exe " & Quote(launcher), 0, False

Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
