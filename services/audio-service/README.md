# Audio Service

Future service for local music, ambience, and stinger playback control.

The first version should not generate music during live turns. It should pick from a local audio library, start and stop loops, crossfade between scene moods, and play one-shot stingers for events such as reveals, traps, critical hits, and combat transitions.

Planned responsibilities:

- map scene audio cues to local files by tags
- start, stop, loop, and fade music/ambience
- play stingers once without interrupting the turn loop
- keep local audio files outside Git
- expose playback status to the GM dashboard
- allow GM override, mute, pause, and manual track selection

Default audio playback should come from the GM host machine. Phone playback can be explored later, but synchronized multi-device browser audio is not part of the first implementation.
