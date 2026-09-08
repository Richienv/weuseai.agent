# ffmpeg stitch — make separate clips read as ONE film

The clips come out of Seedance with slightly different look/exposure. Unify them, then concat with
gentle fades. Two passes: normalize each clip, then concat to a compressed delivery file.

## Pass 1 — normalize every clip (same grade, grain, fps, audio)

Run per clip. Trim to a clean 5.0 s so total length is predictable. The grade (`eq`), `vignette`,
and temporal `noise` are what make all clips feel like one camera; the tiny audio fades kill clicks
at the cuts.

```bash
ffmpeg -y -i v_sN.mp4 -t 5.0 \
  -vf "scale=1920:1080:flags=lanczos,fps=24,eq=contrast=1.06:saturation=1.06:gamma=0.98,vignette=PI/5,noise=alls=5:allf=t" \
  -af "afade=t=in:st=0:d=0.08,afade=t=out:st=4.9:d=0.1,aresample=48000" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -r 24 -c:a aac -b:a 128k v_nN.mp4
```

## Pass 2 — concat with open/close fades, compress for delivery

`concat=n=N` joins them; the global `fade` in/out at the very start and end tops and tails the reel.
Set the fade-out start to `(N × 5.0) − 0.7`. For 6 clips (30.0 s) that's `st=29.3`.

```bash
ffmpeg -y -i v_n1.mp4 -i v_n2.mp4 -i v_n3.mp4 -i v_n4.mp4 -i v_n5.mp4 -i v_n6.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a][3:v][3:a][4:v][4:a][5:v][5:a]concat=n=6:v=1:a=1[v][a];[v]fade=t=in:st=0:d=0.5,fade=t=out:st=29.3:d=0.7[vo]" \
  -map "[vo]" -map "[a]" \
  -c:v libx264 -crf 23 -maxrate 8M -bufsize 16M -preset slow -tune film \
  -pix_fmt yuv420p -r 24 -c:a aac -b:a 128k -movflags +faststart richie_reel.mp4
```

## Notes

- **Hard cuts are correct here.** Shot/reverse-shot grammar (S3 → S5 mirror, S4 standoff) wants
  clean cuts, not dissolves. The unifying grade + grain makes the cuts feel intentional.
- **Film grain inflates bitrate.** A crf 18 grained reel can be ~110 MB; the crf 23 + `-maxrate 8M`
  delivery pass brings 30 s down to ~17–21 MB with no visible loss.
- **QC fast:** pull one frame per beat with `ffmpeg -ss <t> -i reel.mp4 -vframes 1 q.jpg` and tile
  them — catch any broken shot before delivering.
- **Music:** to add a bed, `-i reel.mp4 -i music.mp3 -filter_complex
  "[0:a]volume=0.35[amb];[1:a]volume=0.9[mus];[amb][mus]amix=inputs=2:duration=first[a]"` and map
  `[a]` — ambience ducked under the track.
- **9:16 vertical:** reframe with `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920` per clip
  (nudge the crop x to keep the face centered), then stitch the same way.
