# 本機測試用伺服器：python serve.py [port]
# 固定 MIME 類型，避免 Windows 登錄檔把 .js 設成錯誤類型導致 App 無法載入
import http.server
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json',
        '.txt': 'text/plain; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
    }


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'念佛機已啟動：http://localhost:{port}/  （關閉此視窗即停止）')
http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
