# Features - SDD index

last_id: 13

<!--
One line per feature. Planned features may be registered here without a spec yet (status: pending); a spec is opened when the feature is planned and ready to develop. When a feature is COMPLETE: remove its line here and mark the spec status as completed. SPECS ARE NEVER DELETED - specs/ is a permanent registry, the numbering exists for that. Never reuse an ID; last_id only grows.

Format: #<id> <name> - <one-line summary> [spec: <file>] [status: pending|active|blocked|completed]
-->

#4 Routing - choose among credentials by priority, lockout, quota and fallback chain [spec: 004-routing.md] [status: active]
#8 Local UI - minimalist and micro detailed interface with three focused review passes [spec: 008-ui.md] [status: pending]
#11 Live provider discovery - read the catalog of providers that declare no static models so OpenRouter and peers can be listed [no spec yet] [status: pending]
#12 Fix: audit of the contracts and the transports - close the findings the independent audit proved, with a test per fix [spec: 012-fix-audit-m8-contracts-transports.md] [status: active]
#13 Open audit findings - the residue of both audit passes: H-B7, H-B8, the coverage asymmetry of the wire shapes and the budget constant, plus what no run has covered [spec: 013-open-audit-findings.md] [status: pending]