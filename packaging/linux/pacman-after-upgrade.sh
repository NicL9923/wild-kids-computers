#!/bin/bash
# pacman runs post_upgrade, not post_install, on an upgrade, and the new chrome-sandbox arrives
# with mode 0755. This repeats the sandbox helper check from after-install.tpl.
userns_clone=$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)
userns_max=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 0)
if [ -L /proc/self/ns/user ] && [ "$userns_clone" = 1 ] && [ "$userns_max" -gt 0 ]; then
    chmod 0755 '/opt/Wild Kids - Computers/chrome-sandbox' || true
else
    chmod 4755 '/opt/Wild Kids - Computers/chrome-sandbox' || true
fi
