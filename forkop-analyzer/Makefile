include $(TOPDIR)/rules.mk

PKG_NAME:=forkop-analyzer
PKG_VERSION:=0.3.0
PKG_RELEASE:=1

PKG_MAINTAINER:=MaksSt
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/forkop-analyzer
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=VPN
	TITLE:=Analyzer and benchmark engine for Forkop VPN nodes
	URL:=https://github.com/MaksSt/forkop-analyzer
	DEPENDS:=+forkop +curl +coreutils-timeout +ca-bundle +jsonfilter +ucode +ucode-mod-fs +ucode-mod-uci +rpcd-mod-ucode
	PKGARCH:=all
endef

define Package/forkop-analyzer/description
 Safe, asynchronous VPN-node analysis for Forkop with Clash API latency tests,
 optional isolated sing-box throughput tests, JSON/CSV export and LuCI RPC.
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/forkop-analyzer/conffiles
/etc/config/forkop-analyzer
endef

define Package/forkop-analyzer/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/etc/init.d/forkop-analyzer enable >/dev/null 2>&1 || true
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
exit 0
endef

define Package/forkop-analyzer/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/etc/init.d/forkop-analyzer stop >/dev/null 2>&1 || true
/usr/bin/forkop-analyzer cleanup >/dev/null 2>&1 || true
exit 0
endef

define Package/forkop-analyzer/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/forkop-analyzer $(1)/etc/config/forkop-analyzer

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/forkop-analyzer $(1)/etc/init.d/forkop-analyzer

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/90-forkop-analyzer $(1)/etc/uci-defaults/90-forkop-analyzer

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/forkop-analyzer $(1)/usr/bin/forkop-analyzer
	$(INSTALL_BIN) ./files/usr/bin/forkop-analyzer-scheduler $(1)/usr/bin/forkop-analyzer-scheduler
	$(INSTALL_BIN) ./files/usr/bin/forkop-analyzer-monitor $(1)/usr/bin/forkop-analyzer-monitor

	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/forkop-analyzer $(1)/usr/libexec/forkop-analyzer
	$(INSTALL_BIN) ./files/usr/libexec/forkop-analyzer-worker $(1)/usr/libexec/forkop-analyzer-worker

	$(INSTALL_DIR) $(1)/usr/lib/forkop-analyzer
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/forkop_adapter.uc $(1)/usr/lib/forkop-analyzer/forkop_adapter.uc
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/adapter_cli.uc $(1)/usr/lib/forkop-analyzer/adapter_cli.uc
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/result_store.uc $(1)/usr/lib/forkop-analyzer/result_store.uc
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/monitor.uc $(1)/usr/lib/forkop-analyzer/monitor.uc
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/monitor_store.uc $(1)/usr/lib/forkop-analyzer/monitor_store.uc
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/scoring.sh $(1)/usr/lib/forkop-analyzer/scoring.sh
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/latency.sh $(1)/usr/lib/forkop-analyzer/latency.sh
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/sites.lst $(1)/usr/lib/forkop-analyzer/sites.lst
	$(INSTALL_DATA) ./files/usr/lib/forkop-analyzer/site_fetch.sh $(1)/usr/lib/forkop-analyzer/site_fetch.sh

	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/forkop-analyzer $(1)/usr/share/rpcd/ucode/forkop-analyzer
endef

$(eval $(call BuildPackage,forkop-analyzer))
