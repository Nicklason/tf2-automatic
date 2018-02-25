@ECHO OFF
node automatic.js
IF %ERRORLEVEL% == 0 GOTO QUIT
pause
:QUIT