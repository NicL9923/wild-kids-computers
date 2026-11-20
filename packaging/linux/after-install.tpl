#!/bin/bash
# The install script for the pacman, deb, and rpm packages: electron-builder 26.18.0's
# after-install.tpl with one change, the sandbox helper check. electron-builder fills in the
# ${...} names.

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Install apparmor profile. (Ubuntu 24+)
# First check if the version of AppArmor running on the device supports our profile.
# This is in order to keep backwards compatibility with Ubuntu 22.04 which does not support abi/4.0.
# In that case, we just skip installing the profile since the app runs fine without it on 22.04.
#
# Install into /etc/apparmor.d whenever the directory exists and the profile parses (including
# chroots and image builds where apparmor_status --enabled returns non-zero), and reload live only
# when AppArmor is active outside a chroot.
apparmor_installed=0
APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
if [ -d /etc/apparmor.d ] && hash apparmor_parser 2>/dev/null; then
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    apparmor_installed=1

    # Updating the current AppArmor profile is not possible and probably not meaningful in a chroot'ed environment.
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && apparmor_status --enabled > /dev/null 2>&1; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# Chromium's sandbox needs unprivileged user namespaces, or else the setuid helper. This script
# runs as root, which can always make a user namespace, so it reads the kernel settings an
# ordinary user is held to instead: unprivileged_userns_clone, which linux-hardened and older
# Debian set to 0, max_user_namespaces, and Ubuntu's apparmor_restrict_unprivileged_userns when
# the AppArmor profile above was not installed.
userns_clone=$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)
userns_max=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 0)
apparmor_restrict=$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)
if [ -L /proc/self/ns/user ] && [ "$userns_clone" = 1 ] && [ "$userns_max" -gt 0 ] && { [ "$apparmor_restrict" != 1 ] || [ "$apparmor_installed" = 1 ]; }; then
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
