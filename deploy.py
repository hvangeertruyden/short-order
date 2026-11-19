#!/usr/bin/env python3
"""Stamp every game file with a version so browsers fetch the newest copy
right after a deploy (GitHub Pages tells browsers to cache files for 10 min).

Run this before committing:   python3 deploy.py
It rewrites the <!-- version --> block in index.html: the stylesheet link, the
main script, and an import-map entry per JS module, all with ?v=<fingerprint>.
"""
import hashlib, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

files = sorted(['css/style.css'] + [os.path.join('js', f) for f in os.listdir('js') if f.endswith('.js')])
h = hashlib.sha1()
for f in files:
    h.update(f.encode()); h.update(open(f, 'rb').read())
v = h.hexdigest()[:10]

html = open('index.html').read()
html = re.sub(r'href="css/style\.css(\?v=[^"]*)?"', f'href="css/style.css?v={v}"', html)
html = re.sub(r'src="js/main\.js(\?v=[^"]*)?"', f'src="js/main.js?v={v}"', html)

entries = ',\n'.join(f'        "./{f}": "./{f}?v={v}"' for f in files if f.endswith('.js'))
block = (
    '<script type="importmap">\n'
    '    { "imports": {\n'
    '        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",\n'
    '        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",\n'
    f'{entries}\n'
    '    } }\n'
    '  </script>'
)
html, n = re.subn(r'<script type="importmap">.*?</script>', block, html, count=1, flags=re.S)
if n != 1:
    raise SystemExit('could not find the import map in index.html')
open('index.html', 'w').write(html)
print(f'stamped {len(files)} files with v={v}')
