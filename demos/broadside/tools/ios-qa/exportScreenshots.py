#!/usr/bin/env python3
"""Normalize XCTest PNG orientation, preserve pixels, and remove alpha for App Store uploads.

Run after xcresulttool export attachments. Raw attachments remain untouched.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('attachments', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
records = []
for group in json.loads((args.attachments / 'manifest.json').read_text()):
    for attachment in group['attachments']:
        name = attachment['suggestedHumanReadableName'].split('_0_')[0]
        source = args.attachments / attachment['exportedFileName']
        if source.suffix != '.png' or not name.startswith(('broadside-', 'calculus-')):
            continue
        with Image.open(source) as raw:
            image = ImageOps.exif_transpose(raw)
            if 'A' in image.getbands() and image.getchannel('A').getextrema() != (255, 255):
                raise ValueError(f'Transparent screenshot: {source}')
            target = args.output / (name + '.png')
            image.convert('RGB').save(target)
            records.append({'name': name, 'file': str(target), 'source': str(source),
                            'size': image.size, 'device': attachment['deviceName'],
                            'timestamp': attachment['timestamp']})
(args.output / 'screenshots.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'Exported {len(records)} screenshots to {args.output}')
