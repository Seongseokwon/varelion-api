# Last Gate room service

`LastGateModule` is the two-player signaling and input relay for **Emberhold: The Last Gate**.
The server owns room membership and the run seed, but it does not simulate combat.

## Connection

- Socket.IO namespace: `/last-gate`
- Transport: WebSocket only
- Authentication: guest reconnect token issued per room slot
- Protocol version: `1`
- Allowed browser origins: comma-separated `CORS_ORIGIN`

Railway currently limits a WebSocket request to 15 minutes. Clients must reconnect and emit
`room:resume` with the issued reconnect token. The room service should run as one Railway replica
until shared room state and a Redis adapter are introduced.

## Client events

| Event         | Payload                         | Purpose                                         |
| ------------- | ------------------------------- | ----------------------------------------------- |
| `room:create` | `{ protocolVersion }`           | Create a room and occupy player slot 1          |
| `room:join`   | `{ roomCode, protocolVersion }` | Join an existing room as player slot 2          |
| `room:resume` | `{ roomCode, reconnectToken }`  | Restore a disconnected slot                     |
| `input:relay` | `{ tick, sequence, input }`     | Relay one deterministic input frame to the peer |

## Server events

| Event            | Payload                                            | Purpose                            |
| ---------------- | -------------------------------------------------- | ---------------------------------- |
| `room:session`   | room code, run seed, slot, reconnect token, status | Result of create/join/resume       |
| `room:state`     | room and player connection snapshot                | Broadcast membership changes       |
| `input:remote`   | input frame plus sender slot                       | Peer input for the lockstep buffer |
| `input:accepted` | `{ tick, sequence }`                               | Sender acknowledgement             |
| `exception`      | `{ code }`                                         | Protocol or room error             |

Input relay is capped at 120 messages per second per socket. One input object may contain at most
16 primitive fields. Game clients should normally bundle or send at most one frame per simulation
tick. Room operations are capped at 10 per minute per socket. A waiting room expires when no guest
joins within three minutes. A room whose players are all disconnected is retained for two minutes
for reconnection. Expired rooms are swept every 30 seconds and opportunistically during room
operations and status reads.

## HTTP status

`GET /last-gate/status` returns the protocol version and the number of in-memory rooms. It is a
diagnostic endpoint and does not expose room codes or reconnect tokens.

## Current persistence boundary

Rooms are held in process memory. A deploy or process restart ends active rooms. Multiple Railway
replicas are not supported in this phase because they would have independent room maps. Shared
state, desync recovery, and durable reconnection are M1.5-4 work.
