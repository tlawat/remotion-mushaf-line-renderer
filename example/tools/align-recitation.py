#!/usr/bin/env python3
"""Align a Quran recitation to word and ayah timeframes (development tool, not part of the package).

Pipeline: energy-based pause detection -> Whisper (sherpa-onnx, offline ONNX) on every speech
segment with token timestamps -> dynamic-programming alignment of the recognised words to the known
reference text -> timings JSON with one entry per ayah and per word (the ayah-number marker gets the
end of its ayah). Anything the reciter says outside the reference (isti'adha, repeats) is skipped.

Usage:
  python3 align-recitation.py --audio tawbah.mp3 --reference tawbah-9-1-13.json \
      --model sherpa-onnx-whisper-medium --out ../public/audio/tawbah-timings.json [--ffmpeg PATH]
"""
import argparse, difflib, json, math, os, re, subprocess, sys, tempfile, wave

import numpy as np
import sherpa_onnx

TASHKEEL = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
NON_ARABIC = re.compile(r"[^ء-ي]")


def normalize(word):
    w = TASHKEEL.sub("", word)
    w = w.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ٱ", "ا").replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return NON_ARABIC.sub("", w)


def similarity(a, b):
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def load_audio(path, ffmpeg):
    """Decode to 16 kHz mono float32 with ffmpeg."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    subprocess.run([ffmpeg, "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", tmp.name], check=True)
    with wave.open(tmp.name) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    os.unlink(tmp.name)
    return sr, x


def pauses_of(x, sr, frame_s=0.02, min_pause_s=0.3, margin_db=10.0):
    frame = int(sr * frame_s)
    n = len(x) // frame
    rms = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1))
    db = 20 * np.log10(rms + 1e-9)
    threshold = np.percentile(db, 10) + margin_db
    speech = db > threshold
    out = []
    i = 0
    while i < n:
        if speech[i]:
            i += 1
            continue
        j = i
        while j < n and not speech[j]:
            j += 1
        if (j - i) * frame_s >= min_pause_s:
            out.append((i * frame_s, j * frame_s))
        i = j
    return out, threshold


def segments_of(x, sr, max_s=28.0):
    """Speech segments between pauses; long ones are split at their quietest internal frame."""
    pauses, threshold = pauses_of(x, sr)
    total = len(x) / sr
    bounds = [0.0]
    for a, b in pauses:
        bounds.append((a + b) / 2)
    bounds.append(total)
    segs = []
    for a, b in zip(bounds, bounds[1:]):
        if b - a < 0.25:
            continue
        segs.append([a, b])
    # merge very short segments into their predecessor
    merged = []
    for s in segs:
        if merged and s[1] - s[0] < 0.8:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    # split anything longer than max_s at the quietest point in its middle half
    frame = int(sr * 0.02)
    final = []
    stack = list(merged)
    while stack:
        a, b = stack.pop(0)
        if b - a <= max_s:
            final.append((a, b))
            continue
        lo, hi = int((a + (b - a) * 0.25) * sr), int((a + (b - a) * 0.75) * sr)
        n = (hi - lo) // frame
        rms = np.sqrt(np.mean(x[lo : lo + n * frame].reshape(n, frame) ** 2, axis=1))
        cut = (lo + int(np.argmin(rms)) * frame) / sr
        stack.insert(0, [cut, b])
        stack.insert(0, [a, cut])
    return final, threshold


def recognise(recognizer, x, sr, a, b):
    stream = recognizer.create_stream()
    stream.accept_waveform(sr, x[int(a * sr) : int(b * sr)])
    recognizer.decode_stream(stream)
    r = stream.result
    tokens = list(r.tokens)
    stamps = list(r.timestamps) if r.timestamps else []
    # Whisper tokens are byte-pair pieces; a new word starts at a token beginning with a space.
    words = []
    for k, tok in enumerate(tokens):
        t = stamps[k] if k < len(stamps) else None
        if tok.startswith(" ") or not words:
            words.append({"text": tok.strip(), "t": t})
        else:
            words[-1]["text"] += tok
    words = [w for w in words if normalize(w["text"])]
    # absolute times: token timestamp when available, else spread evenly over the segment
    for i, w in enumerate(words):
        w["start"] = a + w["t"] if w["t"] is not None else a + (b - a) * i / max(1, len(words))
    for i, w in enumerate(words):
        w["end"] = words[i + 1]["start"] if i + 1 < len(words) else b
        w["end"] = min(max(w["end"], w["start"] + 0.05), b)
        w["norm"] = normalize(w["text"])
    return r.text, words


def align(asr_words, ref_words, gap=-0.45, mismatch=-0.6):
    """Global alignment (Needleman-Wunsch); returns ref index -> asr index or None."""
    n, m = len(asr_words), len(ref_words)
    score = np.full((n + 1, m + 1), -np.inf)
    move = np.zeros((n + 1, m + 1), dtype=np.int8)  # 0 diag, 1 up (asr gap), 2 left (ref gap)
    score[0, 0] = 0
    for i in range(1, n + 1):
        score[i, 0] = i * gap
        move[i, 0] = 1
    for j in range(1, m + 1):
        score[0, j] = j * gap
        move[0, j] = 2
    sims = np.zeros((n, m))
    for i in range(n):
        for j in range(m):
            sims[i, j] = similarity(asr_words[i]["norm"], ref_words[j]["norm"])
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sims[i - 1, j - 1]
            diag = score[i - 1, j - 1] + (s if s >= 0.5 else mismatch)
            up = score[i - 1, j] + gap
            left = score[i, j - 1] + gap
            best = max(diag, up, left)
            score[i, j] = best
            move[i, j] = 0 if best == diag else (1 if best == up else 2)
    mapping = [None] * m
    i, j = n, m
    while i > 0 or j > 0:
        mv = move[i, j]
        if i > 0 and j > 0 and mv == 0:
            if sims[i - 1, j - 1] >= 0.5:
                mapping[j - 1] = i - 1
            i, j = i - 1, j - 1
        elif i > 0 and (mv == 1 or j == 0):
            i -= 1
        else:
            j -= 1
    return mapping, sims


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--model", required=True, help="directory with <size>-encoder.int8.onnx, <size>-decoder.int8.onnx, <size>-tokens.txt")
    ap.add_argument("--out", required=True)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    ref = json.load(open(args.reference, encoding="utf-8"))
    surah = int(ref["surah"])
    ref_words = []
    for ayah, text in sorted(((int(k), v) for k, v in ref["ayat"].items())):
        for pos, w in enumerate(text.split(), start=1):
            ref_words.append({"ayah": ayah, "position": pos, "text": w, "norm": normalize(w)})

    size = [f[: -len("-tokens.txt")] for f in os.listdir(args.model) if f.endswith("-tokens.txt")][0]
    enc = os.path.join(args.model, f"{size}-encoder.int8.onnx")
    dec = os.path.join(args.model, f"{size}-decoder.int8.onnx")
    recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=enc, decoder=dec, tokens=os.path.join(args.model, f"{size}-tokens.txt"),
        language="ar", task="transcribe", num_threads=args.threads, enable_token_timestamps=True,
    )

    sr, x = load_audio(args.audio, args.ffmpeg)
    segments, threshold = segments_of(x, sr)
    print(f"[align] {len(x)/sr:.1f} s of audio, {len(segments)} speech segments (silence threshold {threshold:.1f} dB)", file=sys.stderr)

    asr_words = []
    for k, (a, b) in enumerate(segments):
        text, words = recognise(recognizer, x, sr, a, b)
        for w in words:
            w["segment"] = k
        asr_words.extend(words)
        print(f"[align] seg {k:02d} {a:7.2f}-{b:7.2f}  {text.strip()}", file=sys.stderr)

    mapping, sims = align(asr_words, ref_words)
    matched = sum(1 for m in mapping if m is not None)
    last = max((j for j, m in enumerate(mapping) if m is not None), default=-1)
    print(f"[align] matched {matched}/{last + 1} reference words up to {surah}:{ref_words[last]['ayah']}:{ref_words[last]['position']}" if last >= 0 else "[align] nothing matched", file=sys.stderr)

    # Word times: matched words take the recognised times; unmatched ones are interpolated between
    # the nearest matched neighbours; everything is made monotonic.
    recited = ref_words[: last + 1]
    times = [None] * len(recited)
    for j, m in enumerate(mapping[: last + 1]):
        if m is not None:
            times[j] = [asr_words[m]["start"], asr_words[m]["end"]]
    j = 0
    while j < len(recited):
        if times[j] is not None:
            j += 1
            continue
        k = j
        while k < len(recited) and times[k] is None:
            k += 1
        prev_end = times[j - 1][1] if j > 0 else max(0.0, times[k][0] - 0.6 * (k - j))
        next_start = times[k][0] if k < len(recited) else prev_end + 0.6 * (k - j)
        step = (next_start - prev_end) / (k - j)
        for q in range(j, k):
            times[q] = [prev_end + step * (q - j), prev_end + step * (q - j + 1)]
        j = k
    for j in range(1, len(times)):
        if times[j][0] < times[j - 1][1]:
            times[j][0] = times[j - 1][1]
        if times[j][1] < times[j][0] + 0.05:
            times[j][1] = times[j][0] + 0.05

    # Per-ayah match ratio; trailing ayahs with fewer than half of their words recognised are the
    # reciter's closing words or silence aligned to nothing, not recitation, and are dropped.
    by_ayah = {}
    for j, (w, t) in enumerate(zip(recited, times)):
        by_ayah.setdefault(w["ayah"], []).append((w, t, mapping[j] is not None))
    ayah_numbers = sorted(by_ayah)
    ratio = {a: sum(1 for _, _, m in by_ayah[a] if m) / len(ref["ayat"][str(a)].split()) for a in ayah_numbers}
    while ayah_numbers and ratio[ayah_numbers[-1]] < 0.5:
        dropped = ayah_numbers.pop()
        print(f"[align] dropping {surah}:{dropped}: only {ratio[dropped]:.0%} of its words were recognised (trailing noise or closing words)", file=sys.stderr)
    by_ayah = {a: [(w, t) for w, t, _ in by_ayah[a]] for a in ayah_numbers}
    ayat = []
    for idx, ayah in enumerate(ayah_numbers):
        entries = by_ayah[ayah]
        complete = len(entries) == len(ref["ayat"][str(ayah)].split())
        start = entries[0][1][0]
        end = entries[-1][1][1]
        next_start = by_ayah[ayah_numbers[idx + 1]][0][1][0] if idx + 1 < len(ayah_numbers) else None
        marker_end = min(end + 0.8, next_start) if next_start else end + 0.8
        words = [{"id": f"{surah}:{ayah}:{w['position']}", "start": round(t[0], 3), "end": round(t[1], 3)} for w, t in entries]
        if complete:  # the ayah-number marker is the last word of the ayah in the mushaf data
            words.append({"id": f"{surah}:{ayah}:{len(entries) + 1}", "start": round(end, 3), "end": round(marker_end, 3)})
        ayat.append({"ayah": ayah, "start": round(start, 3), "end": round(marker_end if complete else end, 3), "complete": complete, "matchRatio": round(ratio[ayah], 2), "words": words})

    out = {
        "surah": surah,
        "audio": os.path.basename(args.audio),
        "durationSeconds": round(len(x) / sr, 3),
        "source": f"align-recitation.py, whisper {size} via sherpa-onnx, {len(segments)} segments, {matched} of {last + 1} words matched",
        "ayat": ayat,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for a in ayat:
        print(f"[align] {surah}:{a['ayah']:<3} {a['start']:7.2f} - {a['end']:7.2f}  {'complete' if a['complete'] else 'partial'} ({len(a['words'])} words, {a['matchRatio']:.0%} recognised)", file=sys.stderr)
    print(f"[align] wrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
