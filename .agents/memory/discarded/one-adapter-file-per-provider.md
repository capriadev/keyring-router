# One adapter file per provider

## What was tried

Writing a dedicated adapter file for each provider in the catalog, mirroring the source project where every provider has its own executor class.

## Why it was discarded

The catalog holds 140 providers and 133 of them speak the same protocol. An adapter per provider would repeat the same module more than a hundred times: exactly the duplication the project forbids ("if it repeats, it is a module"), and every protocol fix would become a hundred file change.

## Alternative chosen

One adapter per protocol: a data driven `openai-compatible` adapter configured by the catalog entry, plus dedicated adapters for `claude`, `gemini` and `ollama`. Resolution happens by the catalog `format`, never by provider id.

## Tags

architecture integrations
