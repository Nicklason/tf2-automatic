@ECHO OFF
npm install
IF %ERRORLEVEL% == 0 GOTO QUIT
pause
:QUIT 