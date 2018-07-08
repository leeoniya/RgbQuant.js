del /q/f *.asm
del /q/f *.cfg
node --trace-hydrogen --trace-phase=Z --trace-deopt --code-comments --hydrogen-track-positions --redirect-code-traces --print_deopt_stress _demo.js 