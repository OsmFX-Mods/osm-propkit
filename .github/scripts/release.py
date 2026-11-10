import os
import re
import shutil
import zipfile
import subprocess
import json
import hashlib
import sys

RESOURCE_NAME = 'osm-propkit'

def get_latest_changelog():
    changelogs_dir = 'changelogs'
    if not os.path.isdir(changelogs_dir):
        return None, None
    
    files = os.listdir(changelogs_dir)
    changelog_files = []
    for f in files:
        if f.startswith('CHANGELOG-'):
            ver_str = f[len('CHANGELOG-'):]
            if ver_str.endswith('.md'):
                ver_str = ver_str[:-3]
            ver = ver_str.replace('-', '.')
            changelog_files.append((ver, os.path.join(changelogs_dir, f)))
            
    if not changelog_files:
        return None, None
        
    def semver_key(item):
        parts = []
        for p in item[0].split('.'):
            try:
                parts.append(int(p))
            except ValueError:
                parts.append(p)
        return parts
        
    changelog_files.sort(key=semver_key, reverse=True)
    return changelog_files[0]

def get_last_release_tag():
    try:
        tag = subprocess.check_output(['git', 'describe', '--tags', '--abbrev=0']).decode().strip()
        return tag
    except (subprocess.CalledProcessError, FileNotFoundError):
        return '1.0.0'

def copy_files(dest_dir):
    pkg_dir = os.path.join(dest_dir, RESOURCE_NAME)
    os.makedirs(pkg_dir, exist_ok=True)
    
    items_to_copy = [
        'bridge',
        'client',
        'config',
        'docs',
        'html',
        'packs',
        'schema',
        'server',
        'shared',
        'sql',
        'ui',
        'README.md',
    ]
    
    base_ignore = shutil.ignore_patterns(
        'node_modules',
        '*.tsbuildinfo',
        '*.pyc',
        '__pycache__',
        '*.py',
        '.env',
        '.env.*',
        '.DS_Store',
        'Thumbs.db',
        'marketing',
        'changelogs',
        'shots',
        'exports',
        '*workflow*.md',
        '*WORKFLOW*.md',
    )

    def ignore_func(directory, names):
        skip = set(base_ignore(directory, names))
        norm_dir = os.path.normpath(directory)
        if norm_dir == '.' or norm_dir == '':
            skip.update(n for n in names if n.lower().endswith('.md') and n != 'README.md')
        return skip

    for item in items_to_copy:
        if os.path.exists(item):
            target_path = os.path.join(pkg_dir, item)
            if os.path.isdir(item):
                shutil.copytree(item, target_path, ignore=ignore_func)
            else:
                shutil.copy2(item, target_path)

def modify_manifest(dest_dir, version):
    manifest_path = os.path.join(dest_dir, RESOURCE_NAME, 'fxmanifest.lua')
    shutil.copy2('fxmanifest.lua', manifest_path)
    
    with open(manifest_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    content = re.sub(r"\bversion\s+['\"].*?['\"]", f"version '{version}'", content)
    
    with open(manifest_path, 'w', encoding='utf-8') as f:
        f.write(content)

def sync_ui_package_version(dest_dir, version):
    pkg_json_path = os.path.join(dest_dir, RESOURCE_NAME, 'ui', 'package.json')
    if os.path.exists(pkg_json_path):
        try:
            with open(pkg_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            data['version'] = version
            with open(pkg_json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
                f.write('\n')
        except Exception as e:
            print(f"Warning: could not update ui/package.json version: {e}")

def create_zip(source_dir, output_filename):
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, source_dir)
                zipf.write(filepath, arcname)

def generate_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    digest = h.hexdigest()
    filename = os.path.basename(filepath)
    with open(f'{filepath}.sha256', 'w', encoding='utf-8') as f:
        f.write(f'{digest}  {filename}\n')
    return digest

def main():
    latest_version, changelog_path = get_latest_changelog()
    new_release = False
    changelog_content = ""
    
    if latest_version:
        new_release = True
        version = latest_version
        with open(changelog_path, 'r', encoding='utf-8') as f:
            changelog_content = f.read()
    else:
        version = get_last_release_tag()
        changelog_content = f"Release {version}"
        
    print(f"Target Version: {version}")
    print(f"New Release: {new_release}")
    
    build_dir = 'build_release'
    shutil.rmtree(build_dir, ignore_errors=True)
    
    copy_files(build_dir)
    modify_manifest(build_dir, version)
    sync_ui_package_version(build_dir, version)
    
    zip_ver = f'{RESOURCE_NAME}-v{version}.zip'
    zip_plain = f'{RESOURCE_NAME}.zip'
    
    for z in [zip_ver, zip_plain]:
        if os.path.exists(z):
            os.remove(z)
        if os.path.exists(f'{z}.sha256'):
            os.remove(f'{z}.sha256')
            
    create_zip(build_dir, zip_ver)
    shutil.copy2(zip_ver, zip_plain)
    
    generate_sha256(zip_ver)
    generate_sha256(zip_plain)
    
    shutil.rmtree(build_dir)
    
    notes_header = (
        f"Download `{zip_plain}` or `{zip_ver}` below and extract the `{RESOURCE_NAME}` folder into your server's `resources` directory.\n\n"
        f"### Latest Release Permalink\n"
        f"- [`{zip_plain}`](https://github.com/OsmFX-Mods/{RESOURCE_NAME}/releases/latest/download/{zip_plain})\n\n"
        f"---\n\n"
    )
    
    with open('release_notes.md', 'w', encoding='utf-8') as f:
        f.write(notes_header + changelog_content)
        
    if 'GITHUB_OUTPUT' in os.environ:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f"version={version}\n")
            f.write(f"new_release={str(new_release).lower()}\n")

    print(f"Successfully packaged {zip_plain} and {zip_ver}")

if __name__ == '__main__':
    main()
