#!/usr/bin/env python3
"""Package runnable static build, application and editable model, without tool installations."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'artifacts' / 'hod-vremeni.zip'
OUTPUT.parent.mkdir(exist_ok=True)
FILES = [
    'README.md', 'SETUP_REPORT.md', 'ASSET_SOURCES.md',
    'package.json', 'package-lock.json', 'index.html', 'tsconfig.json',
    'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts',
    '.gitignore', 'start.sh', 'Ход времени.desktop',
]
DIRECTORIES = ['src', 'public', 'assets', 'docs', 'scripts', 'tests', 'dist', '.codex']
paths = [ROOT / name for name in FILES]
for directory in DIRECTORIES:
    paths.extend(path for path in (ROOT / directory).rglob('*') if path.is_file())

with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(set(paths)):
        if '__pycache__' in path.parts or path.suffix in {'.pyc', '.blend1', '.blend2'}:
            continue
        archive.write(path, Path('hod-vremeni') / path.relative_to(ROOT))

with zipfile.ZipFile(OUTPUT) as archive:
    if archive.testzip() is not None:
        raise RuntimeError('Проверка CRC архива не прошла')
    expected = ['dist/index.html', 'dist/models/pocket-watch.glb', 'assets/blender/pocket-watch.blend',
                'src/data/watch-parts.json', 'docs/VERIFICATION.md', 'start.sh']
    for filename in expected:
        if 'hod-vremeni/' + filename not in archive.namelist():
            raise RuntimeError('В архиве отсутствует ' + filename)
    print(json.dumps({'archive': str(OUTPUT.relative_to(ROOT)), 'files': len(archive.namelist()),
                      'bytes': OUTPUT.stat().st_size, 'crc': 'passed'}, ensure_ascii=False, indent=2))
