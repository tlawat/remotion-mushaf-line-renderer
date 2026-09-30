#!/usr/bin/env python3
"""Align a Quran recitation to word and ayah timeframes, offline, with the Montreal Forced Aligner and
Quran-Lab's Hafs model (development tool, not part of the package).

Model: https://huggingface.co/Quran-Lab/mfa-quran-hafs (Apache-2.0), an MFA 3.4 GMM-HMM acoustic
model trained on ~110 h of recitation with a contextual Hafs pronunciation dictionary. MFA itself only
does *forced* alignment: it times a transcript it is given, and a reciter who pauses and repeats
("... أَنَّ ٱللَّهَ | أَنَّ ٱللَّهَ بَرِىٓءٌۭ ...") says words the canonical text does not contain. So this tool
works in two passes:

1. Span search (repeat detection). The recording is cut in the middle of the reciter's pauses. Each
   phrase is aligned with kalpy (the Kaldi bindings MFA is built on) against a word graph over a
   window of the passage: start at any word (free where the previous phrase ended, at a cost that
   grows with the distance elsewhere), continue forward, stop at any word. The words carry their
   position in the passage, so the best path says which words the phrase holds; a phrase that starts
   before the previous one ended is a repeat. Edge words aligned at under MIN_SECONDS_PER_PHONE per
   phone were squeezed into the phrase by the free start/end and are dropped from it.
   Every repeat or skip is then verified on the two phrases' audio together against a continuous
   reading and against "no new words" (a quiet stretch inside a word, such as a ghunna, can split
   it into two phrases that both claim it); it is kept only when it explains the audio better by
   more than its graph cost.
2. Final alignment. Phrases that simply continue one another are merged into runs (so an energy dip
   inside a word is never a cut), and `mfa align` (the model card's beams 40/160) times every run's
   words. Every occurrence of a repeated word is kept, in audio order.

Output: the package's RecitationTimings (version 1): per ayah `start`/`end`/`complete` and per-word
`words`, seconds relative to the audio; a complete ayah gets its ayah-end marker (the mushaf word after
its last one) held MARKER_HOLD_SECONDS, like tools/qud-aligner.ts.

The text is quran-transcript's Uthmani script (the text the model's dictionary was built from; every
word of the Quran is in the dictionary). Its words match QUL's word positions in every ayah but 37:130.

Environment (conda-forge; MFA needs Kaldi, OpenFst and OpenGrm binaries):
  micromamba create -n mfa-quran -f tools/mfa-environment.yml
  micromamba run -n mfa-quran python tools/align-with-mfa.py \
      --audio public/audio/tawbah.mp3 --surah 9 --out public/audio/tawbah-timings-mfa.json

The model (62 MB) is downloaded from Hugging Face on first use into --model-dir, pinned to a revision
and checked against its SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.request
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

MODEL_REPO = "Quran-Lab/mfa-quran-hafs"
MODEL_REVISION = "8386dceddf0fa816bd7f9b3c0667d992fa34bd36"
MODEL_FILES = {
    "quran_hafs.dict": "58509c23d4465b9c152fa09a3f0f311509f03fbc9e414c9e26aaf859cb487f6c",
    "quran_hafs_acoustic.zip": "d749c212e5c2b237bb9ed6da59e9b739ee6f6b5b7432b5e302a904b9d604b1ef",
}
DEFAULT_MODEL_DIR = Path.home() / ".cache" / "mfa-quran-hafs"

SAMPLE_RATE = 16_000
FRAME_SECONDS = 0.02
# Beams from the model card: multi-second madd phones need a wide search.
BEAM, RETRY_BEAM = 40, 160
# Graph costs (same units as the aligner's scaled log-likelihoods).
REPEAT_COST = 2.0  # a phrase that starts before the previous one ended; + REPEAT_COST_PER_WORD per word further back
REPEAT_COST_PER_WORD = 0.5  # reciters go back a few words, rarely many
SKIP_COST = 6.0  # a phrase that starts after it (the reciter skipped words); + SKIP_COST_PER_WORD each
SKIP_COST_PER_WORD = 0.5
MAX_REPEAT_BACK = 12  # words a phrase may start before the previous phrase's end
# The HMM gives a phone at least 3 frames (30 ms); a word held at under 45 ms per phone was squeezed.
MIN_SECONDS_PER_PHONE = 0.045
MARKER_HOLD_SECONDS = 0.8
# QUL's word positions follow quran-transcript's words everywhere but here (checked over all 6,236 ayat
# against QUL's qpc-v4 words export): QUL writes إِلْ يَاسِينَ as one word.
POSITION_MISMATCHES = {(37, 130)}


def log(message: str) -> None:
    print(f"[mfa] {message}", file=sys.stderr, flush=True)


# --------------------------------------------------------------------------------------------------
# Model, audio, reference text


def fetch_model(model_dir: Path) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    for name, sha256 in MODEL_FILES.items():
        path = model_dir / name
        if not path.exists():
            url = f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{name}"
            log(f"downloading {url}")
            tmp = path.with_suffix(path.suffix + ".part")
            with urllib.request.urlopen(url) as response, open(tmp, "wb") as out:
                shutil.copyfileobj(response, out)
            tmp.rename(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sha256:
            raise SystemExit(f"{path}: SHA-256 {digest} is not the pinned {sha256}; delete it and rerun.")
    return model_dir


def decode_audio(audio: Path, out_wav: Path, ffmpeg: str) -> tuple[np.ndarray, bytes]:
    subprocess.run(
        [ffmpeg, "-v", "error", "-y", "-i", str(audio), "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(out_wav)],
        check=True,
    )
    with wave.open(str(out_wav)) as w:
        pcm = w.readframes(w.getnframes())
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0, pcm


@dataclass(frozen=True)
class RefWord:
    """One word of the reference: an ayah word (`ayah` >= 1) or an intro word (`ayah` == 0, never output)."""

    ayah: int
    position: int
    form: str


def reference_words(surah: int, from_ayah: int, to_ayah: int, intro: list[str]) -> list[RefWord]:
    from quran_transcript import Aya

    words = [RefWord(0, i + 1, w) for i, w in enumerate(intro)]
    for ayah in range(from_ayah, to_ayah + 1):
        if (surah, ayah) in POSITION_MISMATCHES:
            raise SystemExit(
                f"{surah}:{ayah}: quran-transcript and QUL split this ayah into different words, so word ids "
                "cannot be mapped. Align a range that leaves it out."
            )
        for position, form in enumerate(Aya(surah, ayah).get().uthmani_words, 1):
            words.append(RefWord(ayah, position, form))
    return words


def intro_words(surah: int) -> list[str]:
    """The isti'adha in the dictionary's spelling, and the basmala except before 1 and 9. أَعُوذُ is
    quran-transcript's; the rest is 16:98 (فَٱسْتَعِذْ بِٱللَّهِ مِنَ ٱلشَّيْطَـٰنِ ٱلرَّجِيمِ), whose ٱلشَّيْطَـٰنِ
    is the Quranic spelling the dictionary holds."""
    from quran_transcript import Aya

    words = Aya(1, 1).get().istiaatha_uthmani.split()[:1] + Aya(16, 98).get().uthmani_words[-4:]
    if surah not in (1, 9):
        words += Aya(1, 1).get().uthmani_words
    return words


def surah_length(surah: int) -> int:
    from quran_transcript import Aya

    return Aya(surah, 1).get().num_ayat_in_sura


# --------------------------------------------------------------------------------------------------
# Pauses and phrases (pure)


def frame_levels(x: np.ndarray, frame_seconds: float = FRAME_SECONDS) -> np.ndarray:
    frame = int(SAMPLE_RATE * frame_seconds)
    n = len(x) // frame
    rms = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1))
    return 20 * np.log10(rms + 1e-9)


def find_phrases(
    levels_db: np.ndarray,
    total_seconds: float,
    min_pause: float,
    margin_db: float,
) -> tuple[list[tuple[float, float]], float]:
    """Speech between pauses of at least `min_pause` seconds (frames `margin_db` above the 10th
    percentile are speech). Phrases meet in the middle of each pause, so a quiet onset (a weak
    consonant, a ghunna) is never cut off; the aligner's silence model takes the rest of the pause."""
    threshold = float(np.percentile(levels_db, 10) + margin_db)
    speech = levels_db > threshold
    pauses: list[tuple[float, float]] = []
    i, n = 0, len(speech)
    while i < n:
        if speech[i]:
            i += 1
            continue
        j = i
        while j < n and not speech[j]:
            j += 1
        if (j - i) * FRAME_SECONDS >= min_pause:
            pauses.append((i * FRAME_SECONDS, j * FRAME_SECONDS))
        i = j
    phrases: list[tuple[float, float]] = []
    previous_end, cut = 0.0, 0.0
    for start, end in pauses:
        if start - previous_end > 0.3:
            phrases.append((cut, (start + end) / 2))
        previous_end, cut = end, (start + end) / 2
    if total_seconds - previous_end > 0.3:
        phrases.append((cut, total_seconds))
    return phrases, threshold


