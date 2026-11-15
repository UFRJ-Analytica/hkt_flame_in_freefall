"""Minimal read-only reader for legacy Excel 97-2003 (.xls, BIFF8) workbooks, standard library only.

The SAME "Analyzed Data" spreadsheets are BIFF8 files inside an OLE2 compound document; the project has no xlrd and this
phase may not install dependencies. Only what the SAME files need is implemented: sheet names, numbers (NUMBER, RK,
MULRK, cached FORMULA results), shared and inline strings (SST with CONTINUE, LABELSST, LABEL, STRING) and booleans.
Formats, styles, merged cells and charts are ignored; embedded chart substreams are skipped. Cells come back as
{(row, col): value} with 0-based indices; a formula whose cached result is an error or empty is not reported (no value
is invented for it).
"""
from __future__ import annotations

import struct
from pathlib import Path

FREE, END_OF_CHAIN = 0xFFFFFFFF, 0xFFFFFFFE


class XlsError(ValueError):
    pass


def _ole_stream(data: bytes, names: tuple[str, ...] = ('Workbook', 'Book')) -> bytes:
    if data[:8] != bytes.fromhex('D0CF11E0A1B11AE1'):
        raise XlsError('não é um documento OLE2 (.xls BIFF8)')
    sector_shift, mini_shift = struct.unpack_from('<HH', data, 30)
    size, mini_size = 1 << sector_shift, 1 << mini_shift
    n_fat, first_dir, _, mini_cutoff, first_minifat, n_minifat, first_difat, n_difat = struct.unpack_from('<IIIIIIII', data, 44)

    def sector(index: int) -> bytes:
        start = (index + 1) * size
        return data[start:start + size]

    difat = list(struct.unpack_from('<109I', data, 76))
    next_difat = first_difat
    for _ in range(n_difat):
        block = sector(next_difat)
        values = struct.unpack(f'<{size // 4}I', block)
        difat.extend(values[:-1])
        next_difat = values[-1]
    fat: list[int] = []
    for index in difat[:n_fat]:
        if index not in (FREE, END_OF_CHAIN):
            fat.extend(struct.unpack(f'<{size // 4}I', sector(index)))

    def chain(start: int, table: list[int], read, limit: int) -> bytes:
        out, seen, index = [], set(), start
        while index not in (END_OF_CHAIN, FREE) and len(out) < limit:
            if index in seen or index >= len(table):
                raise XlsError('cadeia de setores corrompida')
            seen.add(index)
            out.append(read(index))
            index = table[index]
        return b''.join(out)

    directory = chain(first_dir, fat, sector, len(fat) + 1)
    entries = []
    for offset in range(0, len(directory), 128):
        raw = directory[offset:offset + 128]
        if len(raw) < 128:
            break
        name_len = struct.unpack_from('<H', raw, 64)[0]
        name = raw[:max(name_len - 2, 0)].decode('utf-16-le', errors='replace')
        kind = raw[66]
        start, length = struct.unpack_from('<IQ', raw, 116)
        entries.append((name, kind, start, length & 0xFFFFFFFF))
    root = next((entry for entry in entries if entry[1] == 5), None)
    if root is None:
        raise XlsError('documento OLE2 sem entrada raiz')
    ministream = chain(root[2], fat, sector, len(fat) + 1)[:root[3]]
    minifat: list[int] = []
    if n_minifat:
        minifat = list(struct.unpack(f'<{(n_minifat * size) // 4}I', chain(first_minifat, fat, sector, n_minifat)[:n_minifat * size]))
    for name, kind, start, length in entries:
        if kind == 2 and name in names:
            if length < mini_cutoff:
                stream = chain(start, minifat, lambda i: ministream[i * mini_size:(i + 1) * mini_size], len(minifat) + 1)
            else:
                stream = chain(start, fat, sector, len(fat) + 1)
            return stream[:length]
    raise XlsError('fluxo Workbook não encontrado (formato anterior ao BIFF8?)')


def _records(stream: bytes, start: int = 0):
    position = start
    while position + 4 <= len(stream):
        kind, length = struct.unpack_from('<HH', stream, position)
        yield position, kind, stream[position + 4:position + 4 + length]
        position += 4 + length


def _rk(value: int) -> float:
    if value & 2:
        number = float(value >> 2 if not value & 0x80000000 else (value >> 2) - (1 << 30))
    else:
        number = struct.unpack('<d', struct.pack('<Q', (value & 0xFFFFFFFC) << 32))[0]
    return number / 100 if value & 1 else number


