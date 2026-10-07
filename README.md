# Kana Terror

A retro sci-fi survival horror typing game for JLPT N5. Creatures crawl a dark research station. Each one carries a Japanese word. Type the reading before it reaches the lamp.

Play it at **https://ellisdeeman.github.io/kana-terror/**

It is a static site: no server, no account. Progress, the review queue, and an imported study list stay in this browser (`localStorage` key `kana-terror.v1`).

## How to play

**Enter the station** for a run of seven sectors, or **Endless watch** for a rising horde. The first creature is already moving when the sector name fades. Type into the bar at the bottom. Romaji converts as you type (`ka` → か), and a Japanese keyboard's kana is accepted too.

The reticle locks the creature whose reading matches what you have typed so far. Finish that reading and it dies. The meaning flashes for a moment — that is the lesson. A wrong key is rejected, the combo breaks, and the station heat jumps. Backspace is free.

What reaches you takes health. Heat climbs on its own, faster when something is close, and drains health if it hits the top. Kills vent heat.

| Sector | What crawls |
| --- | --- |
| Docking Ring | Hiragana, the basic 46 |
| Vent Shafts | Voiced kana and yōon. Short ones run |
| Cold Lab | Katakana |
| Specimen Ward | N5 words. Type the reading |
| Armor Bay | N5 kanji. The plate hides the reading |
| Mimic Gallery | English on the creature. Type the Japanese |
| The Core | Subject 09 shifts its word, then a long phrase |

**Pause** stops the station. **SND** mutes music and effects. **Speech** (in the pause menu) reads a kill aloud with the device's Japanese voice. Add the site to the home screen; it caches for offline play.

On a phone the playfield sits above the keyboard. The page does not zoom on focus.

## Romaji

The input is an IME, not a quiz box you submit.

- `ka` → か, `shi`/`si` → し, `chi`/`ti` → ち, `tsu`/`tu` → つ, `fu`/`hu` → ふ
- `kya` → きゃ and the other yōon
- A doubled consonant becomes っ (`gakkou` → がっこう)
- `n` waits, because it might still be な. `nn` or `n'` confirms ん. `nna` → んな, `n'a` → んあ
- `n` before another consonant confirms ん (`kanji` → かんじ)
- A trailing `n` that completes a word ending in ん counts (`kan` kills かん)
- `ー` or a hyphen lengthens the vowel. `koohii` matches コーヒー
- `wo` and `o` both match を

## Spaced repetition

Reviews use [SM-2](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method). A fast kill is quality 5, a slow kill is quality 3, and a creature that reaches you (or a boss word that shifts away) is quality 1. Intervals are 1 day, then 6, then interval × ease. A miss is due again in 20 seconds so it can return during the run.

Spawn weight follows that card. Due and often-missed items come up more. The boost is capped so one card cannot take over the screen.

**Before a study list is imported**, vocab creatures use the full N5 list (ids 0–717), weighted gently from common to less common. 私 is a bit more likely than ワイシャツ. Both can appear.

**After a study list is imported**, vocab creatures are drawn from **every** id in `known`, not only the weak ones. `weak` is a modest extra (×1.6, and still under the same cap). Known words that are not weak stay in the pool.

Kana and kanji sectors always use their own charts. The study list changes which vocabulary hosts spawn.

## Word ids

Vocabulary ids are the JLPT Vocab Quest N5 indexes, **0 through 717**. An id is the index into that app's N5 list (`jp`, `kana`, `en`). Id 250 is コーヒー. The copied list and its licenses are in [data/NOTICE.txt](data/NOTICE.txt).

Kana and kanji ids are the character itself (`あ`, `ア`, `火`), at most 8 characters.

Spoken audio uses the Web Speech API (`ja-JP`). This game does not ship JLPT Vocab Quest's audio clips.

## File formats

The results `source` string lives in one place, `EXPORT_SOURCE` in [js/srs.js](js/srs.js). It is `kana-terror`.

### Import study list

**Import study list** reads the file JLPT Vocab Quest exports. Unknown fields are ignored. `weak` is a subset of `known`: a weak id that is not known is dropped. Ids that are not integers, or are outside 0–717, are skipped. The list does not wipe SM-2 cards.

```json
{
  "app": "jlpt-vocab-quest",
  "v": 1,
  "date": "2026-10-07T12:00:00.000Z",
  "known": [0, 1, 12, 48, 250],
  "weak": [12, 48]
}
```

- `app` is exactly `"jlpt-vocab-quest"` and `v` is `1`.
- `date` is an ISO-8601 timestamp from the study app. This game does not schedule from it.
- `known` and `weak` are arrays of integer indexes into the N5 list.

### Export results

**Export results** downloads answers since the previous export. The line next to the button (`12 results since last export`) is that queue. Answers accumulate across runs and stay in `localStorage` when the tab closes. Another tab sees the same queue. The queue is cleared only after the browser accepts the download. An empty queue does not download a file. One file holds 1–5000 results; anything past 5000 stays queued. SM-2 progress is not cleared. The intended use is one export at the end of the day.

```json
{
  "source": "kana-terror",
  "date": "2026-10-07T12:00:00.000Z",
  "results": [
    { "id": 250, "type": "vocab", "correct": true, "ms": 1800 },
    { "id": "あ", "type": "kana", "correct": false, "ms": 4200 },
    { "id": "火", "type": "kanji", "correct": true, "ms": 2100 }
  ]
}
```

- `source` is exactly `"kana-terror"`.
- `date` is an ISO-8601 timestamp, different on every export. A second export in the same millisecond is bumped by 1 ms.
- `results` has 1 to 5000 objects.
- `id` is an integer word id for `vocab`, or the kana/kanji character (a string of 1–8 characters).
- `type` is `vocab`, `kana`, or `kanji`.
- `correct` is a boolean. A kill is true. A creature that reaches you, or a boss word that changes before you finish it, is false.
- `ms` is an integer from 0 to 3600000. Values outside that range are clamped.

## Develop

```bash
npm test
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`. Tests cover romaji, SM-2, both file formats, the known/weak spawn pool, and a full station run that can be won by typing.

GitHub Actions deploys the repository root to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).

## Art and audio

Sprites, the corridor, the sound effects, and the music loop are original and drawn or synthesized in the page. No characters from other works.
