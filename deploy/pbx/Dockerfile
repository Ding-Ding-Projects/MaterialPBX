FROM debian:12.11-slim

# Let systemd apply its container-specific execution path instead of
# misclassifying Docker Desktop's WSL2 kernel as the host environment.
ENV container=docker

ARG FREEPBX_INSTALLER_COMMIT=b023b8426786a518d25dfc0d11ba0c0314fcd927
ARG FREEPBX_INSTALLER_SHA256=afef5e4b480cf545b2035f92068dc2fdd32452989d170a16a84acb6e37b7d564

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates curl systemd systemd-sysv dbus gosu jq passwd util-linux \
 && groupadd --system --gid 991 materialpbx-socket \
 && install -d -m 0755 /usr/local/libexec \
 && curl --fail --location --proto '=https' --tlsv1.2 \
      "https://raw.githubusercontent.com/FreePBX/sng_freepbx_debian_install/${FREEPBX_INSTALLER_COMMIT}/sng_freepbx_debian_install.sh" \
      --output /usr/local/libexec/freepbx17-install.sh \
 && echo "${FREEPBX_INSTALLER_SHA256}  /usr/local/libexec/freepbx17-install.sh" | sha256sum --check --strict - \
 && chmod 0755 /usr/local/libexec/freepbx17-install.sh \
 && ln -s /var/lib/asterisk/bin/fwconsole /usr/local/bin/fwconsole \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /usr/sbin/policy-rc.d

COPY deploy/pbx/materialpbx-firstboot.sh /usr/local/libexec/materialpbx-firstboot.sh
COPY deploy/pbx/materialpbx-configure-integrations.sh /usr/local/libexec/materialpbx-configure-integrations.sh
COPY deploy/pbx/materialpbx-helper-probe.mjs /usr/local/libexec/materialpbx-helper-probe.mjs
COPY services/freepbx-module/ /usr/src/materialpbx-freepbx-module/
COPY deploy/pbx/materialpbx-firstboot.service /etc/systemd/system/materialpbx-firstboot.service
COPY deploy/pbx/materialpbx-privileged-helper.service /etc/systemd/system/materialpbx-privileged-helper.service
COPY deploy/pbx/mariadb-container.conf /etc/systemd/system/mariadb.service.d/materialpbx-container.conf
COPY deploy/pbx/redis-container.conf /etc/systemd/system/redis-server.service.d/materialpbx-container.conf
RUN chmod 0755 /usr/local/libexec/materialpbx-firstboot.sh /usr/local/libexec/materialpbx-configure-integrations.sh /usr/local/libexec/materialpbx-helper-probe.mjs \
 && chmod 0644 /etc/systemd/system/materialpbx-firstboot.service /etc/systemd/system/materialpbx-privileged-helper.service \
      /etc/systemd/system/mariadb.service.d/materialpbx-container.conf /etc/systemd/system/redis-server.service.d/materialpbx-container.conf \
 && systemctl enable materialpbx-firstboot.service \
 && systemctl mask systemd-logind.service getty.target console-getty.service

STOPSIGNAL SIGRTMIN+3
VOLUME ["/var/lib/mysql", "/etc/asterisk", "/var/lib/asterisk", "/var/spool/asterisk", "/var/www", "/var/lib/materialpbx"]
ENTRYPOINT ["/sbin/init"]