@dataclass
class Phrase:
    index: int
    begin: float
    end: float
    first: int | None = None  # reference index of the first word, None = no words
    last: int | None = None  # reference index of the last word (inclusive)
    per_frame_likelihood: float | None = None
    dropped: list[int] = field(default_factory=list)  # squeezed edge words removed
    # No words of its own: its audio is the end of the previous phrase's last word(s), split off by a
    # quiet stretch inside a word (see SpanSearch.verify).
    absorbed: bool = False
    verified: str | None = None  # how SpanSearch.verify decided the boundary before this phrase

    @property
    def span(self) -> range:
        return range(0) if self.first is None else range(self.first, self.last + 1)


def drop_squeezed_edges(words: list[tuple[int, float, int]]) -> tuple[list[tuple[int, float, int]], list[int]]:
    """`words` = [(reference index, duration seconds, phone count)] of one phrase, in order. Removes
    edge words held at under MIN_SECONDS_PER_PHONE per phone (keeps at least one word)."""
    kept, dropped = list(words), []

    def squeezed(w: tuple[int, float, int]) -> bool:
        return w[1] < MIN_SECONDS_PER_PHONE * max(1, w[2])

    while len(kept) > 1 and squeezed(kept[-1]):
        dropped.append(kept.pop()[0])
    while len(kept) > 1 and squeezed(kept[0]):
        dropped.append(kept.pop(0)[0])
    return kept, dropped


