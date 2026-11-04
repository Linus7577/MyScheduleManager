"""Turns lines of Japanese into WAV files, using VOICEVOX Core. Called by generate-voice.mjs.

Reads a JSON list of {"id", "text", "kana"} on stdin, and writes <id>.wav into the folder named by --out.
A line with "kana" uses that spelled-out pronunciation in place of the engine's own reading of the text.
--tools is the folder holding the voice model, the runtime and the dictionary, already unpacked.
"""

import argparse
import json
import pathlib
import sys

from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

parser = argparse.ArgumentParser()
parser.add_argument("--tools", required=True, type=pathlib.Path)
parser.add_argument("--out", required=True, type=pathlib.Path)
parser.add_argument("--style", required=True, type=int)
parser.add_argument("--speed", required=True, type=float)
parser.add_argument("--pitch", required=True, type=float)
parser.add_argument("--intonation", required=True, type=float)
args = parser.parse_args()

runtime = next(args.tools.rglob("voicevox_onnxruntime.dll"))
dictionary = next(path.parent for path in args.tools.rglob("sys.dic"))
model_path = args.tools / "15.vvm"

synthesizer = Synthesizer(Onnxruntime.load_once(filename=str(runtime)), OpenJtalk(str(dictionary)))
with VoiceModelFile.open(str(model_path)) as model:
    synthesizer.load_voice_model(model)

for line in json.load(sys.stdin):
    if line.get("kana"):
        query = synthesizer.create_audio_query_from_kana(line["kana"], args.style)
    else:
        query = synthesizer.create_audio_query(line["text"], args.style)
    query.speed_scale = args.speed
    query.pitch_scale = args.pitch
    query.intonation_scale = args.intonation
    query.pre_phoneme_length = 0.05
    query.post_phoneme_length = 0.2
    (args.out / f"{line['id']}.wav").write_bytes(synthesizer.synthesis(query, args.style))