class _Pieces:
    """Concatenated SST payload that remembers the CONTINUE boundaries (where a new flags byte may appear)."""

    def __init__(self, parts: list[bytes]):
        self.data = b''.join(parts)
        self.bounds, total = [], 0
        for part in parts[:-1]:
            total += len(part)
            self.bounds.append(total)
        self.pos = 0

    def take(self, count: int) -> bytes:
        chunk = self.data[self.pos:self.pos + count]
        self.pos += count
        return chunk

    def _next_bound(self) -> int:
        from bisect import bisect_right
        index = bisect_right(self.bounds, self.pos)
        return self.bounds[index] if index < len(self.bounds) else len(self.data)

    def string(self) -> str:
        cch = struct.unpack('<H', self.take(2))[0]
        flags = self.take(1)[0]
        runs = struct.unpack('<H', self.take(2))[0] if flags & 0x08 else 0
        ext = struct.unpack('<I', self.take(4))[0] if flags & 0x04 else 0
        wide, remaining, out = bool(flags & 0x01), cch, []
        while remaining > 0 and self.pos < len(self.data):
            if self.pos in self.bounds:
                # Character data continued in a CONTINUE record restarts with its own flags byte.
                wide = bool(self.take(1)[0] & 0x01)
            width = 2 if wide else 1
            count = min(remaining, (self._next_bound() - self.pos) // width)
            if count <= 0:
                break
            out.append(self.take(count * width).decode('utf-16-le' if wide else 'latin-1'))
            remaining -= count
        self.take(4 * runs + ext)
        return ''.join(out)


def _unicode(payload: bytes, offset: int, length_bytes: int) -> str:
    cch = payload[offset] if length_bytes == 1 else struct.unpack_from('<H', payload, offset)[0]
    flags = payload[offset + length_bytes]
    start = offset + length_bytes + 1
    if flags & 0x08:
        start += 2
    if flags & 0x04:
        start += 4
    if flags & 0x01:
        return payload[start:start + 2 * cch].decode('utf-16-le', errors='replace')
    return payload[start:start + cch].decode('latin-1')


def read_workbook(path: Path | str) -> dict[str, dict[tuple[int, int], object]]:
    """{sheet name: {(row, col): value}} for every worksheet (charts and macro sheets skipped)."""
    stream = _ole_stream(Path(path).read_bytes())
    sheets: list[tuple[int, str]] = []
    sst: list[str] = []
    for position, kind, payload in _records(stream):
        if kind == 0x0085:
            offset, visibility, sheet_type = struct.unpack_from('<IBB', payload, 0)
            if sheet_type == 0:
                sheets.append((offset, _unicode(payload, 6, 1)))
        elif kind == 0x00FC:
            parts = [payload[8:]]
            for _, next_kind, next_payload in _records(stream, position + 4 + len(payload)):
                if next_kind != 0x003C:
                    break
                parts.append(next_payload)
            unique = struct.unpack_from('<I', payload, 4)[0]
            pieces = _Pieces(parts)
            for _ in range(unique):
                if pieces.pos >= len(pieces.data):
                    break
                sst.append(pieces.string())
        elif kind == 0x000A:
            break
    workbook = {}
    for offset, name in sheets:
        cells: dict[tuple[int, int], object] = {}
        depth, pending = 0, None
        for _, kind, payload in _records(stream, offset):
            if kind == 0x0809:
                depth += 1
                continue
            if kind == 0x000A:
                depth -= 1
                if depth <= 0:
                    break
                continue
            if depth != 1:
                continue  # embedded chart substream
            if kind == 0x0203:
                row, col = struct.unpack_from('<HH', payload, 0)
                cells[(row, col)] = struct.unpack_from('<d', payload, 6)[0]
            elif kind == 0x027E:
                row, col = struct.unpack_from('<HH', payload, 0)
                cells[(row, col)] = _rk(struct.unpack_from('<I', payload, 6)[0])
            elif kind == 0x00BD:
                row, first = struct.unpack_from('<HH', payload, 0)
                last = struct.unpack_from('<H', payload, len(payload) - 2)[0]
                for index, col in enumerate(range(first, last + 1)):
                    cells[(row, col)] = _rk(struct.unpack_from('<I', payload, 4 + 6 * index + 2)[0])
            elif kind == 0x00FD:
                row, col, _, index = struct.unpack_from('<HHHI', payload, 0)
                if index < len(sst):
                    cells[(row, col)] = sst[index]
            elif kind == 0x0204:
                row, col = struct.unpack_from('<HH', payload, 0)
                cells[(row, col)] = _unicode(payload, 6, 2)
            elif kind == 0x0006:
                row, col = struct.unpack_from('<HH', payload, 0)
                result = payload[6:14]
                if result[6:8] == b'\xff\xff':
                    if result[0] == 0:
                        pending = (row, col)
                    elif result[0] == 1:
                        cells[(row, col)] = bool(result[2])
                    # 2 = error, 3 = empty string: no value reported
                    elif result[0] == 3:
                        cells[(row, col)] = ''
                else:
                    cells[(row, col)] = struct.unpack('<d', result)[0]
            elif kind == 0x0207 and pending is not None:
                cells[pending] = _unicode(payload, 0, 2)
                pending = None
            elif kind == 0x0205:
                row, col, _, value, is_error = struct.unpack_from('<HHHBB', payload, 0)
                if not is_error:
                    cells[(row, col)] = bool(value)
        workbook[name] = cells
    return workbook


def to_rows(cells: dict[tuple[int, int], object]) -> list[list[object]]:
    """Dense row lists (None where a cell is absent), for inspection and CSV export."""
    if not cells:
        return []
    rows = max(r for r, _ in cells) + 1
    cols = max(c for _, c in cells) + 1
    table = [[None] * cols for _ in range(rows)]
    for (row, col), value in cells.items():
        table[row][col] = value
    return table
