# Showcase music — credits & provenance

Royalty-free background tracks for Piece Showcase (Keepsake) videos. The catalog
metadata lives in `music_catalog.yml`; these are the hosted lossless assets it
references (stored via git-LFS).

## Attribution (required — keep with any published video)

**Adventures — A Himitsu** (`adventures-a-himitsu.flac`) — CC BY 3.0
> Adventures by A Himitsu https://soundcloud.com/a-himitsu
> Creative Commons — Attribution 3.0 Unported — CC BY 3.0
> Music released by Argofox https://www.audiolibrary.com.co/a-himitsu/adventures
> Music promoted by Audio Library https://youtu.be/MkNeIUgNPQ8

**Good For You — THBD** (`good-for-you-thbd.flac`) — CC BY 3.0
> Good For You by THBD https://soundcloud.com/thbdsultan
> Creative Commons — Attribution 3.0 Unported — CC BY 3.0
> Music promoted by Audio Library https://youtu.be/-K_YSjqKgvQ

**We Are One — Vexento** (`we-are-one-vexento.flac`) — Free with attribution
> We Are One by Vexento https://soundcloud.com/vexento
> https://www.youtube.com/user/Vexento
> Music promoted by Audio Library https://youtu.be/Ssvu2yncgWU

## How these were produced

The only freely obtainable source for these tracks is lossy (YouTube provides an
Opus stream). They are **not** re-mastered or restored — re-encoding cannot
recover detail the source lost. They are stored as FLAC purely to get a
**delay-free, sample-accurate container** for slideshow alignment: MP3/Opus carry
variable encoder delay ("random spacing at the front"), so we decode to PCM,
trim the leading silence, and re-encode losslessly.

Recipe (per track), using `ffmpeg`:

```sh
yt-dlp -f bestaudio -o "<id>.%(ext)s" "https://www.youtube.com/watch?v=<videoId>"
ffmpeg -i "<id>.webm" \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0,aresample=44100" \
  -map_metadata -1 -sample_fmt s16 -c:a flac -compression_level 8 "<id>.flac"
```

- `silenceremove` strips the leading near-silence so every track starts at sample 0.
- 16-bit / 44.1 kHz: the source is lossy, so higher bit depth would only add size.
- `-map_metadata -1`: no embedded tags (attribution lives here and in the catalog).
