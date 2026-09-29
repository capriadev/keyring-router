# Features - SDD index

last_id: 5

<!--
One line per feature. Planned features may be registered here without a spec yet (status: pending); a spec is opened when the feature is planned and ready to develop. When a feature is COMPLETE: remove its line here and mark the spec status as completed. SPECS ARE NEVER DELETED - specs/ is a permanent registry, the numbering exists for that. Never reuse an ID; last_id only grows.

Format: #<id> <name> - <one-line summary> [spec: <file>] [status: pending|active|blocked|completed]
-->

#2 Provider catalog with hybrid adapters - adapt the OmniRoute MIT provider registry into the KR contract, one adapter per protocol [spec: 002-provider-catalog.md] [status: active]
#3 OpenAI compatible facade - expose /v1/models, /v1/chat/completions and /v1/messages with protocol translation [spec: 003-openai-facade.md] [status: pending]
#4 Routing - choose among credentials by priority, lockout, quota and fallback chain [spec: 004-routing.md] [status: pending]
#6 kr CLI - run and manage the gateway from one command, as a thin client of the local API [spec: 006-cli.md] [status: pending]
#7 Windows startup service - install, uninstall and status of the gateway as a real Windows service [spec: 007-windows-service.md] [status: pending]
#8 Local UI - minimalist and micro detailed interface with three focused review passes [spec: 008-ui.md] [status: pending]
#5 Encrypted credential secrets - store an api_key encrypted at rest with AES-256-GCM so the cloud providers become usable [spec: 005-credential-secrets.md] [status: pending]