def run_words(run: list[Phrase]) -> range:
    """The reference indices a run holds, in order."""
    return range(run[0].first, max(p.last for p in run if p.last is not None) + 1)


def start_cost(start: int, expected: int) -> float:
    """Graph cost of a phrase starting at reference index `start` when `expected` continues."""
    if start == expected:
        return 0.0
    if start < expected:
        return REPEAT_COST + REPEAT_COST_PER_WORD * (expected - start - 1)
    return SKIP_COST + SKIP_COST_PER_WORD * (start - expected - 1)


def build_runs(phrases: list[Phrase]) -> list[list[Phrase]]:
    """Consecutive phrases where each starts right after the previous one's last word (or is absorbed
    into it) form one run, one utterance for the final pass; a repeat, a skip or an empty phrase
    starts a new run."""
    runs: list[list[Phrase]] = []
    for phrase in phrases:
        if phrase.absorbed and runs:
            runs[-1].append(phrase)
            continue
        if phrase.first is None:
            continue
        if runs and phrase.first == run_words(runs[-1]).stop:
            runs[-1].append(phrase)
        else:
            runs.append([phrase])
    return runs


# --------------------------------------------------------------------------------------------------
# Pass 1: span search with kalpy


class SpanSearch:
    def __init__(self, model_dir: Path, ref: list[RefWord], work: Path):
        from kalpy.decoder.training_graphs import TrainingGraphCompiler
        from kalpy.fstext.lexicon import LexiconCompiler
        from kalpy.gmm.align import GmmAligner
        from montreal_forced_aligner.models import AcousticModel

        self.ref = ref
        forms = {w.form for w in ref}
        pronunciations: dict[str, list[str]] = {}
        with open(model_dir / "quran_hafs.dict", encoding="utf-8") as f:
            for line in f:
                word, rest = line.rstrip("\n").split("\t", 1)
                if word in forms:
                    pronunciations.setdefault(word, []).append(rest.split("\t")[-1])
        missing = sorted(forms - pronunciations.keys())
        if missing:
            raise SystemExit(f"not in the model's dictionary: {' '.join(missing)}")
        # One lexicon entry per reference position: the path through the graph names positions.
        lexicon_path = work / "positions.dict"
        with open(lexicon_path, "w", encoding="utf-8") as f:
            for i, w in enumerate(ref):
                for pron in pronunciations[w.form]:
                    f.write(f"{self.tag(i)}\t{pron}\n")
        self.model = AcousticModel(model_dir / "quran_hafs_acoustic.zip")
        p = self.model.parameters
        self.lexicon = LexiconCompiler(
            disambiguation=True,  # identical words at two positions are homophones in this lexicon
            silence_probability=p["silence_probability"],
            initial_silence_probability=p["initial_silence_probability"],
            final_silence_correction=p["final_silence_correction"],
            final_non_silence_correction=p["final_non_silence_correction"],
            silence_phone=p["optional_silence_phone"],
            oov_phone=p["oov_phone"],
            position_dependent_phones=p["position_dependent_phones"],
            phones=p["non_silence_phones"],
        )
        self.lexicon.load_pronunciations(lexicon_path)
        self.lexicon.create_fsts()
        self.compiler = TrainingGraphCompiler(self.model.model_path, self.model.tree_path, self.lexicon)
        # The speaker-independent model: no adaptation in this pass.
        self.aligner = GmmAligner(
            self.model.alignment_model_path,
            beam=BEAM,
            retry_beam=RETRY_BEAM,
            acoustic_scale=0.1,
            transition_scale=1.0,
            self_loop_scale=0.1,
            silence_phones=self.lexicon.silence_symbols,
        )

    @staticmethod
    def tag(i: int) -> str:
        return f"w{i:05d}"

    def graph(self, lo: int, hi: int, zero_cost_starts: set[int], expected: int, fixed_start: bool = False):
        """Start at any word of [lo, hi) (free at `zero_cost_starts`; only at `expected` when
        `fixed_start`), go forward, stop anywhere."""
        import pynini
        import pywrapfst

        g = pynini.Fst()
        start = g.add_state()
        g.set_start(start)
        states = {i: g.add_state() for i in range(lo, hi + 1)}
        one = pywrapfst.Weight.one(g.weight_type())
        for i in range(lo, hi):
            if not fixed_start or i == expected:
                cost = 0.0 if i in zero_cost_starts else start_cost(i, expected)
                g.add_arc(start, pywrapfst.Arc(0, 0, pywrapfst.Weight(g.weight_type(), cost), states[i]))
            symbol = self.compiler.word_table.find(self.tag(i))
            g.add_arc(states[i], pywrapfst.Arc(symbol, symbol, one, states[i + 1]))
        for i in range(lo + 1, hi + 1):
            g.set_final(states[i], one)
        return self.compile(pynini.rmepsilon(g))

    def linear_graph(self, indices: list[int]):
        """These words in this order. Not kalpy's compile_fst(): the Kaldi compiler behind it adds a
        subsequential loop to the shared lexicon FST in place, which compile() then trips on."""
        import pynini
        import pywrapfst

        g = pynini.Fst()
        state = g.add_state()
        g.set_start(state)
        one = pywrapfst.Weight.one(g.weight_type())
        for i in indices:
            nxt = g.add_state()
            symbol = self.compiler.word_table.find(self.tag(i))
            g.add_arc(state, pywrapfst.Arc(symbol, symbol, one, nxt))
            state = nxt
        g.set_final(state, one)
        return self.compile(g)

    def compile(self, g):
        """kalpy's TrainingGraphCompiler.compile_fst() for an arbitrary word acceptor."""
        import pynini
        import pywrapfst
        from _kalpy.fstext import (
            VectorFst,
            fst_add_self_loops,
            fst_arc_sort,
            fst_compose_context,
            fst_determinize_star,
            fst_minimize_encoded,
            fst_push_special,
            fst_rm_eps_local,
            fst_rm_symbols,
            fst_table_compose,
        )
        from _kalpy.hmm import make_h_transducer
        from kalpy.fstext.utils import kaldi_to_pynini, pynini_to_kaldi

        compiler = self.compiler
        disambig_in = self.lexicon.disambiguation_symbols
        lg = fst_table_compose(compiler._kaldi_fst, VectorFst.from_pynini(g))
        lg = fst_determinize_star(lg, use_log=True)
        fst_minimize_encoded(lg)
        fst_push_special(lg)
        clg, _, ilabels = fst_compose_context(lg, disambig_in, compiler.tree.ContextWidth(), compiler.tree.CentralPosition())
        fst_arc_sort(clg, sort_type="ilabel")
        h, disambig = make_h_transducer(compiler.tree, compiler.transition_model, ilabels)
        fst = fst_table_compose(h, clg)
        if fst.Start() == pywrapfst.NO_STATE_ID:
            fst = pynini_to_kaldi(pynini.compose(kaldi_to_pynini(h), kaldi_to_pynini(clg)))
        fst_determinize_star(fst, use_log=True)
        fst_rm_symbols(fst, disambig)
        fst_rm_eps_local(fst)
        fst_minimize_encoded(fst)
        fst_add_self_loops(fst, compiler.transition_model, disambig_in, compiler.options.self_loop_scale)
        return fst

    def run(self, wav: Path, spans: list[tuple[float, float]], passage_start: int) -> list[Phrase]:
        from kalpy.data import Segment
        from kalpy.feat.cmvn import CmvnComputer
        from kalpy.utterance import Utterance

        utterances = []
        for begin, end in spans:
            u = Utterance(Segment(str(wav), begin, end, 0), "")
            u.generate_mfccs(self.model.mfcc_computer)
            utterances.append(u)
        # CMVN over the whole recording (one reciter), applied before generate_features(), which
        # only normalises features it computes itself.
        cmvn = CmvnComputer().compute_cmvn_from_features([u.mfccs for u in utterances])
        self.cmvn, self.wav, self.utterances = cmvn, wav, utterances
        for u in utterances:
            u.apply_cmvn(cmvn)

        phrases: list[Phrase] = []
        expected = 0  # reference index the next phrase should start at
        for k, ((begin, end), u) in enumerate(zip(spans, utterances)):
            phrase = Phrase(k, begin, end)
            phrases.append(phrase)
            if expected >= len(self.ref):
                continue
            found = self.search(k, expected, lo=max(0, expected - MAX_REPEAT_BACK),
                                free={expected} | ({passage_start} if expected == 0 else set()))
            if found is None:
                continue
            phrase.first, phrase.last, phrase.dropped, phrase.per_frame_likelihood = found
            expected = max(expected, phrase.last + 1)
        return phrases

    def search(self, k: int, expected: int, lo: int, free: set[int], fixed_start: bool = False):
        """Best span of phrase `k` over the window [lo, ...): (first, last, squeezed, ll/frame), or None."""
        u = self.utterances[k]
        duration = u.segment.end - u.segment.begin
        hi = min(len(self.ref), expected + max(45, math.ceil(duration / 0.2)))
        if lo >= hi:
            return None
        alignment = self.aligner.align_utterance(self.graph(lo, hi, free, expected, fixed_start), u.generate_features(self.model))
        if alignment is None:
            log(f"phrase {k} ({u.segment.begin:.2f}-{u.segment.end:.2f} s) could not be aligned")
            return None
        phones = alignment.generate_ctm(self.aligner.transition_model, self.lexicon.phone_table, 0.01)
        ctm = self.lexicon.phones_to_pronunciations(alignment.words, phones, transcription=True)
        words = [(int(wi.label[1:]), wi.end - wi.begin, len(wi.phones)) for wi in ctm.word_intervals if wi.label.startswith("w")]
        if not words:
            return None
        kept, dropped = drop_squeezed_edges(words)
        return kept[0][0], kept[-1][0], dropped, alignment.likelihood / max(1, alignment.num_frames)

    def score(self, begin: float, end: float, indices: list[int]) -> float | None:
        """Scaled log-likelihood of the audio [begin, end] holding exactly these reference words."""
        from kalpy.data import Segment
        from kalpy.utterance import Utterance

        u = Utterance(Segment(str(self.wav), begin, end, 0), "")
        u.generate_mfccs(self.model.mfcc_computer)
        u.apply_cmvn(self.cmvn)
        alignment = self.aligner.align_utterance(self.linear_graph(indices), u.generate_features(self.model))
        return None if alignment is None else alignment.likelihood * self.aligner.acoustic_scale

    def verify(self, phrases: list[Phrase]) -> None:
        """Every boundary that is not a clean continuation (a repeat or a skip) is tested on the two
        phrases' audio together, read three ways: as detected; as a continuous reading (the best span
        for the phrase that starts right after the previous one, found again with repeats and skips
        ruled out); and as no new words at all (the phrase is the end of the previous phrase's last
        word). A quiet stretch inside a word cuts it in two and each half then claims it, a one-word
        "repeat"; a phrase that sounds like an earlier one ("مِّنَ ٱللَّهِ" / "أَنَّ ٱللَّهَ") can be matched
        to it. The detected reading is kept only when it beats both others by more than the graph
        cost it paid in the span search."""
        previous: Phrase | None = None
        for p in phrases:
            if p.first is None:
                continue
            if previous is None or p.first == previous.last + 1:
                previous = p
                continue
            nxt = previous.last + 1
            penalty = start_cost(p.first, nxt)
            readings: dict[str, tuple[list[int], tuple | None]] = {
                "detected": (list(previous.span) + list(p.span), None),
                "absorbed": (list(previous.span), None),
            }
            if p.last > previous.last:  # the two phrases' words, without the overlap or the gap
                joined = (nxt, p.last, p.dropped, p.per_frame_likelihood)
                readings["joined"] = (list(range(previous.first, p.last + 1)), joined)
            forward = self.search(p.index, nxt, lo=nxt, free={nxt}, fixed_start=True) if nxt < len(self.ref) else None
            if forward is not None:
                readings["continuous"] = (list(range(previous.first, forward[1] + 1)), forward)
            unique: dict[tuple[int, ...], str] = {}
            for name, (indices, _) in readings.items():
                unique.setdefault(tuple(indices), name)  # the joined and the forward reading often agree
            scores = {name: self.score(previous.begin, p.end, list(indices)) for indices, name in unique.items()}
            scores = {name: value for name, value in scores.items() if value is not None}
            if "detected" in scores:
                scores["detected"] -= penalty
            best = max(scores, key=scores.get) if scores else "detected"
            runner_up = max((v for n, v in scores.items() if n != best), default=None)
            margin = f" by {scores[best] - runner_up:.1f}" if runner_up is not None else ""
            if best == "detected":
                p.verified = f"kept{margin}"
                previous = p
            elif best in ("joined", "continuous"):
                first, last, dropped, likelihood = readings[best][1]
                p.verified = f"continuous reading ({best}){margin}"
                p.first, p.last, p.dropped, p.per_frame_likelihood = nxt, last, dropped, likelihood
                previous = p
            else:
                p.verified = f"end of the previous phrase{margin}"
                p.first = p.last = None
                p.absorbed = True


