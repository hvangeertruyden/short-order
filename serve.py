#!/usr/bin/env python3
"""Tiny dev server for Short Order: like `python3 -m http.server`, but tells the
browser never to cache, so edits to the JS/CSS show up on a normal reload."""
import http.server, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer.allow_reuse_address = True
print(f'Short Order running at http://localhost:{PORT}')
http.server.ThreadingHTTPServer(('', PORT), NoCache).serve_forever()
