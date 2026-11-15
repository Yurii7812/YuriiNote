#!/usr/bin/env python3
"""YuriiNote の録音を、日本語の文字にする（CPU・ローカル。外へは何も送らない）。

使い方（YuriiNote が呼ぶ）:
  python yn_transcribe.py 録音.m4a --model モデルのフォルダ [--glossary 用語.txt] [--threads 4]

出力（標準出力に 1 行 1 つの JSON）:
  {"type": "info", "duration": 秒}
  {"type": "seg", "start": 秒, "end": 秒, "text": "…"}   … 区切りごと（処理しながら出す）
  {"type": "done"}
  {"type": "error", "message": "…"}
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import wave


def say(**o):
    print(json.dumps(o, ensure_ascii=False), flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--model", required=True)
    ap.add_argument("--glossary")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()
    try:
        from faster_whisper import WhisperModel
    except Exception as e:  # 部品が入っていない
        say(type="error", message=f"faster-whisper がありません: {e}")
        return 2
    prompt = None
    if a.glossary and os.path.isfile(a.glossary):
        with open(a.glossary, encoding="utf-8") as f:
            words = [w.strip() for w in f if w.strip()]
        prompt = "、".join(words) or None
    try:
        model = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=max(1, a.threads))
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "audio.wav")
            # どんな形式でも 16kHz モノラル WAV に
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.audio, "-ar", "16000", "-ac", "1", wav], check=True)
            # WAV を自分で読んで、数値の配列で渡す（PyAV を通さない。av の版の違いで読めなくなるのを避ける）
            import numpy as np
            with wave.open(wav, "rb") as w:
                audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
            segments, info = model.transcribe(
                audio, language="ja", beam_size=5, initial_prompt=prompt,
                vad_filter=True, vad_parameters={"min_silence_duration_ms": 500},
                condition_on_previous_text=True,
            )
            say(type="info", duration=info.duration)
            for s in segments:
                t = s.text.strip()
                if t:
                    say(type="seg", start=round(s.start, 2), end=round(s.end, 2), text=t)
        say(type="done")
        return 0
    except Exception as e:
        say(type="error", message=str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