# --------------------------------------------------------------------------------------------------
# Pass 2: mfa align on the runs


def mfa_align(
    runs: list[list[Phrase]],
    ref: list[RefWord],
    pcm: bytes,
    model_dir: Path,
    work: Path,
    jobs: int,
) -> dict[int, list[tuple[float, float, str]] | None]:
    """Word intervals (absolute seconds) per run, None for a run MFA could not align."""
    corpus = work / "corpus" / "reciter"
    corpus.mkdir(parents=True, exist_ok=True)
    out = work / "aligned"
    for r, run in enumerate(runs):
        begin, end = run[0].begin, run[-1].end
        with wave.open(str(corpus / f"run{r:03d}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(pcm[int(begin * SAMPLE_RATE) * 2 : int(end * SAMPLE_RATE) * 2])
        words = [ref[i].form for i in run_words(run)]
        (corpus / f"run{r:03d}.lab").write_text(" ".join(words) + "\n", encoding="utf-8")
    command = [
        "mfa", "align", str(corpus.parent), str(model_dir / "quran_hafs.dict"), str(model_dir / "quran_hafs_acoustic.zip"), str(out),
        "--beam", str(BEAM), "--retry_beam", str(RETRY_BEAM), "--output_format", "json",
        "--clean", "--overwrite", "-j", str(jobs), "-t", str(work / "mfa_tmp"),
    ]
    # MFA 3.4's `align` resets uses_speaker_adaptation before aligning, so this is one pass, no fMLLR.
    log(" ".join(command[:2]) + f" ({len(runs)} runs, beams {BEAM}/{RETRY_BEAM})")
    subprocess.run(command, check=True)
    result: dict[int, list[tuple[float, float, str]] | None] = {}
    for r, run in enumerate(runs):
        path = out / "reciter" / f"run{r:03d}.json"
        if not path.exists():
            path = out / f"run{r:03d}.json"
        if not path.exists():
            result[r] = None
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        offset = run[0].begin
        result[r] = [(b + offset, e + offset, label) for b, e, label in data["tiers"]["words"]["entries"] if label]
    return result


# --------------------------------------------------------------------------------------------------
# Timings (pure)


def round3(seconds: float) -> float:
    return round(seconds * 1000) / 1000


def trim_word_ends(
    occurrences: list[tuple[int, float, float]], levels_db: np.ndarray, threshold: float
) -> list[tuple[int, float, float]]:
    """A word followed by a gap (a pause, the end of a run) keeps its end only as far as the last
    speech frame in it + 50 ms: breath and room decay otherwise attach to the final madd."""
    speech = levels_db > threshold
    ordered = sorted(occurrences, key=lambda o: o[1])
    trimmed = []
    for n, (i, start, end) in enumerate(ordered):
        following = ordered[n + 1][1] if n + 1 < len(ordered) else None
        if following is None or following - end > 0.05:
            a, b = int(start / FRAME_SECONDS), int(end / FRAME_SECONDS)
            voiced = np.nonzero(speech[a:b])[0]
            if len(voiced):
                end = max(start + 0.1, min(end, (a + voiced[-1] + 1) * FRAME_SECONDS + 0.05))
        trimmed.append((i, start, end))
    return trimmed


def build_timings(
    surah: int,
    ref: list[RefWord],
    occurrences: list[tuple[int, float, float]],
    ayah_lengths: dict[int, int],
    *,
    from_ayah: int,
    to_ayah: int | None,
    audio_name: str,
    duration: float,
    source: str,
) -> dict:
    """RecitationTimings v1 from every timed word occurrence (reference index, start, end)."""
    by_ayah: dict[int, list[dict]] = {}
    for i, start, end in occurrences:
        w = ref[i]
        if w.ayah == 0:
            continue
        by_ayah.setdefault(w.ayah, []).append({"id": f"{surah}:{w.ayah}:{w.position}", "start": round3(start), "end": round3(end)})
    numbers = sorted(a for a in by_ayah if a >= from_ayah and (to_ayah is None or a <= to_ayah))
    heard = lambda a: {int(w["id"].split(":")[2]) for w in by_ayah[a]}  # noqa: E731
    # Trailing partial ayat with under half their words heard are the reciter's closing words or
    # whatever followed the passage, aligned to the next ayah; drop them (as the Whisper tool does).
    while to_ayah is None and numbers and len(heard(numbers[-1])) < ayah_lengths[numbers[-1]] / 2:
        dropped = numbers.pop()
        log(f"dropping {surah}:{dropped}: only {len(heard(dropped))} of its {ayah_lengths[dropped]} words heard")
    if not numbers:
        raise SystemExit("no ayah of the passage was aligned")
    ayat = []
    for n, ayah in enumerate(numbers):
        words = sorted(by_ayah[ayah], key=lambda w: (w["start"], w["end"]))
        complete = heard(ayah) == set(range(1, ayah_lengths[ayah] + 1))
        start = words[0]["start"]
        last_end = max(w["end"] for w in words)
        entry = {"ayah": ayah, "start": start, "end": last_end, "complete": complete, "words": words}
        if complete:
            following = [by_ayah[a] for a in by_ayah if a > ayah]
            next_start = min((min(w["start"] for w in ws) for ws in following), default=None)
            marker_end = round3(max(last_end, min(last_end + MARKER_HOLD_SECONDS, next_start if next_start is not None else math.inf)))
            words.append({"id": f"{surah}:{ayah}:{ayah_lengths[ayah] + 1}", "start": last_end, "end": marker_end})
            entry["end"] = marker_end
        ayat.append(entry)
    return {
        "version": 1,
        "surah": surah,
        "audio": audio_name,
        "durationSeconds": round3(duration),
        "source": source,
        "ayat": ayat,
    }


# --------------------------------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--audio", required=True, type=Path)
    ap.add_argument("--surah", required=True, type=int)
    ap.add_argument("--from-ayah", type=int, default=1, help="the first ayah recited (default 1)")
    ap.add_argument("--to-ayah", type=int, help="keep only ayat up to this one (default: whatever was recited)")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--report", type=Path, help="write phrases, spans, repeats and warnings as JSON")
    ap.add_argument("--intro", choices=["auto", "none"], default="auto", help="allow an isti'adha (and a basmala) before the passage")
    ap.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    ap.add_argument("--work", type=Path, help="working directory (default: a temporary one, removed)")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--min-pause", type=float, default=0.3, help="seconds of quiet that end a phrase")
    ap.add_argument("--pause-margin-db", type=float, default=8.0, help="speech threshold above the 10th-percentile level")
    ap.add_argument("--ffmpeg", default="ffmpeg")
    args = ap.parse_args()

    started = time.time()
    surah = args.surah
    last_ayah = surah_length(surah)
    to_ref = min(last_ayah, args.to_ayah + 3) if args.to_ayah else last_ayah
    intro = intro_words(surah) if args.intro == "auto" and args.from_ayah == 1 else []
    ref = reference_words(surah, args.from_ayah, to_ref, intro)
    passage_start = len(intro)
    ayah_lengths = {w.ayah: w.position for w in ref if w.ayah}

    model_dir = fetch_model(args.model_dir)
    work = args.work or Path(tempfile.mkdtemp(prefix="align-with-mfa-"))
    work.mkdir(parents=True, exist_ok=True)
    try:
        x, pcm = decode_audio(args.audio, work / "audio16k.wav", args.ffmpeg)
        duration = len(x) / SAMPLE_RATE
        levels = frame_levels(x)
        spans, threshold = find_phrases(levels, duration, args.min_pause, args.pause_margin_db)
        log(f"{duration:.1f} s of audio, {len(spans)} phrases between pauses (speech above {threshold:.1f} dB)")

        search = SpanSearch(model_dir, ref, work)
        phrases = search.run(work / "audio16k.wav", spans, passage_start)
        search.verify(phrases)
        label = lambda i: "intro" if ref[i].ayah == 0 else f"{surah}:{ref[i].ayah}:{ref[i].position}"  # noqa: E731
        repeats, warnings = [], []
        expected = 0
        for p in phrases:
            if p.first is None:
                what = "no words of its own" if p.absorbed else "no words"
                log(f"phrase {p.index:2d} {p.begin:7.2f}-{p.end:7.2f}  {what}{'  (' + p.verified + ')' if p.verified else ''}")
                continue
            note = ""
            if p.first < expected:
                note = f"  repeat of {label(p.first)}..{label(min(p.last, expected - 1))}"
                repeats.append({"phrase": p.index, "at": round3(p.begin), "from": label(p.first), "to": label(min(p.last, expected - 1))})
            elif p.first > expected and p.first > passage_start:  # leaving out (part of) the optional intro is no skip
                skipped = f"{label(max(expected, passage_start))}..{label(p.first - 1)}"
                note = f"  SKIPPED {skipped}"
                warnings.append(f"phrase {p.index} at {p.begin:.2f} s skips {skipped}")
            if p.dropped:
                note += f"  (squeezed: {' '.join(label(i) for i in sorted(p.dropped))})"
            if p.verified:
                note += f"  [{p.verified}]"
            log(f"phrase {p.index:2d} {p.begin:7.2f}-{p.end:7.2f}  {label(p.first)} .. {label(p.last)}  ll/frame {p.per_frame_likelihood:6.2f}{note}")
            expected = max(expected, p.last + 1)
        likelihoods = [p.per_frame_likelihood for p in phrases if p.per_frame_likelihood is not None]
        median, spread = float(np.median(likelihoods)), float(np.std(likelihoods))
        for p in phrases:
            if p.per_frame_likelihood is not None and p.per_frame_likelihood < median - 3 * spread:
                warnings.append(f"phrase {p.index} at {p.begin:.2f} s fits poorly (ll/frame {p.per_frame_likelihood:.2f}, median {median:.2f}): check it")

        runs = build_runs(phrases)
        aligned = mfa_align(runs, ref, pcm, model_dir, work, args.jobs)
        occurrences: list[tuple[int, float, float]] = []
        for r, run in enumerate(runs):
            indices = list(run_words(run))
            intervals = aligned.get(r)
            if intervals is None or len(intervals) != len(indices):
                raise SystemExit(f"run {r} ({run[0].begin:.2f}-{run[-1].end:.2f} s): mfa align returned {None if intervals is None else len(intervals)} words for {len(indices)}")
            for i, (begin, end, label_) in zip(indices, intervals):
                if label_ != unicodedata.normalize("NFC", ref[i].form):  # MFA normalises its text to NFC
                    raise SystemExit(f"run {r}: word {label(i)} came back as {label_}")
                occurrences.append((i, begin, end))
        occurrences = trim_word_ends(occurrences, levels, threshold)

        elapsed = time.time() - started
        timings = build_timings(
            surah, ref, occurrences, ayah_lengths,
            from_ayah=args.from_ayah, to_ayah=args.to_ayah, audio_name=args.audio.name, duration=duration,
            source=f"align-with-mfa.py, {MODEL_REPO}@{MODEL_REVISION[:7]} (MFA, beams {BEAM}/{RETRY_BEAM}), "
            f"{len(spans)} phrases, {len(runs)} runs, {len(repeats)} repeats",
        )
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(timings, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        for a in timings["ayat"]:
            ids = [w["id"] for w in a["words"]]
            twice = sorted({i for i in ids if ids.count(i) > 1}, key=lambda i: int(i.split(":")[2]))
            log(f"{surah}:{a['ayah']:<3} {a['start']:7.2f} - {a['end']:7.2f}  {'complete' if a['complete'] else 'partial'} ({len(ids)} words{', repeated: ' + ' '.join(twice) if twice else ''})")
        for w in warnings:
            log(f"warning: {w}")
        log(f"wrote {args.out} in {elapsed:.0f} s")
        if args.report:
            args.report.write_text(json.dumps({
                "elapsedSeconds": round(elapsed, 1),
                "phrases": [{"index": p.index, "begin": round3(p.begin), "end": round3(p.end),
                             "from": None if p.first is None else label(p.first), "to": None if p.last is None else label(p.last),
                             "absorbed": p.absorbed, "verified": p.verified,
                             "perFrameLikelihood": p.per_frame_likelihood, "squeezed": [label(i) for i in p.dropped]} for p in phrases],
                "runs": [[p.index for p in run] for run in runs],
                "repeats": repeats,
                "warnings": warnings,
            }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    finally:
        if not args.work:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
