# Security

This project handles subscription URLs and generated Clash/Mihomo YAML files. Treat both as sensitive.

Do not publish:

- `config.json`
- subscription URLs
- generated YAML files under `out/` or `uploads/`
- SSH private keys
- `known_hosts`

The Web UI binds to `127.0.0.1` by default. Do not expose it to a public network unless you add your own authentication and access controls.

If you find a security issue, please open a GitHub security advisory or contact the maintainer privately.

