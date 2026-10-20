"""Package a successful Kiwi CAD export without rebuilding geometry."""
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
import zipfile

ROOT=Path(__file__).resolve().parents[3]
SRC=ROOT/'hardware/kiwi/cad'
OUT=ROOT/'public/hardware/kiwi/cad'

manifest=json.loads((OUT/'manifest.json').read_text())
assert manifest['checks']['status']=='PASS', 'Do not package a failed CAD build'
assert manifest['sourceSha256']==hashlib.sha256((SRC/'kiwi.py').read_bytes()).hexdigest(), 'Source/export mismatch'

for name in ('kiwi.py','requirements.txt','README.md'):
    shutil.copy2(SRC/name,OUT/name)
shutil.copy2(OUT/'checks.json',OUT/'validation.json')
shutil.copy2(SRC/'README.md',OUT/'assembly-guide.md')

ET.register_namespace('','http://www.w3.org/2000/svg')
ns='{http://www.w3.org/2000/svg}'
combined=ET.Element(ns+'svg',{'viewBox':'0 0 780 1060'})
for filename,y in [('top-plan.svg',0),('side-section.svg',580)]:
    group=ET.SubElement(combined,ns+'g',{'transform':f'translate(0,{y})'})
    drawing=ET.fromstring((OUT/filename).read_text())
    for child in drawing: group.append(child)
ET.ElementTree(combined).write(OUT/'assembly-drawing.svg',encoding='utf-8',xml_declaration=True)

counts=Counter(p['stl'] for p in manifest['parts'] if p.get('printable'))
counts['stl/insert-fit-coupon.stl']=1
counts['stl/motor-clamp-fit-coupon.stl']=1
with (OUT/'print-queue.csv').open('w',newline='') as stream:
    writer=csv.writer(stream)
    writer.writerow(['file','quantity','material','qualification'])
    for filename,qty in sorted(counts.items()):
        assert (OUT/filename).exists(),filename
        writer.writerow([filename,qty,'PETG starting point','coupon/physical fit pending'])

with zipfile.ZipFile(OUT/'kiwi-print-pack.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as bundle:
    for filename in [*sorted(counts),'manifest.json','checks.json','print-queue.csv','assembly-guide.md','assembly-drawing.svg']:
        bundle.write(OUT/filename,filename)
with zipfile.ZipFile(OUT/'source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as bundle:
    for filename in ('kiwi.py','requirements.txt','README.md','package.py'):
        bundle.write(SRC/filename,filename)

summary={'sourceSha256':manifest['sourceSha256'],'status':'PASS','stlFiles':len(counts),
         'assembledPrintedInstances':sum(counts.values())-2,
         'packages':{n:(OUT/n).stat().st_size for n in ('kiwi-print-pack.zip','source.zip')}}
print(json.dumps(summary,indent=2))
