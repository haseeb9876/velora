"""Render the project's geometric arrow logo to PNG without dependencies."""
import math, struct, zlib
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)
def distance(x,y,a,b):
    vx,vy=b[0]-a[0],b[1]-a[1]
    t=max(0,min(1,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy)))
    return math.hypot(x-a[0]-t*vx,y-a[1]-t*vy)
def create(size,name,maskable=False):
    scale=.76 if maskable else 1
    points=[((32,18),(32,45)),((20,33),(32,45)),((32,45),(44,33))]
    rows=bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px,py=(x/size*64-32)/scale+32,(y/size*64-32)/scale+32
            d=min(distance(px,py,a,b) for a,b in points)
            coverage=max(0,min(1,(3.1-d)*size/64+.5))
            rows.extend(round(v+(255-v)*coverage) for v in (120,98,217))
    def chunk(t,data): return struct.pack('!I',len(data))+t+data+struct.pack('!I',zlib.crc32(t+data)&0xffffffff)
    (out/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
create(192,'icon-192.png')
create(512,'icon-512.png')
create(512,'maskable-512.png',True)
