"""Export all three variants; fail if any individual CAD check fails."""
from pathlib import Path
import subprocess
import sys

source=Path(__file__).with_name('kiwi.py')
failed=[]
for variant in ('front-camera','three-cameras','stereo'):
    print(f'\nBuilding camera variant: {variant}',flush=True)
    code=subprocess.run([sys.executable,str(source),'--variant',variant,
                         '--output',f'public/hardware/kiwi/cad/{variant}']).returncode
    if code:failed.append({'variant':variant,'exitCode':code})
if failed:
    print(f'FAILED CAD variants: {failed}',flush=True)
    raise SystemExit(1)
print('All three CAD variants passed',flush=True)
