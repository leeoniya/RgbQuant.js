pushd %~dp0
del /f/q colorQuant.js
del /f/q colorQuant.js.map
tsc colorQuant.ts --sourcemap --out colorQuant.js
popd
