# P4-86 SendSpin handoff

## State

- Worktree: `C:\espcontrol-sendspin-support`
- Branch: `sendspin-support`
- Pushed commit: `f2fe7bec` (`Add SendSpin playback support for ESP32-P4-86`)
- Device: P4-86 on COM3, usually `192.168.1.206`
- Build/flash succeeds; normal media and voice still work.
- SendSpin no longer starts fast, but still has audible small dropouts/stutter.

## Committed implementation

- `voice_assistant.yaml`: SendSpin hub/player/source routed through `speaker_source` media pipeline.
- Current SendSpin source: `fixed_delay: 480 microseconds`, task not in PSRAM.
- Pipeline input is 48 kHz, 16-bit stereo; P4 output/AEC stack is 48 kHz, 16-bit mono.
- Mixer, resamplers, and final speaker buffers are 500 ms. Larger 3 s buffers were worse.
- Cover art is suppressed for the internal `voice_media_player`; generator source updated and `--check` passes.

## Evidence / diagnosis

- SendSpin network/source delivery became clean: generally `zero=1`, `partial=0`, notify gaps ~36-46 ms.
- Speaker diagnostics showed no sustained underruns or TX partial writes after startup.
- P4 speaker ring buffer remains near its 48,000-byte/500 ms high-water mark and speaker write `partial` count rises continuously.
- This points below network reception: stereo-to-mono delivery / P4 `esp_audio_stack` drain and timing.
- P4 path uses external `n-IA-hane/esphome-intercom@v2026.6.2`, ES7210/ES8311, shared mic/speaker bus and AEC/TDM reference. It is not equivalent to Voice PE's direct stereo `i2s_audio` speaker.
- Voice PE reference (`C:\tmp\home-assistant-voice-pe`) uses stereo output/mixer, 100 ms speaker buffer, and SendSpin `fixed_delay: 480 microseconds`. That delay is AIC3204-specific, so treat it as experimental on ES8311.

## Already tried

- Large SendSpin/media buffers (up to 3 s): worse/full-buffer behaviour and callback gaps up to ~450 ms.
- Smaller 500 ms buffers: better, not fixed.
- Moving tasks in/out of PSRAM.
- Various pacing/write timeout changes and startup buffering.
- Diagnostic logging while monitoring OTA and COM3; COM monitoring load was ruled out.
- Stereo-to-mono averaging in a local SendSpin component patch: fixed double-speed playback, stutter remains.

## Machine-local diagnostics (not committed)

- Patched installed SendSpin component:
  `C:\Users\Seri Al-Najjar\AppData\Local\Programs\Python\Python313\Lib\site-packages\esphome\components\sendspin\media_source\sendspin_media_source.{cpp,h}`
- Patched cached external audio stack:
  `C:\espcontrol-sendspin-support\builds\.esphome\external_components\a7f2ca8d\esphome\components\esp_audio_stack\`
  (`esp_audio_stack.{cpp,h}`, `audio_pipeline.cpp`)
- These add counters and local downmix behaviour. Do not mistake them for branch code or ship them as-is.

## Next tests, in order

1. Make the committed media pipeline output mono (`num_channels: 1`) and let the framework downmix; first disable the local SendSpin downmix to avoid converting twice.
2. Verify `notify_audio_played` uses source frames, not mono sink bytes. Stereo-to-mono preserves frame count; wrong accounting may drive SendSpin sync corrections and periodic gaps.
3. Compare logs before/after: SendSpin `zero/partial/max_notify_gap`; speaker buffer `avail/high`, `partial`, underrun and TX partial.
4. Test without `fixed_delay: 480 microseconds`, then tune an ES8311/P4-specific delay only after playback is stable.
5. If mono pipeline still stutters, instrument timestamps around `speaker_source` -> resampler -> mixer -> `esp_audio_stack` writes to identify which stage periodically blocks.
6. Larger fallback: dedicated standard I2S media path like Voice PE. High risk because P4 audio shares codec/bus with mic, AEC and TDM reference.

## Useful build command

```powershell
$env:PLATFORMIO_CORE_DIR='C:\pio-espcontrol-sendspin'
$env:PLATFORMIO_SETTING_ENABLE_TELEMETRY='false'
esphome -s firmware_version dev -s espcontrol_component_url file:///C:/espcontrol-sendspin-support -s espcontrol_component_ref HEAD compile builds/esp32-p4-86.yaml
```
