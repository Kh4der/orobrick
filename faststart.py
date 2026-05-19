"""Minimal MP4 faststart remuxer — moves the moov atom to the front
and rewrites stco/co64 chunk-offset tables so the file still plays.

Usage:  python faststart.py input.mp4 output.mp4
"""
import struct
import sys
import os


def read_atom_header(data, offset):
    """Return (size, type, header_len). size may be 1 (use 64-bit ext size)."""
    if offset + 8 > len(data):
        return None
    size = struct.unpack(">I", data[offset:offset + 4])[0]
    atype = data[offset + 4:offset + 8].decode("ascii", errors="replace")
    header_len = 8
    if size == 1:
        size = struct.unpack(">Q", data[offset + 8:offset + 16])[0]
        header_len = 16
    return size, atype, header_len


def find_top_atoms(data):
    atoms = []
    i = 0
    while i < len(data):
        info = read_atom_header(data, i)
        if not info:
            break
        size, atype, _ = info
        if size <= 0:
            break
        atoms.append((i, size, atype))
        i += size
    return atoms


def find_atoms_recursive(buf, container_types={"moov", "trak", "mdia", "minf", "stbl"}):
    """Walk into known container atoms and yield (path, offset, size, type)."""
    def walk(buf, base_offset, path):
        i = 0
        while i < len(buf):
            info = read_atom_header(buf, i)
            if not info:
                break
            size, atype, hlen = info
            if size <= 0:
                break
            full_path = path + "/" + atype
            yield full_path, base_offset + i, size, atype
            if atype in container_types and i + size <= len(buf):
                yield from walk(buf[i + hlen:i + size], base_offset + i + hlen, full_path)
            i += size

    yield from walk(buf, 0, "")


def shift_stco(moov_bytes, shift):
    """Rewrite stco / co64 chunk-offset tables in `moov_bytes` by +shift bytes."""
    out = bytearray(moov_bytes)
    for path, offset, size, atype in list(find_atoms_recursive(moov_bytes)):
        if atype not in ("stco", "co64"):
            continue
        # stco / co64 atom layout:
        #   header (8 bytes: size, type)
        #   version+flags (4 bytes)
        #   entry_count (4 bytes)
        #   entries: each 4 (stco) or 8 (co64) bytes
        body_start = offset + 8 + 4  # past header + version/flags
        entry_count = struct.unpack(">I", out[body_start:body_start + 4])[0]
        entries_start = body_start + 4
        if atype == "stco":
            for i in range(entry_count):
                p = entries_start + i * 4
                val = struct.unpack(">I", out[p:p + 4])[0]
                struct.pack_into(">I", out, p, val + shift)
        else:  # co64
            for i in range(entry_count):
                p = entries_start + i * 8
                val = struct.unpack(">Q", out[p:p + 8])[0]
                struct.pack_into(">Q", out, p, val + shift)
    return bytes(out)


def faststart(src_path, dst_path):
    with open(src_path, "rb") as f:
        data = f.read()

    atoms = find_top_atoms(data)
    # Locate ftyp, moov, mdat
    ftyp = next((a for a in atoms if a[2] == "ftyp"), None)
    moov = next((a for a in atoms if a[2] == "moov"), None)
    mdat = next((a for a in atoms if a[2] == "mdat"), None)

    if not ftyp or not moov or not mdat:
        raise RuntimeError(f"Missing required atoms. Found: {[a[2] for a in atoms]}")

    moov_offset, moov_size, _ = moov
    mdat_offset, mdat_size, _ = mdat

    if moov_offset < mdat_offset:
        print("moov already before mdat — already faststart. Copying as-is.")
        with open(dst_path, "wb") as f:
            f.write(data)
        return

    moov_bytes = data[moov_offset:moov_offset + moov_size]
    # Moving moov before mdat shifts mdat forward by moov_size.
    new_moov = shift_stco(moov_bytes, moov_size)

    # New file layout: keep everything before mdat, insert moov, then mdat,
    # skipping the original moov location.
    parts = []
    for a_offset, a_size, a_type in atoms:
        if a_type == "moov":
            continue  # we'll add it ourselves
        if a_type == "mdat":
            parts.append(new_moov)  # insert moov right before mdat
            parts.append(data[a_offset:a_offset + a_size])
        else:
            parts.append(data[a_offset:a_offset + a_size])

    with open(dst_path, "wb") as f:
        for p in parts:
            f.write(p)

    print(f"Wrote faststart MP4 to {dst_path}  ({os.path.getsize(dst_path)} bytes)")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "vedio.mp4"
    dst = sys.argv[2] if len(sys.argv) > 2 else "vedio.faststart.mp4"
    faststart(src, dst)
