#!/usr/bin/env python3
"""Inline all sources into one self-contained offline HTML file."""
import pathlib
SRC = pathlib.Path(__file__).parent / 'src'
OUT = pathlib.Path(__file__).parent
r = lambda n: (SRC / n).read_text(encoding='utf-8')

CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; frame-src blob:; object-src blob:; base-uri 'none'; form-action 'none'"

def page(title, css, js):
    return f'''<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Offline only: this policy blocks every network request (no internet, no CDN, no tracking). -->
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{title}</title>
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<script>
{js}
</script>
</body>
</html>
'''

common_js = r('icons.js') + '\n' + r('ui.js') + '\n' + r('markdown.js') + '\n' + r('compare-engine.js') + '\n' + r('compare-ui.js')
css = r('common.css') + '\n' + r('viewer.css') + '\n' + r('sfcc.css')
compare_js = common_js + '\n' + r('compare-app.js')
(OUT / 'Compare.html').write_text(page('Compare', css, compare_js), encoding='utf-8')
print('built Compare.html')
