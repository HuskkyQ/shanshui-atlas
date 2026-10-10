# 服务器部署记录

验证日期：2026-10-09（北京时间）。部署的是当前本地工作树构建产物，包含未提交的黄山、西湖、独立景点和拙政园更新。

## 访问与状态

- 服务器：`47.102.100.84`。
- 网站地址：`http://47.102.100.84:8082/`。服务器内部、SSH 通道及公网访问均已验证，首页返回 200。
- SSH：`root`，端口 `22`，使用本机密钥认证。服务器没有接收或保存本机私钥。
- 首页 `/`；景观入口 `/?place=huangshan`、`/?place=west-lake`、`/?place=zhuozheng-garden`。

## 服务器文件

- 构建版本：`/var/www/mountains-in-china/releases/20261009-01a11e70`。
- 当前版本软链接：`/var/www/mountains-in-china/current`。
- 独立 Nginx 配置：`/etc/nginx/conf.d/mountains-in-china.conf`。
- 访问日志：`/var/log/nginx/mountains-in-china.access.log`。
- 错误日志：`/var/log/nginx/mountains-in-china.error.log`。
- 部署产物、校验清单及部署前状态：`/var/www/mountains-in-china/deployment/`；该目录不属于网站公开根目录。

Nginx 服务已启用开机启动。firewalld 的 `public` 区域已在运行时和永久配置中放行 `8082/tcp`。用户确认已在阿里云 ECS 安全组放行入方向 TCP 8082，随后公网访问通过。

首页使用 `Cache-Control: no-cache`，带内容哈希的 `/assets/` 文件使用一年缓存。站点只托管 Vite 构建产物，不需要在服务器运行 Node.js 或 Vite 开发服务器。

## 本次验证

- `npm test`：111 项通过，0 失败。
- `npm run build -- --outDir /tmp/mountains-deploy-20261009-01a11e70/dist`：通过。
- 48 个部署文件的 SHA-256 与本地构建一致；经 SSH 通道获取的全部 HTTP 文件也逐一匹配。
- 浏览器经 SSH 通道确认：首页、黄山、西湖、拙政园，以及雷峰塔照片、独立场景进入和返回。返回后保留一个 World canvas；未记录浏览器 error/warn。
- 安全组放行后，浏览器直接从公网确认首页、黄山、西湖和拙政园正常渲染，未记录 error/warn。
- TeslaMate 四个容器及 order-hub 的 ID、启动时间和重启次数与部署前一致，未重启这些容器。
- 原有 `/etc/nginx/nginx.conf` 和 `interviews.conf` 的 SHA-256 未变；8080、8081 仍返回 200。
- 80、4000 在部署前已有 HTTP 连接重置现象，部署后保持相同状态；本次没有修复或修改 TeslaMate。

## 后续更新

本地执行 `npm run build`，将 `dist/` 内容上传至一个新的版本目录，再将 `current` 软链接原子切换到该目录。保留旧版本以便回退；不要覆盖 TeslaMate 或其他站点文件。

如需修改本站 Nginx 配置，先执行 `nginx -t`，通过后执行 `systemctl reload nginx`。站点为纯静态文件，更新 `current` 软链接无需重启 Docker 容器。

本次安全组放行后，已从服务器外访问首页及三个 `?place` 入口，并对公网提供的全部 48 个静态文件逐一校验 SHA-256。
