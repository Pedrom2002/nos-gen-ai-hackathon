# Lethe brand ad (30 s)

Output: `../lethe-brand-30s.mp4`, 1920×1080, 30 fps.

A 30-second English ad for large companies, styled with the website's brand in its default dark theme. Voiceover, music and the opening clip were generated with ElevenLabs.

Script:

> Every day, your company moves thousands of documents full of personal data. Lethe finds every name, every ID, every account number... and makes it disappear. One API. Every client, every team, at any scale. Documents stay in memory, never in a database. Built to run on your own infrastructure. Every redaction checked, explained, and auditable. Lethe. Share the document. Not the person.

Style:

- Colours from `submission/frontend/src/styles.css`: background `#121212`, cards `#181818`, primary `#5fa7ff`, success `#24a965`, and the entity category colours for detected values.
- Arial and JetBrains Mono, 6 px corners, no gradients.
- The privacy section shows a document passing through memory and coming out masked, with the link to a database cut.
- The opening clip (`assets/heroA.mp4`, ElevenLabs `bytedance-seedance-v2.5`) shows floating document cards whose blue lines dissolve into particles, with nothing in the centre.
- The end card uses the motion of the site's `IntroAnimation`. The wordmark is revealed left to right with `clip-path` (1.5 s, `cubic-bezier(.6,.05,.3,1)`, .15 s delay). It then settles smaller above the tagline in 1 s (`cubic-bezier(.65,0,.25,1)`). The tagline is timed to the voiceover (26.7 s and 28.1 s).

## Rebuild

Needs ffmpeg, Node and `playwright-core` (point `PW` at its `index.mjs` if it is installed outside this folder).

```bash
mkdir -p assets/heroA && ffmpeg -i assets/heroA.mp4 -vf "fps=30,scale=1920:1080:flags=lanczos" -q:v 3 assets/heroA/%04d.jpg
./build.sh
node render.mjs video silent.mp4
./mix.sh silent.mp4 ../lethe-brand-30s.mp4
```
