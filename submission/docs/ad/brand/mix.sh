#!/bin/sh
# Mix the ElevenLabs voiceover (offset 0.3s) over the music bed, ducking the
# music under the voice, then mux with the silent render.
# Usage: ./mix.sh silent.mp4 out.mp4
set -e
cd "$(dirname "$0")"
ffmpeg -v error -y -i assets/vo.mp3 -i assets/music1.mp3 -filter_complex "\
[0]adelay=300|300,apad=whole_dur=30,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[vo][sc];\
[1]atrim=0:30,volume=0.75,afade=t=out:st=28.6:d=1.4[mu];\
[mu][sc]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=350[duck];\
[vo][duck]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=0:30[a]" \
  -map "[a]" -ar 48000 mix.wav
ffmpeg -v error -y -i "$1" -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$2"
rm mix.wav
