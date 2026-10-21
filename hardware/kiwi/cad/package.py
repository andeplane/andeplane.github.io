"""Package checked camera-variant exports and refresh the front-camera root alias."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
import zipfile

ROOT=Path(__file__).resolve().parents[3]
SRC=ROOT/'hardware/kiwi/cad'
BASE=ROOT/'public/hardware/kiwi/cad'
VARIANTS=('front-camera','three-cameras','stereo')


def package(variant):
    out=BASE/variant
    manifest=json.loads((out/'manifest.json').read_text())
    assert manifest['variant']==variant
    assert manifest['checks']['status']=='PASS','Do not package failed CAD'
    assert manifest['sourceSha256']==hashlib.sha256((SRC/'kiwi.py').read_bytes()).hexdigest(),'Source/export mismatch'
    assert not any(any(word in p['id'] for word in ('tof-','cliff-','i2c-mux','logic-regulator','oak-')) for p in manifest['parts'])
    for name in ('kiwi.py','requirements.txt','README.md'):
        shutil.copy2(SRC/name,out/name)
    shutil.copy2(out/'checks.json',out/'validation.json')
    header=f"# {manifest['name']}\n\nThis package is specifically `{variant}`. Camera poses and component counts are in `manifest.json`; hardware quantities are in `assembly-fasteners.json`.\n\n"
    (out/'assembly-guide.md').write_text(header+(SRC/'README.md').read_text())
    ET.register_namespace('','http://www.w3.org/2000/svg')
    ns='{http://www.w3.org/2000/svg}'
    combined=ET.Element(ns+'svg',{'viewBox':'0 0 780 1060'})
    for filename,y in [('top-plan.svg',0),('side-section.svg',580)]:
        group=ET.SubElement(combined,ns+'g',{'transform':f'translate(0,{y})'})
        for child in ET.fromstring((out/filename).read_text()):group.append(child)
    ET.ElementTree(combined).write(out/'assembly-drawing.svg',encoding='utf-8',xml_declaration=True)
    counts=Counter(p['stl'] for p in manifest['parts'] if p.get('printable'))
    counts['stl/insert-fit-coupon.stl']=1;counts['stl/motor-clamp-fit-coupon.stl']=1
    print_items=[]
    for filename,qty in sorted(counts.items()):
        representative=next((p for p in manifest['parts'] if p.get('stl')==filename),None)
        print_items.append(dict(id=representative['group'] if representative else Path(filename).stem,
                                name=representative['name'] if representative else Path(filename).stem,
                                stl=filename,quantity=qty,material='PETG starting point',
                                printBoundingBoxMm=representative.get('printBoundingBoxMm') if representative else None))
    (out/'assembly-print-bom.json').write_text(json.dumps(dict(variant=variant,items=print_items),indent=2))
    with (out/'print-queue.csv').open('w',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(['file','quantity','material','qualification'])
        for filename,qty in sorted(counts.items()):
            assert (out/filename).exists(),filename
            writer.writerow([filename,qty,'PETG starting point','physical fit pending'])
    with zipfile.ZipFile(out/'kiwi-print-pack.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as bundle:
        for filename in [*sorted(counts),'manifest.json','checks.json','assembly-fasteners.json','assembly-print-bom.json','print-queue.csv','assembly-guide.md','assembly-drawing.svg']:
            bundle.write(out/filename,filename)
    with zipfile.ZipFile(out/'source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as bundle:
        for filename in ('kiwi.py','requirements.txt','README.md','package.py','build_variants.py'):
            bundle.write(SRC/filename,filename)
    return dict(variant=variant,status='PASS',parts=len(manifest['parts']),printed=manifest['checks']['printedInstances'],stls=len(counts),sourceSha256=manifest['sourceSha256'])


def root_alias():
    front=BASE/'front-camera'
    old=json.loads((BASE/'manifest.json').read_text()) if (BASE/'manifest.json').exists() else{'parts':[]}
    new=json.loads((front/'manifest.json').read_text())
    stale={p['stl'] for p in old['parts'] if p.get('stl')}-{p['stl'] for p in new['parts'] if p.get('stl')}
    for filename in stale:
        target=BASE/filename
        assert target.parent==BASE/'stl'
        if target.exists():target.unlink()
    for source in front.iterdir():
        if source.is_file():shutil.copy2(source,BASE/source.name)
    (BASE/'stl').mkdir(exist_ok=True)
    for source in (front/'stl').iterdir():shutil.copy2(source,BASE/'stl'/source.name)


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--variant',choices=VARIANTS)
    args=ap.parse_args()
    for variant in ([args.variant] if args.variant else VARIANTS):print(json.dumps(package(variant)))
    if args.variant in (None,'front-camera'):root_alias()
