# Third party notices

Keyring Router adapts data and ideas from the projects below. Every adapted file keeps an origin
note, and the full text of each license is reproduced in this file.

## OmniRoute

- Project: OmniRoute (`diegosouzapw/OmniRoute`)
- Used for: the provider catalog data under `apps/backend/src/integrations/catalog/providers/`, read
  from `open-sse/config/providers/registry/<provider>/index.ts` and the provider family files under
  `src/shared/constants/providers/`.
- What was adapted: provider ids, aliases, formats, endpoints, authentication shape, static model
  lists and their capability flags, for the API key, local and no auth families only.
- What was not adapted: browser cookie providers, OAuth providers, CLI identity and fingerprint
  spoofing, harvested free token providers, the MITM proxy and their persistence layer. Those are
  recorded in `.agents/memory/discarded/`.
- Every adapted catalog entry carries a `source` field naming the OmniRoute file it was read from.
- License: MIT, Copyright (c) 2026 diegosouzapw.

```
MIT License

Copyright (c) 2026 diegosouzapw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## free-claude-code

`Alishahryar1/free-claude-code` is licensed AGPL-3.0-only and is used as a reference of behaviour
only. No file, code fragment or data from it is copied, ported or vendored into Keyring Router:
incorporating AGPL-3.0-only code would relicense the whole product.
