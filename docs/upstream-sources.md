# Upstream Sources

This repository keeps EvalScope as its only application foundation. Other projects are either narrow dependencies or product-design references and are not deployed as additional platforms.

| Source | Revision | License boundary | Local use | Modification note |
| --- | --- | --- | --- | --- |
| [modelscope/evalscope](https://github.com/modelscope/evalscope) | `c31f0f9` | Apache-2.0 | Fork foundation: runner, service, web, reports and adapters | Workbench Action layer and Chinese project shell are local extensions |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | `b2ed6435e263caa7a9836303befe0b355e6c0a3b`; no source copied | MIT outside `ee/`, `web/src/ee/` and `worker/src/ee/` | Information architecture and interaction reference only | No enterprise code inspected or imported; local React/Vite components are independently implemented |

Any future source import must add the exact repository, commit, original path, license and local modifications here before merge. A design reference must not be described as a code dependency.
