#!/usr/bin/env python3
"""Save an atomic local recovery ZIP, retaining the previous complete checkpoint.

Reads the release whitelist as literals; never imports the packaging script,
runs a Git command, or accesses the network.
"""
from __future__ import annotations

import ast
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'artifacts' / 'checkpoints'
LATEST = DESTINATION / 'latest.zip'
PREVIOUS = DESTINATION / 'previous.zip'
EXCLUDED = {'.git', '.tools', 'node_modules', '.codex', '.aws', 'artifacts', '__pycache__'}


def release_whitelist():
    tree = ast.parse((ROOT / 'scripts/package-release.py').read_text(encoding='utf-8'))
    values = {}
    for statement in tree.body:
        if isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name) and target.id in {'FILES', 'DIRECTORIES'}:
                    values[target.id] = ast.literal_eval(statement.value)
    if set(values) != {'FILES', 'DIRECTORIES'}:
        raise RuntimeError('Release FILES/DIRECTORIES whitelist is missing')
    if not all(isinstance(value, list) and all(isinstance(item, str) for item in value) for value in values.values()):
        raise RuntimeError('Release whitelist must contain literal lists of paths')
    return values['FILES'], values['DIRECTORIES']


def allowed(path):
    relative = path.relative_to(ROOT)
    if any(part in EXCLUDED or part == '.env' or part.startswith('.env.') for part in relative.parts):
        return False
    if path.suffix in {'.pyc', '.pyo', '.blend1', '.blend2'}:
        return False
    return path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(ROOT)


def git_head():
    """Read loose or packed refs directly, including a worktree's gitdir."""
    directory = ROOT / '.git'
    try:
        if directory.is_file():
            pointer = directory.read_text(encoding='utf-8').strip()
            if not pointer.startswith('gitdir: '):
                return None
            directory = (ROOT / pointer[8:]).resolve()
        head = (directory / 'HEAD').read_text(encoding='utf-8').strip()
        if re.fullmatch(r'[0-9a-fA-F]{40,64}', head):
            return head.lower()
        if not head.startswith('ref: '):
            return None
        reference = head[5:]
        if not reference.startswith('refs/') or '..' in Path(reference).parts:
            return None
        common = directory
        if (directory / 'commondir').is_file():
            common = (directory / (directory / 'commondir').read_text(encoding='utf-8').strip()).resolve()
        for base in dict.fromkeys([directory, common]):
            loose = base / reference
            if loose.is_file():
                value = loose.read_text(encoding='utf-8').strip()
                if re.fullmatch(r'[0-9a-fA-F]{40,64}', value):
                    return value.lower()
            packed = base / 'packed-refs'
            if packed.is_file():
                for line in packed.read_text(encoding='utf-8').splitlines():
                    fields = line.split()
                    if len(fields) == 2 and fields[1] == reference and re.fullmatch(r'[0-9a-fA-F]{40,64}', fields[0]):
                        return fields[0].lower()
    except OSError:
        pass
    return None


def sync_directory():
    # Windows cannot open a directory with os.open. ZIP file contents are
    # already fsynced above; keep the atomic same-directory os.replace.
    if os.name == 'nt':
        return
    descriptor = os.open(DESTINATION, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def save():
    files, directories = release_whitelist()
    paths = {ROOT / name for name in files}
    for name in directories:
        directory = ROOT / name
        if directory.name not in EXCLUDED:
            paths.update(directory.rglob('*'))
    paths = sorted(path for path in paths if allowed(path))
    metadata = {
        'formatVersion': 1,
        'createdAtUtc': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'gitHead': git_head(),
        'files': len(paths),
        'contentRoot': 'hod-vremeni/',
    }
    DESTINATION.mkdir(parents=True, exist_ok=True)
    temporary = previous_temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.checkpoint-', suffix='.tmp', dir=DESTINATION, delete=False) as stream:
            temporary = Path(stream.name)
            with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for path in paths:
                    archive.write(path, Path('hod-vremeni') / path.relative_to(ROOT))
                archive.writestr('checkpoint.json', json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise RuntimeError('Checkpoint ZIP CRC validation failed')
        # Copy the old complete ZIP first. Never move it away from latest before
        # the new ZIP is ready, so a power failure cannot leave latest missing.
        if LATEST.is_file():
            with tempfile.NamedTemporaryFile(prefix='.previous-', suffix='.tmp', dir=DESTINATION, delete=False) as stream:
                previous_temporary = Path(stream.name)
                with LATEST.open('rb') as source:
                    shutil.copyfileobj(source, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(previous_temporary, PREVIOUS)
            sync_directory()
        os.replace(temporary, LATEST)
        sync_directory()
        print(json.dumps({**metadata, 'checkpoint': str(LATEST.relative_to(ROOT)), 'bytes': LATEST.stat().st_size, 'crc': 'passed'}, ensure_ascii=False, indent=2))
    finally:
        for path in [temporary, previous_temporary]:
            if path is not None:
                path.unlink(missing_ok=True)


if __name__ == '__main__':
    save()
