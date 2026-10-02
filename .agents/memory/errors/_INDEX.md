# Error Index - Keyring Router

Router for conflict/error post-mortems. Add an entry each time you create a file. Keep each file short.

<!--
# <slug> - <one-line problem>
-->

# agent-lane-died-mid-write - a lane that loses authorization leaves the file it was writing truncated
# team-runtime-reset-lost-run - a whole team runtime can be replaced mid-session, taking a queued run with it
# nest-defaulted-param-breaks-compiled-boot - a defaulted constructor parameter in a provider boots under tsx and fails under the compiled build
# browser-panel-cannot-reach-gateway-without-cors - the browser panel sees the gateway as down while curl gets a 200, because the API sends no CORS headers
