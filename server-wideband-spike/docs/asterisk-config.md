# Asterisk Config For Wideband Spike

## `http.conf`

```ini
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
```

## `ari.conf`

```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[wideband]
type = user
read_only = no
password = change-me
```

## `extensions.conf`

Add a separate test-only context. Do not replace the existing `AudioSocket()` path.

```ini
[handle-ai-wideband]
exten => _X.,1,NoOp(*** WIDEBAND SPIKE ${EXTEN} ***)
 same => n,Answer()
 same => n,Wait(0.2)
 same => n,Stasis(ai-wideband-spike,${EXTEN})
 same => n,Hangup()
```

Route only a dedicated test DID to this context.

## Notes

- The spike server must be reachable at the host/port configured by `SPIKE_RTP_ADVERTISE_HOST` and the allocated RTP port range.
- `Stasis(ai-wideband-spike,${EXTEN})` passes the DID to the spike app as the first app arg.
- Keep your current production `handle-ai` and `AudioSocket()` context unchanged while testing.
