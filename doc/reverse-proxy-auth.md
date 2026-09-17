# 🔐 Reverse Proxy Sign-in (forward auth)

If Fredy already sits behind an identity-aware reverse proxy (Pangolin, Authelia, Authentik,
oauth2-proxy, Traefik forward-auth) you are signing in twice: once at the proxy, once into Fredy.
Fredy can accept the identity the proxy has already verified instead. **Off by default.**

## How it works

The proxy authenticates the user at the edge and adds a header with the username (`Remote-User` by
convention; Authentik uses `X-authentik-username`). Fredy accepts that header only from the
**trusted proxy addresses** you list, matched against the TCP peer, never against `X-Forwarded-For`,
and, if you configure one, only when a **shared-secret header** matches too.

The name is then mapped onto an **existing** Fredy user with the same username. Nothing is created,
nothing is promoted; an unknown name is ignored and the login form appears as usual. An explicit
session always wins, so nobody is silently switched, and `sessionTTL`, admin checks and MCP tokens
are untouched.

## Setting it up

Under **Administration → System → Reverse proxy sign-in**:

1. Create the Fredy user with the **same username** the proxy will send (e.g. `cedric`).
2. Tick *Accept the identity header from trusted proxies*.
3. Enter the proxy's address(es), single IPs or CIDR ranges. In Docker this is usually the bridge
   network the proxy connects from, e.g. `172.16.0.0/12`; check `docker network inspect`.
4. Leave the header at `Remote-User` unless your proxy uses another name.
5. Optional, recommended on shared networks: pick a header name (e.g. `X-Fredy-Proxy-Secret`) and a
   long random value, and configure the proxy to add that header to every request to Fredy. Fredy
   rejects the identity header when the secret is missing or wrong. The secret is write-only.

> [!WARNING]
> **Only enable this when every path to Fredy goes through the proxy.** Anyone who can reach Fredy
> directly from a trusted address could impersonate any user by setting the header, which is exactly
> why the default is off, the trust list is explicit, and the secret header exists. Logging out of
> Fredy while the proxy still vouches for you signs you straight back in; log out at the proxy.
