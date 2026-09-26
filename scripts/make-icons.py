"""Render Velora's geometric V identity to PWA PNGs using the standard library."""
import struct, zlib
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)

def inside(x, y, polygon):
    hit = False
    for i, (ax, ay) in enumerate(polygon):
        bx, by = polygon[i - 1]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit

def create(size, name, maskable=False):
    scale = .8 if maskable else 1
    rows = bytearray()
    left = [(13,17),(24,17),(34,36),(28,48)]
    right = [(40,17),(51,17),(33,51),(24,51)]
    for y in range(size):
        rows.append(0)
        for x in range(size):
            pixels=[]
            for dx,dy in ((.25,.25),(.75,.25),(.25,.75),(.75,.75)):
                px,py=((x+dx)/size*64-32)/scale+32,((y+dy)/size*64-32)/scale+32
                t=min(1,max(0,(px+py)/128))
                color=tuple(round(a+(b-a)*t) for a,b in zip((23,63,55),(12,33,30)))
                if inside(px,py,left): color=(244,255,249)
                if inside(px,py,right):
                    t=min(1,max(0,(py-17)/34))
                    color=tuple(round(a+(b-a)*t) for a,b in zip((179,255,227),(66,199,168)))
                if 18<=px<=45 and 52<=py<=54: color=tuple(round(a*.65+b*.35) for a,b in zip(color,(122,222,187)))
                pixels.append(color)
            rows.extend(round(sum(p[c] for p in pixels)/4) for c in range(3))
    def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    (out/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
create(192,'icon-192.png')
create(512,'icon-512.png')
create(512,'maskable-512.png',True)
