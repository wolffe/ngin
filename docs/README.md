# ngin docs

Documentation for NGIN's reusable engine and independent games. During game work,
only the selected game folder is writable; the engine and reference demo are protected.
See [AGENTS.md](../AGENTS.md) and [new-game.md](./new-game.md) for rules and change checks.

**Creator handbook** (prompts, not code): open [index.html](./index.html) or http://localhost:8080/docs/

| Doc                                              | Purpose                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| [index.html](./index.html)                       | What game creators can ask for                             |
| [walking-module.md](./walking-module.md)         | Architecture, boot order, locomotion APIs                  |
| [vehicle-module.md](./vehicle-module.md)         | Jolt wheeled vehicles, enter/exit, towing                  |
| [water-module.md](./water-module.md)             | Buoyancy volumes, pool, boat                               |
| [interaction-module.md](./interaction-module.md) | Look-at actions, carry, inventory                          |
| [glb-module.md](./glb-module.md)                 | GLB load, clone, mesh/box colliders, optional carry        |
| [pbr-module.md](./pbr-module.md)                 | Color-only painterly textures and material loading         |
| [effects-module.md](./effects-module.md)         | Particles, weather, day/night                              |
| [new-game.md](./new-game.md)                     | Start a new game from the template                         |
| [ai-prompt.md](./ai-prompt.md)                   | Copy-paste prompt for AI-assisted game work                |
| [audit-2026-09-08.md](./audit-2026-09-08.md)     | Performance, edge cases, cleanup, and verification results |

Protected reference: [games/sandbox/scripts/sandbox.js](../games/sandbox/scripts/sandbox.js).
Copyable starter: [games/template/index.html](../games/template/index.html) and its complete folder.
Each copied game launches at its own `games/<slug>/` URL; no shared startup edits.
