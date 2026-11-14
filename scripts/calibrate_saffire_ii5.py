"""Sample mapped SAFFIRE II SIBAL frames and estimate cell transitions."""
import argparse
from collections import defaultdict
from hashlib import file_digest
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import median_filter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('images', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sample', type=int, choices=(5, 6), default=5)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    index = {}
    archives = []
    camera = f'S{args.sample}C1'
    calibration = {
        5: ((16, 619, 44, 157), (22, 114), 20, 144, 2.1),
        6: ((48, 690, 102, 214), (22, 98), 25, 114, 2.6),
    }
    registration, window, flow, duration, published_speed = calibration[args.sample]
    for path in sorted(args.images.glob(f'*{camera}*Mapped*.zip')):
        with path.open('rb') as stream:
            archives.append({'name': path.name, 'sha256': file_digest(stream, 'sha256').hexdigest()})
        archive = ZipFile(path)
        for entry in archive.infolist():
            match = re.search(rf'Mapped_{camera}-(\d{{13}})\.jpe?g$', entry.filename, re.I)
            if match:
                stamp = int(match[1])
                previous = index.setdefault(stamp, (archive, entry))
                if previous[1].CRC != entry.CRC:
                    raise ValueError(f'Conflicting frames at {stamp}')
    if not index:
        parser.error(f'Nenhum quadro mapeado de {camera} encontrado nos ZIPs.')
    times = np.array(sorted(index))
    base = times[0]
    # Visible bright fabric edges in the pre-ignition mapped image.
    left, right, top, bottom = registration
    x = np.arange(left+6, right-5)
    candidates_read = 0
    frames = []
    for second in range(window[0], window[1] + 1, 2):
        target = base + second*1000
        candidates = times[np.abs(times-target) <= 350]
        best = None
        for timestamp in candidates[::3]:
            archive, entry = index[int(timestamp)]
            with Image.open(BytesIO(archive.read(entry))) as im:
                image = np.asarray(im.convert('RGB'), dtype=np.int16)
            candidates_read += 1
            roi = image[top:bottom, left:right]
            score = float(np.mean(roi[:, :, 1] - roi[:, :, 0] > 35))
            if best is None or score > best[0]:
                best = score, int(timestamp), image
        frames.append((second, best if best and best[0] > .06 else None))

    sheet = Image.new('RGB', (1300, 800))
    draw = ImageDraw.Draw(sheet)
    results = {}
    for dy in (20, 10):
        centres = [(lo + min(lo+dy,50))/2 for lo in range(0,50,dy)]
        ys = np.rint(top+(bottom-top)*np.array(centres)/50).astype(int)
        observations = []
        for n, (second, selected) in enumerate(frames):
            points, timestamp = [None]*len(ys), None
            if selected:
                _, timestamp, image = selected
                for i, y in enumerate(ys):
                    profile = median_filter(np.median(image[y-2:y+3,x,1],axis=0), size=9)
                    light, dark = np.percentile(profile,[90,15])
                    if light < 95 or light-dark < 55:
                        continue
                    lit = profile >= dark+.43*(light-dark)
                    for k in np.flatnonzero(lit[:-1] & ~lit[1:])+1:
                        if 14 <= k <= len(lit)-14 and lit[:k].mean() >= .9 and (~lit[k:]).mean() >= .9:
                            points[i] = float((right-x[k])*290/(right-left))
                            break
                if dy == 10 and n % 7 == 0:
                    thumb = Image.fromarray(image.astype(np.uint8)).crop((0, max(0, top-25), image.shape[1], bottom+12))
                    d = ImageDraw.Draw(thumb)
                    for y, mm in zip(ys,points):
                        if mm is not None:
                            cx = right-mm*(right-left)/290
                            cy = y - max(0, top-25)
                            d.ellipse((cx-3,int(cy)-3,cx+3,int(cy)+3),fill='magenta')
                    thumb.thumbnail((650,180))
                    ox, oy = (n//7%2)*650, (n//7//2)*200
                    sheet.paste(thumb,(ox,oy))
                    draw.text((ox+8,oy+179),f'{(timestamp-base)/1000:.2f} s',fill='white')
            observations.append({'timeS':second,'timestampMs':timestamp,'frontMm':points})
        results[str(dy)] = analyze(observations)
    sheet.save(args.output/'review.jpg')
    product = {'experiment':f'SAFFIRE II-{args.sample}','camera':camera,'imagesInArchive':len(times),
               'decodedCandidates':candidates_read,'requestedSlots':len(frames),'stepSeconds':2,
               'registrationPx':[left,right,top,bottom],'gridLengthMm':10,'resultsByWidthMm':results}
    (args.output/'results.json').write_text(json.dumps(product,indent=2),encoding='utf-8', newline='\n')
    primary = results['20']
    transitions, exposures = primary['fit']['all']
    error, speed = primary['holdoutSimulationMaEMmAndSpeedMmS']
    artifact = {
        'schemaVersion': 1, 'experimentId': f'PSI-99:t0:r{args.sample+1}', 'status': 'ready',
        'sourceUrl': 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-99',
        'camera': camera, 'direction': 'concurrent', 'material': 'SIBAL',
        'conditions': {'flowCmS': flow, 'oxygenPctApprox': 22.1, 'thicknessMm': 0.37},
        'grid': {'lengthMm': 290, 'widthMm': 50, 'dxMm': 10, 'dyMm': 20, 'columns': 29, 'rows': 3},
        'stepSeconds': 2, 'durationSeconds': duration, 'probability': transitions/exposures,
        'train': {'transitions': transitions, 'exposures': exposures},
        'sampling': {**{key: product[key] for key in ('imagesInArchive', 'decodedCandidates',
                                                     'requestedSlots', 'registrationPx')},
                     'acceptedFrames': primary['acceptedFrames'], 'coverage': primary['coverage'],
                     'windowS': window, 'holdoutStartsS': primary['holdoutStartsS']},
        'validation': {'seedCount': 20, 'comparableRows': primary['comparableRows'],
                       'observedSpeedMmS': primary['holdoutObservedMmS'],
                       'simulatedSpeedMmS': speed, 'positionMaeMm': error},
        'reportedSpeedMmS': published_speed, 'inputArchives': archives,
    }
    (args.output/f'psi-99-ii{args.sample}.json').write_text(json.dumps(artifact, indent=2)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps({**product,'resultsByWidthMm':{
        dy:{k:v for k,v in result.items() if k != 'observations'} for dy,result in results.items()
    }},indent=2))


def analyze(observations):
    grids = [[None if v is None else min(29,max(0,int((v+5)//10))) for v in o['frontMm']]
             for o in observations]
    split = int((len(grids)-1)*.7)
    counts = [defaultdict(lambda:[0,0]),defaultdict(lambda:[0,0])]
    retreats = jumps = invalid_pairs = 0
    time_blocks = defaultdict(lambda:[0,0])
    for j,(old,new) in enumerate(zip(grids,grids[1:])):
        a,b = (o['timestampMs'] for o in observations[j:j+2])
        if a is None or b is None or abs(b-a-2000)>450:
            invalid_pairs += 1
            continue
        subset = counts[int(j>=split)]
        for y,(was,now) in enumerate(zip(old,new)):
            if was is None or now is None or not 0 < was < 29:
                continue
            if now < was:
                retreats += 1
                continue
            moved = int(now>was)
            jumps += int(now>was+1)
            subset['all'][0] += moved
            subset['all'][1] += 1
            if j<split:
                time_blocks[j//5][0] += moved
                time_blocks[j//5][1] += 1
            above = old[y-1] if y>0 else 0
            below = old[y+1] if y+1<len(old) else 0
            if above is not None and below is not None:
                entry=subset[f'1{int(above>was)}{int(below>was)}']
                entry[0] += moved
                entry[1] += 1
    blocks=np.array(list(time_blocks.values()))
    rng=np.random.default_rng(1951)
    boot=blocks[rng.integers(len(blocks),size=(5000,len(blocks)))].sum(axis=1)
    p=counts[0]['all'][0]/counts[0]['all'][1]
    reserved=grids[split:]
    rows = [y for y in range(len(grids[0])) if all(frame[y] is not None for frame in reserved)]
    seconds=np.arange(len(reserved))*2
    truth=np.array([[frame[y]*10 for y in rows] for frame in reserved])
    speed=float(np.polyfit(seconds,truth.mean(axis=1),1)[0])
    runs=[]
    for seed in range(1951, 1971):
        fronts = truth[0].copy()
        steps = [fronts.copy()]
        for _ in reserved[1:]:
            for i, front in enumerate(fronts):
                if front < 290:
                    seed = (1664525 * seed + 1013904223) & 0xffffffff
                    if seed / 2**32 < p:
                        fronts[i] += 10
            steps.append(fronts.copy())
        steps = np.array(steps)
        runs.append([np.abs(truth-steps).mean(),np.polyfit(seconds,steps.mean(axis=1),1)[0]])
    return {'acceptedFrames':sum(any(v is not None for v in row) for row in grids),
            'coverage':sum(v is not None for row in grids for v in row)/(len(grids)*len(grids[0])),
            'holdoutStartsS':observations[split]['timeS'],'fit':dict(counts[0]),'holdout':dict(counts[1]),
            'retreatsExcluded':retreats,'multiCellAdvances':jumps,'invalidTimePairs':invalid_pairs,
            'fitBlockBootstrap95':np.quantile(boot[:,0]/boot[:,1],[.025,.975]).tolist(),
            'holdoutObservedMmS':speed,'holdoutSimulationMaEMmAndSpeedMmS':np.mean(runs,axis=0).tolist(),
            'comparableRows':len(rows),'observations':observations}


if __name__ == '__main__':
    main()
