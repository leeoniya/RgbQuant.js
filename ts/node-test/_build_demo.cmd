pushd %~dp0
del /f/q _demo.js
del /f/q _demo.js.map
tsc _demo.ts --sourcemap --out _demo.js
popd
