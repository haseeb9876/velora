"""Install verified official Tailscale binaries inside this project only."""
import hashlib, io, json, platform, tarfile, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
arch={'x86_64':'amd64','aarch64':'arm64'}.get(platform.machine())
if not arch:raise SystemExit('Unsupported architecture for this helper.')
base='https://pkgs.tailscale.com/stable/'
with urllib.request.urlopen(base+'?mode=json',timeout=30) as r:metadata=json.load(r)
name=metadata['Tarballs'][arch]
if '/' in name:raise SystemExit('Unexpected package name.')
with urllib.request.urlopen(base+name+'.sha256',timeout=30) as r:expected=r.read().decode().strip().split()[0]
with urllib.request.urlopen(base+name,timeout=90) as r:archive=r.read()
if hashlib.sha256(archive).hexdigest()!=expected:raise SystemExit('Package checksum mismatch.')
target=root/'.tools'/'tailscale';target.mkdir(parents=True,exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
    for binary in ('tailscale','tailscaled'):
        member=next(m for m in tar.getmembers() if m.isfile() and Path(m.name).name==binary)
        (target/binary).write_bytes(tar.extractfile(member).read())
        (target/binary).chmod(0o755)
print('Installed verified Tailscale',metadata['Version'],'in',target)
