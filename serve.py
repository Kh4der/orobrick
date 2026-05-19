"""Tiny zero-cache static server for local dev with HTTP byte-range support.
Range support is REQUIRED for HTML5 <video> streaming — without it the
browser will sit at readyState=0 forever waiting for metadata.
"""
import http.server
import socketserver
import os
import sys
import re

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class RangeNoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler + RFC 7233 byte-range support + no-cache.
    Uses HTTP/1.1 with keep-alive so HTML5 video range requests stay smooth."""

    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_GET(self):
        range_header = self.headers.get("Range")
        if not range_header:
            return super().do_GET()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()

        try:
            size = os.path.getsize(path)
        except OSError:
            return super().do_GET()

        m = re.match(r"bytes=(\d*)-(\d*)", range_header)
        if not m:
            self.send_error(400, "Invalid Range header")
            return

        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":
            # suffix range: last N bytes
            length = int(end_s)
            start = max(0, size - length)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1

        if start >= size or end >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return

        length = end - start + 1
        ctype = self.guess_type(path)

        try:
            with open(path, "rb") as f:
                f.seek(start)
                data = f.read(length)
        except OSError:
            self.send_error(404, "File not found")
            return

        self.send_response(206)  # Partial Content
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionAbortedError):
            pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(("", PORT), RangeNoCacheHandler) as httpd:
    print(f"Serving D:\\orobrick on http://localhost:{PORT} (no-cache, ranges, threaded)")
    httpd.serve_forever()
